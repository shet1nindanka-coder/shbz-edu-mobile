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
import { isNetworkError } from '@/api/errors';
import type { SaveNoteResponse } from '@/api/types';
import { createPendingWritesQueue, type PendingWrite, type PendingWritesQueue, type SubmitOutcome } from '@/services/query';

import { getQueryClient } from './query';
import { getAppRuntime } from './services';

/** What a pending-write handler receives. */
export type PendingWriteContext = { api: ApiClient; queryClient: QueryClient };

let currentUserId: string | null = null;

/** The session provider reports who is signed in; writes of another user are never sent. */
export function setPendingWritesUser(userId: string | null): void {
  currentUserId = userId;
}

let queue: PendingWritesQueue<PendingWriteContext> | null = null;

/** The shared queue, created on first use. */
export function getPendingWrites(): PendingWritesQueue<PendingWriteContext> {
  if (queue) return queue;
  const runtime = getAppRuntime();
  queue = createPendingWritesQueue<PendingWriteContext>({
    storage: runtime.storage,
    getContext: () => ({ api: runtime.api, queryClient: getQueryClient() }),
    getUserId: () => currentUserId,
    isRetryable: isNetworkError,
  });
  registerStudentNoteWrite(queue);
  return queue;
}

// ───────────────────────────── the student's note ─────────────────────────────

/** Kind of the note write; `id` is the `homeworkNumberId`. */
export const STUDENT_NOTE_WRITE = 'studentStudy.saveNumberNote';
export type StudentNotePayload = { note: string };
export type StudentNoteResult = Res<SaveNoteResponse>;

function registerStudentNoteWrite(target: PendingWritesQueue<PendingWriteContext>): void {
  target.register<StudentNotePayload, StudentNoteResult>(STUDENT_NOTE_WRITE, async (write, { api, queryClient }) => {
    const saved = await api.studentStudy.saveNumberNote(write.id, write.payload.note);
    // The note is shown on the number screen and inside a homework.
    void queryClient.invalidateQueries({ queryKey: qk('studentStudy', 'getNumberDetail') });
    void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'getHomework') });
    return saved;
  });
}

/**
 * Saves a note draft: sent now when possible, otherwise kept on the device and sent when the connection
 * returns. `sent` carries the server's normalised note; `rejected` carries the `ApiError` to show.
 */
export function saveStudentNote(homeworkNumberId: string, note: string): Promise<SubmitOutcome<StudentNoteResult>> {
  return getPendingWrites().submit<StudentNotePayload, StudentNoteResult>(STUDENT_NOTE_WRITE, homeworkNumberId, { note });
}

// ───────────────────────────── React binding ─────────────────────────────

/** The write waiting for a connection under `kind + id`, or null. Re-renders when the queue changes. */
export function usePendingWrite<P = unknown>(kind: string, id: string): PendingWrite<P> | null {
  const target = getPendingWrites();
  // The version is the snapshot (a stable number); the entry itself is read during render.
  useSyncExternalStore(target.subscribe, target.version, target.version);
  return target.get<P>(kind, id);
}

/** The student's unsent note draft for a number, or null. */
export function usePendingStudentNote(homeworkNumberId: string): PendingWrite<StudentNotePayload> | null {
  return usePendingWrite<StudentNotePayload>(STUDENT_NOTE_WRITE, homeworkNumberId);
}

/** How many writes are waiting (settings shows it next to the cache info). */
export function usePendingWritesCount(): number {
  const target = getPendingWrites();
  useSyncExternalStore(target.subscribe, target.version, target.version);
  return target.list().length;
}
