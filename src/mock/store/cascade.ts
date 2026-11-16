/**
 * Delete rules of the database, imitated on the mock store (docs/spec/09-data-i18n-math.md §1.3).
 *
 * These functions only remove / detach rows — the "foreign key" level. Authorisation, validation, realtime
 * events, audit rows and deadline-mirror recomputation belong to the calling rule or member. Call them
 * inside `store.transaction(...)` when the operation has other steps.
 */
import type { MockStore } from "./store";

/** Removes a file row when nothing references it any more (topic files, answer files, photos). Returns true when removed. */
export function deleteFileIfUnreferenced(store: MockStore, fileId: string | null | undefined): boolean {
  if (!fileId || !store.files.has(fileId)) return false;
  if (isFileReferenced(store, fileId)) return false;
  store.files.delete(fileId);
  return true;
}

/** True while a topic, a number, an attached photo, a check snapshot or a lesson submission points at the file. */
export function isFileReferenced(store: MockStore, fileId: string): boolean {
  return (
    store.topics.some((topic) => topic.theoryFileId === fileId || topic.homeworkFileId === fileId || topic.answersFileId === fileId) ||
    store.numbers.some((number) => number.answerFileId === fileId) ||
    store.homeworkPhotos.by("fileId", fileId).length > 0 ||
    store.homeworkCheckPhotos.by("fileId", fileId).length > 0 ||
    store.submissionPhotos.by("fileId", fileId).length > 0
  );
}

/** Deletes one check with its results and snapshot photos (and the photo files nothing else uses). */
export function deleteHomeworkCheck(store: MockStore, checkId: string): void {
  const photos = store.homeworkCheckPhotos.by("checkId", checkId);
  for (const photo of photos) store.homeworkCheckPhotos.delete(photo.id);
  for (const result of store.homeworkCheckResults.by("checkId", checkId)) store.homeworkCheckResults.delete(result.id);
  for (const job of store.jobs.by("refId", checkId)) store.jobs.delete(job.id);
  store.rowScripts.delete(checkId);
  store.homeworkChecks.delete(checkId);
  for (const photo of photos) deleteFileIfUnreferenced(store, photo.fileId);
}

/**
 * Deletes a homework assignment with its numbers, attached photos and checks.
 * The mirrored `StudentTopicNumberStatus.deadlineAt` is NOT touched here: the caller recomputes it
 * (`ctx.homework.recomputeDeadlines`) — rows with `statusChangedAt` must survive.
 * A draft's `LessonParticipant.issuedAssignmentId` is a plain string and is left as is (stale stamp).
 */
export function deleteHomeworkAssignment(store: MockStore, assignmentId: string): void {
  for (const link of store.homeworkNumbers.by("assignmentId", assignmentId)) store.homeworkNumbers.delete(link.id);
  const photos = store.homeworkPhotos.by("assignmentId", assignmentId);
  for (const photo of photos) store.homeworkPhotos.delete(photo.id);
  for (const check of store.homeworkChecks.by("assignmentId", assignmentId)) deleteHomeworkCheck(store, check.id);
  store.homeworks.delete(assignmentId);
  for (const photo of photos) deleteFileIfUnreferenced(store, photo.fileId);
}

/** Deletes one lesson submission with its photos. */
export function deleteLessonSubmission(store: MockStore, submissionId: string): void {
  const photos = store.submissionPhotos.by("submissionId", submissionId);
  for (const photo of photos) store.submissionPhotos.delete(photo.id);
  for (const job of store.jobs.by("refId", submissionId)) store.jobs.delete(job.id);
  store.rowScripts.delete(submissionId);
  store.submissions.delete(submissionId);
  for (const photo of photos) deleteFileIfUnreferenced(store, photo.fileId);
}

/** Deletes one item of a participant's set with its submissions. */
export function deleteLessonItem(store: MockStore, itemId: string): void {
  for (const submission of store.submissions.by("itemId", itemId)) deleteLessonSubmission(store, submission.id);
  store.lessonItems.delete(itemId);
}

/** Deletes one participant of a lesson / draft with the items, submissions and pending generation. */
export function deleteLessonParticipant(store: MockStore, participantId: string): void {
  for (const item of store.lessonItems.by("participantId", participantId)) deleteLessonItem(store, item.id);
  for (const job of store.jobs.by("refId", participantId)) store.jobs.delete(job.id);
  store.planScripts.delete(participantId);
  store.participants.delete(participantId);
}

/** Deletes a lesson or a homework draft with its participants. Issued homeworks of a draft stay. */
export function deleteLesson(store: MockStore, lessonId: string): void {
  for (const participant of store.participants.by("lessonId", lessonId)) deleteLessonParticipant(store, participant.id);
  store.lessons.delete(lessonId);
}

/** Deletes a group: members' `StudentProfile.groupId` → null, `Lesson.groupId` → null (lessons survive as "individual"). */
export function deleteGroup(store: MockStore, groupId: string, now: string): void {
  for (const profile of store.profiles.by("groupId", groupId)) store.profiles.update(profile.id, { groupId: null, updatedAt: now });
  for (const lesson of store.lessons.by("groupId", groupId)) store.lessons.update(lesson.id, { groupId: null, updatedAt: now });
  store.groups.delete(groupId);
}

/** Deletes every session of a user (password reset by staff, account deletion). */
export function deleteUserSessions(store: MockStore, userId: string): number {
  const sessions = store.sessions.by("userId", userId);
  for (const session of sessions) store.sessions.delete(session.id);
  return sessions.length;
}

/**
 * Deletes a student with everything that belongs to them: statuses, progress events, notifications,
 * profile, homework assignments (numbers, photos, checks), lesson participations (items, submissions),
 * parent-call rows, sessions and limiter buckets keyed by the user.
 */
export function deleteStudent(store: MockStore, studentId: string): void {
  for (const row of store.statuses.by("studentId", studentId)) store.statuses.delete(row.id);
  for (const row of store.progressEvents.by("studentId", studentId)) store.progressEvents.delete(row.id);
  for (const row of store.notifications.by("userId", studentId)) store.notifications.delete(row.id);
  const profile = store.profiles.findUnique("userId", studentId);
  if (profile) store.profiles.delete(profile.id);
  for (const assignment of store.homeworks.by("studentId", studentId)) deleteHomeworkAssignment(store, assignment.id);
  for (const participant of store.participants.by("studentId", studentId)) deleteLessonParticipant(store, participant.id);
  for (const call of store.parentCalls.by("studentId", studentId)) store.parentCalls.delete(call.id);
  deleteUserSessions(store, studentId);
  store.limiterBuckets.deleteWhere((bucket) => bucket.identifier === studentId);
  store.users.delete(studentId);
}

/**
 * Deletes a teacher: their groups and lessons / drafts cascade, their students stay with `teacherId = null`
 * (transfer them BEFORE calling this when a target teacher was chosen), parent calls made by the teacher
 * keep the row with `teacherId = null`. Returns false — and deletes nothing — when the teacher still owns
 * uploaded files (`StoredFile.uploadedById` is Restrict).
 */
export function deleteTeacher(store: MockStore, teacherId: string, now: string): boolean {
  if (store.files.by("uploadedById", teacherId).length > 0) return false;
  for (const group of store.groups.by("teacherId", teacherId)) deleteGroup(store, group.id, now);
  for (const lesson of store.lessons.by("teacherId", teacherId)) deleteLesson(store, lesson.id);
  for (const student of store.users.by("teacherId", teacherId)) store.users.update(student.id, { teacherId: null, updatedAt: now });
  for (const call of store.parentCalls.by("teacherId", teacherId)) store.parentCalls.update(call.id, { teacherId: null });
  for (const row of store.notifications.by("userId", teacherId)) store.notifications.delete(row.id);
  deleteUserSessions(store, teacherId);
  store.limiterBuckets.deleteWhere((bucket) => bucket.identifier === teacherId);
  store.users.delete(teacherId);
  return true;
}

/**
 * Deletes one number of a topic: statuses, progress events, homework-assignment links, lesson items (with
 * submissions) and check results that point at it. Assignments left without numbers are NOT removed here.
 */
export function deleteNumber(store: MockStore, numberId: string): void {
  for (const row of store.statuses.by("homeworkNumberId", numberId)) store.statuses.delete(row.id);
  for (const row of store.progressEvents.by("homeworkNumberId", numberId)) store.progressEvents.delete(row.id);
  for (const row of store.homeworkNumbers.by("homeworkNumberId", numberId)) store.homeworkNumbers.delete(row.id);
  for (const item of store.lessonItems.by("homeworkNumberId", numberId)) deleteLessonItem(store, item.id);
  for (const row of store.homeworkCheckResults.by("homeworkNumberId", numberId)) store.homeworkCheckResults.delete(row.id);
  const number = store.numbers.get(numberId);
  store.numbers.delete(numberId);
  if (number) deleteFileIfUnreferenced(store, number.answerFileId);
}

/**
 * Deletes a topic: its numbers (see `deleteNumber`), the homework assignments of the topic, and
 * `Lesson.topicId` → null. Returns the number of topic files that were removed because nothing else
 * references them.
 */
export function deleteTopic(store: MockStore, topicId: string, now: string): number {
  const topic = store.topics.get(topicId);
  if (!topic) return 0;
  for (const assignment of store.homeworks.by("topicId", topicId)) deleteHomeworkAssignment(store, assignment.id);
  for (const number of store.numbers.by("topicId", topicId)) deleteNumber(store, number.id);
  for (const lesson of store.lessons.by("topicId", topicId)) store.lessons.update(lesson.id, { topicId: null, updatedAt: now });
  store.topics.delete(topicId);
  let removedFiles = 0;
  for (const fileId of [topic.theoryFileId, topic.homeworkFileId, topic.answersFileId]) {
    if (deleteFileIfUnreferenced(store, fileId)) removedFiles += 1;
  }
  return removedFiles;
}
