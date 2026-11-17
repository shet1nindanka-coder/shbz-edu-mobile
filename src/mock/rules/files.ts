/**
 * File metadata rules: projections (`FileRef`, `StoredFileRef`), rows for uploads and the read-access check
 * of `GET /files/{fileId}` (docs/spec/09-data-i18n-math.md §5.1, 00 §2.4). The BYTES are not here: the mock
 * `FileService` (src/services/files) maps `sample` to a bundled file and shows a picked file from its own
 * registry — `lookup` below is exactly its `MockFileLookup`.
 *
 * Access: a DEVELOPER reads everything; a TEACHER reads topic files, own uploads and solution photos of own
 * students / of lessons they teach; a STUDENT reads topic theory and homework files and OWN photos only —
 * never an answers file. A missing or not permitted file is the same `404 fileNotFound`; no valid session
 * is `401 sessionExpired` (the site's /files/[fileId] answers 401 without a user), which signs the user out.
 */
import type { FileRef, FileUpload, StoredFileRef } from "@/api/types";
import { canAccessStoredFile } from "@/domain/file-access";

import type { MockFileSample } from "../assets";
import { deleteFileIfUnreferenced } from "../store/cascade";
import type { MockStoredFile, MockUser } from "../store/schema";
import type { MockAuth } from "./auth";
import type { MockCore } from "./core";

/** What the mock `FileService` needs to know about a readable file (its `MockFileLookup` result). */
export type MockFileInfo = {
  mimeType: string;
  originalName: string;
  /** Declared size, bytes. */
  size: number;
  /** The bundled sample that stands in for a fixture file; absent for a file picked on this device. */
  sample?: MockFileSample;
};

/** A file picked in the app, as reported to the device layer so it can keep the bytes under the row's id. */
export type MockUploadedFile = { id: string; uri: string; mimeType: string; originalName: string; size: number };

export interface MockFiles {
  /** The stored row (with the mock storage fields `sample` / `localUri`). */
  get(fileId: string | null | undefined): MockStoredFile | undefined;
  /** `FileRef` of a file id, or null when the id is null / unknown. */
  ref(fileId: string | null | undefined): FileRef | null;
  /** `StoredFileRef` (with `uploadedAt`) of a file id, or null. */
  storedRef(fileId: string | null | undefined): StoredFileRef | null;
  /**
   * Registers a file picked in the app (a topic file, a solution photo): creates the `StoredFile` row that
   * points at the local URI. Validate the upload BEFORE calling (`validateUploadMetadata` from `@/domain`).
   */
  createFromUpload(upload: FileUpload, uploadedById: string): MockStoredFile;
  /**
   * The bytes of a file picked in the app, read through the device hook (`MockFileHooks.readBytes`) so the
   * upload can be checked with `validateUploadedBytes` like the site's `saveUploadedFile`. Null when the
   * content cannot be known (no hook, an unreadable URI, a read error): the byte check is then skipped.
   */
  readUploadBytes(uri: string): Promise<Uint8Array | null>;
  /** Deletes the row when no topic, number, attached photo, check snapshot or lesson submission references it. */
  removeIfUnreferenced(fileId: string | null | undefined): boolean;
  /** Whether the user may read the file's bytes. */
  canRead(user: MockUser, fileId: string): boolean;
  /**
   * The signed-in user's view of a file. Throws `401 sessionExpired` without a session and
   * `404 fileNotFound` for a missing or not permitted file.
   */
  resolveForRead(fileId: string): MockStoredFile;
  /**
   * The same check without exceptions — the `lookup` option of `createMockFileService`: metadata of a file
   * the signed-in user may read, `"sessionExpired"` when there is no valid session (401, the FileService
   * signs the user out), or null when the file does not exist or is not theirs (404, deliberately the same).
   */
  access(fileId: string): MockFileInfo | "sessionExpired" | null;
  /** `access` for tests and backend code that only need the readable metadata: null for every refusal. */
  lookup(fileId: string): MockFileInfo | null;
}

export type MockFileHooks = {
  /** A file row was created for a picked file. */
  onFileUploaded?: (file: MockUploadedFile) => void;
  /** A file row was removed because nothing references it any more. */
  onFileRemoved?: (fileId: string) => void;
  /** Reads the bytes of a picked file; null when the URI cannot be read on this platform. */
  readBytes?: (uri: string) => Promise<Uint8Array | null>;
};

export function createFiles(core: MockCore, auth: MockAuth, hooks: MockFileHooks = {}): MockFiles {
  const { store, errors } = core;

  const get = (fileId: string | null | undefined) => store.files.get(fileId);

  const storedRef = (fileId: string | null | undefined): StoredFileRef | null => {
    const file = get(fileId);
    return file ? { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size, uploadedAt: file.uploadedAt } : null;
  };

  /** Students whose solution the photo shows, and the teachers of the lessons it was handed in at. */
  const photoOwners = (fileId: string): { studentIds: Set<string>; lessonTeacherIds: Set<string> } => {
    const studentIds = new Set<string>();
    const lessonTeacherIds = new Set<string>();
    for (const photo of store.homeworkPhotos.by("fileId", fileId)) {
      const assignment = store.homeworks.get(photo.assignmentId);
      if (assignment) studentIds.add(assignment.studentId);
    }
    for (const photo of store.homeworkCheckPhotos.by("fileId", fileId)) {
      const assignment = store.homeworks.get(store.homeworkChecks.get(photo.checkId)?.assignmentId);
      if (assignment) studentIds.add(assignment.studentId);
    }
    for (const photo of store.submissionPhotos.by("fileId", fileId)) {
      const item = store.lessonItems.get(store.submissions.get(photo.submissionId)?.itemId);
      const participant = store.participants.get(item?.participantId);
      if (!participant) continue;
      studentIds.add(participant.studentId);
      const lesson = store.lessons.get(participant.lessonId);
      if (lesson) lessonTeacherIds.add(lesson.teacherId);
    }
    return { studentIds, lessonTeacherIds };
  };

  const canRead = (user: MockUser, fileId: string): boolean => {
    const file = get(fileId);
    if (!file) return false;
    const { studentIds, lessonTeacherIds } = photoOwners(fileId);
    const isPhoto = studentIds.size > 0;

    if (isPhoto) {
      if (user.role === "DEVELOPER") return true;
      if (user.role === "STUDENT") return studentIds.has(user.id);
      // A teacher: photos of own students, or handed in at a lesson they teach.
      if (lessonTeacherIds.has(user.id)) return true;
      for (const studentId of studentIds) {
        if (store.users.get(studentId)?.teacherId === user.id) return true;
      }
      return false;
    }

    return canAccessStoredFile(user, {
      uploadedById: file.uploadedById,
      counts: {
        theoryForTopics: store.topics.count((topic) => topic.theoryFileId === fileId),
        homeworkForTopics: store.topics.count((topic) => topic.homeworkFileId === fileId),
        answersForTopics: store.topics.count((topic) => topic.answersFileId === fileId),
        answerForNumberEntries: store.numbers.count((number) => number.answerFileId === fileId),
        checkPhotoEntries: 0,
      },
    });
  };

  /** Metadata of a file `user` may read; null when it does not exist or is not theirs. */
  const readable = (user: MockUser, fileId: string): MockFileInfo | null => {
    const file = get(fileId);
    if (!file || !canRead(user, fileId)) return null;
    return {
      mimeType: file.mimeType,
      originalName: file.originalName,
      size: file.size,
      ...(file.sample ? { sample: file.sample } : {}),
    };
  };

  return {
    get,
    ref(fileId) {
      const file = get(fileId);
      return file ? { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size } : null;
    },
    storedRef,
    createFromUpload(upload, uploadedById) {
      const file = store.files.insert({
        id: store.nextId("file"),
        originalName: upload.name,
        mimeType: upload.mimeType,
        size: upload.size,
        uploadedAt: core.nowIso(),
        uploadedById,
        sample: null,
        localUri: upload.uri,
      });
      hooks.onFileUploaded?.({ id: file.id, uri: upload.uri, mimeType: file.mimeType, originalName: file.originalName, size: file.size });
      return file;
    },
    async readUploadBytes(uri) {
      if (!hooks.readBytes || !uri) return null;
      try {
        const bytes = await hooks.readBytes(uri);
        return bytes instanceof Uint8Array ? bytes : null;
      } catch {
        // An unreadable file is not refused here: the mock only checks content it actually has.
        return null;
      }
    },
    removeIfUnreferenced(fileId) {
      const removed = deleteFileIfUnreferenced(store, fileId);
      if (removed && fileId) hooks.onFileRemoved?.(fileId);
      return removed;
    },
    canRead,
    resolveForRead(fileId) {
      const user = auth.requireUser();
      const file = get(fileId);
      if (!file || !canRead(user, fileId)) throw errors.notFound("fileNotFound");
      return file;
    },
    access(fileId) {
      const user = auth.currentUser();
      if (!user) return "sessionExpired";
      return readable(user, fileId);
    },
    lookup(fileId) {
      const user = auth.currentUser();
      return user ? readable(user, fileId) : null;
    },
  };
}
