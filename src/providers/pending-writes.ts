/**
 * The app's pending-writes queue (see `src/services/query/pending-writes.ts` for the rules) wired to the
 * real services, plus the one kind the shell registers itself: the student's note (02 Q12).
 *
 * Area code adds its own kinds with `pendingWrites.register(kind, handler)` at module scope and sends
 * through `pendingWrites.submit(kind, id, payload)`; `usePendingWrite(kind, id)` shows the waiting state.
 */
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { qk } from '@/api';
import type { ApiClient, Res } from '@/api/client';
import { isSessionExpired } from '@/api/errors';
import type { SaveNoteResponse } from '@/api/types';
import { isOnline } from '@/services/network';
import {
  createPendingWritesQueue,
  isPendingWriteRetryable,
  keepPendingWriteRefusal,
  summarizePendingWrites,
  type PendingWrite,
  type PendingWritesQueue,
  type PendingWritesSummary,
  type SubmitOutcome,
} from '@/services/query';

import { getQueryClient } from './query';
import { getAppRuntime } from './services';

/** What a pending-write handler receives. */
export type PendingWriteContext = { api: ApiClient; queryClient: QueryClient };

let currentUserId: string | null = null;
/** The user whose session expired: their drafts are kept (not sent) until they sign in again. */
let heldUserId: string | null = null;

/** The session provider reports who is signed in; writes of another user are never sent. */
export function setPendingWritesUser(userId: string | null): void {
  currentUserId = userId;
  heldUserId = null;
}

/**
 * The session expired (not a sign-out): nobody may send any more, but the drafts of the user who was signed
 * in — queued ones and those the editors flush while the tree unmounts — stay theirs and are sent when the
 * same user signs in again.
 */
export function holdPendingWritesForExpiredSession(): void {
  heldUserId = currentUserId ?? heldUserId;
  currentUserId = null;
}

/**
 * Automatic re-sends after a failure without an answer while the device is online (a timeout or a server
 * that does not answer brings no reconnect event). Spaced out so a failing server is not hammered.
 */
export const PENDING_WRITES_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000];

let queue: PendingWritesQueue<PendingWriteContext> | null = null;

/** The shared queue, created on first use. */
export function getPendingWrites(): PendingWritesQueue<PendingWriteContext> {
  if (queue) return queue;
  const runtime = getAppRuntime();
  queue = createPendingWritesQueue<PendingWriteContext>({
    storage: runtime.storage,
    getContext: () => ({ api: runtime.api, queryClient: getQueryClient() }),
    getUserId: () => currentUserId,
    getOwnerId: () => heldUserId,
    isRetryable: isPendingWriteRetryable,
    isHeld: isSessionExpired,
    keepRefused: keepPendingWriteRefusal,
    retryDelaysMs: PENDING_WRITES_RETRY_DELAYS_MS,
    isOnline,
  });
  registerStudentNoteWrite(queue);
  // Loaded as soon as the queue exists, on every start path: a draft typed offline must be visible (with
  // its "will be saved" status) after a cold start without a connection, not only once a flush runs.
  void queue.hydrate();
  return queue;
}

// ───────────────────────────── the student's note ─────────────────────────────

/** Kind of the note write; `id` is the `homeworkNumberId`. */
export const STUDENT_NOTE_WRITE = 'studentStudy.saveNumberNote';
export type StudentNotePayload = { note: string };
export type StudentNoteResult = Res<SaveNoteResponse>;

/** The only payload shape of a note write; a stored entry of another shape is dropped when read. */
export function isStudentNotePayload(payload: unknown): payload is StudentNotePayload {
  return typeof payload === 'object' && payload !== null && typeof (payload as { note?: unknown }).note === 'string';
}

function registerStudentNoteWrite(target: PendingWritesQueue<PendingWriteContext>): void {
  target.register<StudentNotePayload, StudentNoteResult>(
    STUDENT_NOTE_WRITE,
    async (write, { api, queryClient }) => {
      const saved = await api.studentStudy.saveNumberNote(write.id, write.payload.note);
      // The note is shown on the number screen and inside a homework.
      void queryClient.invalidateQueries({ queryKey: qk('studentStudy', 'getNumberDetail') });
      void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'getHomework') });
      return saved;
    },
    isStudentNotePayload,
  );
}

/**
 * Saves a note draft: sent now when possible, otherwise kept on the device and sent when the connection
 * returns. `sent` carries the server's normalised note; `rejected` carries the `ApiError` to show (the draft
 * stays in the queue as refused, so it is not lost if the editor goes away).
 */
export function saveStudentNote(homeworkNumberId: string, note: string): Promise<SubmitOutcome<StudentNoteResult>> {
  return getPendingWrites().submit<StudentNotePayload, StudentNoteResult>(STUDENT_NOTE_WRITE, homeworkNumberId, { note });
}

/** Forgets the refused (or waiting) draft of a number: the student has put the saved text back. */
export function discardStudentNote(homeworkNumberId: string): Promise<void> {
  return getPendingWrites().discard(STUDENT_NOTE_WRITE, homeworkNumberId);
}

/** Sends what waits now (the student asked to retry a draft that is already queued). */
export function flushPendingWrites(): void {
  void getPendingWrites().flush();
}

// ───────────────────────────── React binding ─────────────────────────────

/**
 * The signed-in user's write waiting for a connection under `kind + id`, or null. Re-renders when the
 * queue changes. A draft left by another account on this device is never shown (nor sent).
 */
export function usePendingWrite<P = unknown>(kind: string, id: string): PendingWrite<P> | null {
  const target = getPendingWrites();
  // The version is the snapshot (a stable number); the entry itself is read during render.
  useSyncExternalStore(target.subscribe, target.version, target.version);
  const write = target.get<P>(kind, id);
  return write && write.userId === currentUserId ? write : null;
}

/**
 * True while a request for `kind + id` is in flight (sent by any editor or by a flush). A waiting entry that
 * is not being sent is waiting for its next try.
 */
export function usePendingWriteSending(kind: string, id: string): boolean {
  const target = getPendingWrites();
  useSyncExternalStore(target.subscribe, target.version, target.version);
  return target.isSending(kind, id);
}

/** The student's unsent note draft for a number, or null (also for an entry of an unreadable shape). */
export function usePendingStudentNote(homeworkNumberId: string): PendingWrite<StudentNotePayload> | null {
  const write = usePendingWrite<unknown>(STUDENT_NOTE_WRITE, homeworkNumberId);
  return write && isStudentNotePayload(write.payload) ? (write as PendingWrite<StudentNotePayload>) : null;
}

/**
 * The same entry read now, outside render: an editor decides against the queue's CURRENT entry (another
 * editor of the number may have replaced it since the last render).
 */
export function getPendingStudentNote(homeworkNumberId: string): PendingWrite<StudentNotePayload> | null {
  const write = getPendingWrites().get<unknown>(STUDENT_NOTE_WRITE, homeworkNumberId);
  return write && write.userId === currentUserId && isStudentNotePayload(write.payload) ? (write as PendingWrite<StudentNotePayload>) : null;
}

/**
 * How many unsent writes the signed-in user has on this device, refused ones included (signing out deletes
 * them all — the confirmation counts them).
 */
export function usePendingWritesCount(): number {
  const { waiting, refused } = usePendingWritesSummary();
  return waiting + refused;
}

/**
 * Unsent writes split by state: `waiting` ones the queue still sends by itself, `refused` ones it never will
 * (the user re-sends or discards them in their editor). Settings names them apart.
 */
export function usePendingWritesSummary(): PendingWritesSummary {
  const target = getPendingWrites();
  useSyncExternalStore(target.subscribe, target.version, target.version);
  return summarizePendingWrites(target.list(), currentUserId);
}
