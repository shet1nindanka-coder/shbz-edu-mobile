// The student's homework and lesson screens: cache merges that must not move the server clock
// (src/screens/student/work/cache.ts, logic.ts). The note of a homework card uses the number screen's editor;
// its rules are tested with note-model.ts (student-study-models.test.ts).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QueryClient } from "@tanstack/query-core";

import { mergeQueryData } from "@/services/query/merge-query-data";
import { secondsUntil } from "@/screens/student/work/logic";
import { serverClockOffset } from "@/domain/server-clock";

type Lesson = { serverNow: string; endsAt: string; closed: number };

const KEY = ["studentWork", "getLiveLesson"];
const RECEIVED_AT = Date.parse("2026-11-16T10:00:07.000Z");
const LESSON: Lesson = { serverNow: "2026-11-16T10:00:00.000Z", endsAt: "2026-11-16T10:30:00.000Z", closed: 0 };

function seeded(): QueryClient {
  const client = new QueryClient();
  // The GET answered at RECEIVED_AT on the device clock, which runs 7 s ahead of the server.
  client.setQueryData<Lesson>(KEY, LESSON, { updatedAt: RECEIVED_AT });
  return client;
}

describe("mergeQueryData", () => {
  it("keeps the timestamp of the response that carried serverNow, so the server clock does not move", () => {
    const client = seeded();
    mergeQueryData<Lesson>(client, KEY, (current) => ({ ...current, closed: 1 }));

    const state = client.getQueryState<Lesson>(KEY);
    assert.equal(state?.data?.closed, 1);
    assert.equal(state?.dataUpdatedAt, RECEIVED_AT);
    // Five and a half minutes into the lesson on the device clock: 24.5 minutes are left, before and after.
    const offset = serverClockOffset(state!.data!.serverNow, state!.dataUpdatedAt);
    assert.equal(offset, -7000);
    const deviceNow = RECEIVED_AT + 5.5 * 60_000;
    assert.equal(secondsUntil(LESSON.endsAt, deviceNow + offset), 24.5 * 60);
  });

  it("a plain setQueryData would stamp the entry with the current time (the defect this helper avoids)", () => {
    const client = seeded();
    client.setQueryData<Lesson>(KEY, (current) => (current ? { ...current, closed: 1 } : current));
    assert.notEqual(client.getQueryState<Lesson>(KEY)?.dataUpdatedAt, RECEIVED_AT);
  });

  it("does not touch the entry when the merge changes nothing", () => {
    const client = seeded();
    let notified = 0;
    const unsubscribe = client.getQueryCache().subscribe(() => {
      notified += 1;
    });
    mergeQueryData<Lesson>(client, KEY, (current) => current);
    unsubscribe();
    assert.equal(notified, 0);
    assert.equal(client.getQueryData<Lesson>(KEY), LESSON);
  });

  it("does nothing when the response is not cached", () => {
    const client = new QueryClient();
    let called = false;
    mergeQueryData<Lesson>(client, KEY, (current) => {
      called = true;
      return current;
    });
    assert.equal(called, false);
    assert.equal(client.getQueryData(KEY), undefined);
  });
});
