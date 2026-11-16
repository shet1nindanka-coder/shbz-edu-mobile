/**
 * Mock realtime: one in-process emitter that every mocked mutation publishes to, behind
 * `shell.subscribeRealtime` (docs/spec/01-shell-auth.md §5, 90-addendum-5 B.2.2, 90-addendum-6 §8).
 *
 * - One underlying "stream" per signed-in user regardless of the number of listeners: opened on the first
 *   subscription, closed after the last unsubscribe and on sign-out.
 * - The handshake can be refused: the connect rate limit (`api:realtime-connect`, 30 / 60 s) and the cap of
 *   two open streams per user (the app's stream + `controls.externalRealtimeConnections[userId]`). A refusal
 *   is reported through `onState`, retried with backoff 5, 10, 20, 40, 60 s and never thrown.
 * - A refused or closed stream delivers nothing although mutations keep publishing.
 * - Delivery applies the site's per-role filter at the moment of delivery.
 */
import type { RealtimeSubscribeOptions } from "@/api/client";
import type { DashboardRealtimeEvent, RealtimeConnectionState, RealtimeEvent } from "@/api/types";
import { REALTIME } from "@/api/types";

import type { MockTimer } from "../clock";
import type { MockUser } from "../store/schema";
import type { MockAuth } from "./auth";
import type { MockCore } from "./core";
import { retryAfterSeconds, type MockLimiter } from "./rate-limit";

/** An event as a mutation publishes it: `occurredAt` is stamped by the emitter. */
export type RealtimeEventInput = RealtimeEvent extends infer E ? (E extends { occurredAt: string } ? Omit<E, "occurredAt"> : never) : never;

type Subscriber = { listener: (event: RealtimeEvent) => void; onState?: (state: RealtimeConnectionState) => void };

export interface MockRealtime {
  /**
   * Publishes an event to the open stream (if any). Call it after every mutation with the event the site
   * publishes for it (01 §5.3): `ctx.emit({ kind: "student-progress-changed", studentId, topicId })`.
   * Delivery is asynchronous (a later microtask), so a listener never runs inside the mutation.
   */
  publish(event: RealtimeEventInput): void;
  /** Implementation of `shell.subscribeRealtime`: synchronous, never throws, returns the unsubscribe function. */
  subscribe(listener: (event: RealtimeEvent) => void, options?: RealtimeSubscribeOptions): () => void;
  /** Must be called when the session token changes (sign-in, sign-out, rotated token): closes / reopens the stream. */
  sessionChanged(): void;
  /** Current connection state (demo screen). */
  state(): RealtimeConnectionState;
  /** Closes the stream and drops every listener and timer (client disposal). */
  dispose(): void;
}

/** The site's `shouldReceiveDashboardRealtimeEvent`, evaluated against the store at delivery time. */
export function shouldReceiveRealtimeEvent(viewer: MockUser, event: DashboardRealtimeEvent, isOwnStudent: (studentId: string) => boolean): boolean {
  if (viewer.role === "DEVELOPER") return true;
  if (event.kind === "connected") return true;
  if (event.kind === "topic-content-changed") return true;
  if (event.kind === "students-changed") return viewer.role === "TEACHER";
  if (viewer.role === "TEACHER") {
    if (event.kind === "lesson-activity") return event.teacherId === viewer.id;
    return isOwnStudent(event.studentId);
  }
  // STUDENT: the three remaining kinds only when the event names this student (a `lesson-activity` without
  // `studentId` is not delivered).
  return event.studentId === viewer.id;
}

export function createRealtime(
  core: MockCore,
  deps: {
    auth: MockAuth;
    limits: MockLimiter;
    /** False while the device is offline: the handshake fails and is retried. */
    isOnline: () => boolean;
    /** Takes a forced error armed for `"shell.subscribeRealtime"` (demo screen), if any. */
    takeForcedHandshakeError: () => "rateLimited" | "serviceUnavailable" | null;
  },
): MockRealtime {
  const { store } = core;
  const subscribers = new Set<Subscriber>();
  let current: RealtimeConnectionState = { status: "closed" };
  /** User the open stream belongs to. */
  let streamUserId: string | null = null;
  let retryTimer: MockTimer | null = null;
  let refusals = 0;
  /** Bumped whenever the stream is torn down, so a late handshake of an older attempt is ignored. */
  let epoch = 0;

  const later = (work: () => void) => {
    void Promise.resolve().then(work);
  };

  const setState = (next: RealtimeConnectionState) => {
    current = next;
    for (const subscriber of Array.from(subscribers)) {
      if (!subscriber.onState) continue;
      try {
        subscriber.onState(next);
      } catch {
        // A listener's failure must not break the stream.
      }
    }
  };

  const clearRetry = () => {
    retryTimer?.cancel();
    retryTimer = null;
  };

  const close = () => {
    epoch += 1;
    clearRetry();
    streamUserId = null;
    refusals = 0;
    if (current.status !== "closed") setState({ status: "closed" });
  };

  const refuse = (code: "tooManyConnections" | "rateLimited" | "serviceUnavailable", waitSeconds: number) => {
    const backoff = REALTIME.reconnectBackoffSeconds;
    const step = backoff[Math.min(refusals, backoff.length - 1)]!;
    refusals += 1;
    // First refusal: the server's Retry-After; each further refusal doubles the wait up to 60 s.
    const wait = Math.max(waitSeconds, step);
    setState({ status: "refused", code, retryAt: new Date(core.now() + wait * 1000).toISOString() });
    clearRetry();
    const attempt = epoch;
    retryTimer = core.clock.setTimeout(() => {
      retryTimer = null;
      if (attempt === epoch && subscribers.size > 0) handshake();
    }, wait * 1000);
  };

  function handshake(): void {
    const user = deps.auth.currentUser();
    if (!user) {
      // No valid session: nothing to connect. The next API call reports `sessionExpired`.
      close();
      return;
    }
    if (!deps.isOnline()) {
      refuse("serviceUnavailable", REALTIME.reconnectBackoffSeconds[0]);
      return;
    }
    const forced = deps.takeForcedHandshakeError();
    if (forced === "serviceUnavailable") {
      refuse("serviceUnavailable", 5);
      return;
    }
    if (forced === "rateLimited") {
      refuse("rateLimited", 30);
      return;
    }
    // A refused connect also consumes a hit of the connect limit, exactly like the site's route.
    const limit = deps.limits.check("api:realtime-connect", user.id);
    if (!limit.allowed) {
      refuse("rateLimited", retryAfterSeconds(limit));
      return;
    }
    const external = store.controls.externalRealtimeConnections[user.id] ?? 0;
    if (external >= REALTIME.maxConnectionsPerUser) {
      refuse("tooManyConnections", 5);
      return;
    }
    refusals = 0;
    streamUserId = user.id;
    // The `connected` frame is swallowed: listeners only learn about it through the state.
    setState({ status: "open", connectedAt: core.nowIso() });
  }

  const connect = () => {
    if (current.status === "open" || current.status === "connecting" || current.status === "refused") return;
    setState({ status: "connecting" });
    const attempt = epoch;
    later(() => {
      if (attempt !== epoch || subscribers.size === 0 || current.status !== "connecting") return;
      handshake();
    });
  };

  return {
    publish(input) {
      const event = { ...input, occurredAt: core.nowIso() } as RealtimeEvent;
      later(() => {
        if (current.status !== "open" || !streamUserId) return;
        const viewer = store.users.get(streamUserId);
        if (!viewer) return;
        const isOwnStudent = (studentId: string) => store.users.get(studentId)?.teacherId === viewer.id;
        if (!shouldReceiveRealtimeEvent(viewer, event, isOwnStudent)) return;
        for (const subscriber of Array.from(subscribers)) {
          try {
            subscriber.listener(event);
          } catch {
            // A listener's failure must not reach the publisher or the other listeners.
          }
        }
      });
    },
    subscribe(listener, options) {
      const subscriber: Subscriber = { listener, onState: options?.onState };
      subscribers.add(subscriber);
      if (subscribers.size === 1 && current.status === "closed") {
        connect();
      } else if (subscriber.onState) {
        // A late subscriber learns the current state of the shared stream.
        const snapshot = current;
        later(() => {
          if (subscribers.has(subscriber)) subscriber.onState?.(snapshot);
        });
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(subscriber);
        if (subscribers.size === 0) close();
      };
    },
    sessionChanged() {
      const user = deps.auth.currentUser();
      if (user && user.id === streamUserId && current.status === "open") return;
      close();
      if (user && subscribers.size > 0) connect();
    },
    state: () => current,
    dispose() {
      subscribers.clear();
      close();
    },
  };
}
