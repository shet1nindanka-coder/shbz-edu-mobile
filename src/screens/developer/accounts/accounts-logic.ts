// Pure rules of the developer's accounts screen (docs/spec/04-teacher-students.md S9, S9a, S9b, D6, §4.13):
// directory search, unsaved owner changes, the teacher-deletion plan and when the create form may be sent.
// The API checks all of it again; these only decide what the screen shows and enables.
// No React, no React Native — unit-tested in tests/accounts-logic.test.ts.
import type { ManagedStudent, ManagedTeacher, OwnerChange } from '@/api/types';
import { matchesAccountSearch } from '@/domain/text';
import { canSubmitStudentForm } from '@/screens/teacher/students/account-form';

/** What the directory shows: both lists under their captions, or one of them. */
export type DirectoryTab = 'all' | 'teachers' | 'students';

type Account = { name: string; email: string };
type TeacherRef = { id: string; name: string; email: string };

/** A teacher in a picker: «Анна Петрова (teacher@example.com)» — two teachers may share a name. */
export function teacherOptionLabel(teacher: Account): string {
  return `${teacher.name} (${teacher.email})`;
}

export function teacherOptions(teachers: readonly TeacherRef[]): { value: string; label: string }[] {
  return teachers.map((teacher) => ({ value: teacher.id, label: teacherOptionLabel(teacher) }));
}

/** One search field for every tab: every word of the query must occur in "name login". */
export function filterAccounts<T extends Account>(accounts: readonly T[], query: string): T[] {
  return accounts.filter((account) => matchesAccountSearch(query, account.name, account.email));
}

/**
 * Unsaved owner edits: studentId → the teacher picked for that student. An entry exists only while the
 * pick differs from the stored owner.
 */
export type OwnerDrafts = Readonly<Record<string, string>>;

/** The stored owner, when that account still is a teacher of the directory. */
function storedOwnerId(student: ManagedStudent, teachers: readonly TeacherRef[]): string | null {
  return student.teacherId !== null && teachers.some((teacher) => teacher.id === student.teacherId) ? student.teacherId : null;
}

/**
 * What the owner picker of a student shows: the draft, else the stored owner, else nothing. A draft that
 * names a teacher who has left the directory (deleted meanwhile) is ignored — sending it would make every
 * save fail with `ownerInvalid`.
 */
export function selectedOwnerId(student: ManagedStudent, drafts: OwnerDrafts, teachers: readonly TeacherRef[]): string | null {
  const draft = drafts[student.id];
  if (draft && teachers.some((teacher) => teacher.id === draft)) return draft;
  return storedOwnerId(student, teachers);
}

/** The row is marked «Изменено» when a teacher is picked and it is not the stored owner. */
export function isOwnerDirty(student: ManagedStudent, drafts: OwnerDrafts, teachers: readonly TeacherRef[]): boolean {
  const selected = selectedOwnerId(student, drafts, teachers);
  return selected !== null && selected !== student.teacherId;
}

/** Picks a teacher for a student; picking the stored owner again drops the draft. */
export function withOwnerDraft(drafts: OwnerDrafts, student: ManagedStudent, teacherId: string): OwnerDrafts {
  const next: Record<string, string> = { ...drafts };
  if (!teacherId || teacherId === student.teacherId) delete next[student.id];
  else next[student.id] = teacherId;
  return next;
}

/**
 * Everything the save bar («Сохранить · N») sends, in directory order — rows hidden by the search included.
 * Drafts of students that are no longer in the directory are left out.
 */
export function ownerChanges(students: readonly ManagedStudent[], drafts: OwnerDrafts, teachers: readonly TeacherRef[]): OwnerChange[] {
  const changes: OwnerChange[] = [];
  for (const student of students) {
    const selected = selectedOwnerId(student, drafts, teachers);
    if (selected !== null && selected !== student.teacherId) changes.push({ studentId: student.id, teacherId: selected });
  }
  return changes;
}

/** Name of the teacher with this id; `null` for an unattributed student or an unknown id. */
export function teacherNameOf(teacherId: string | null, teachers: readonly TeacherRef[]): string | null {
  if (teacherId === null) return null;
  return teachers.find((teacher) => teacher.id === teacherId)?.name ?? null;
}

export type DeleteTeacherPlan = {
  /** The teacher has students: a different teacher must take them over. */
  needsTransfer: boolean;
  /** Teachers who can take the students — every other teacher, never filtered by the search. */
  candidates: ManagedTeacher[];
  /** Students to hand over but nobody to hand them to: the deletion cannot be confirmed. */
  blocked: boolean;
  /** Lessons and drafts that move to the new owner together with the students (0 = no such line). */
  transferredLessons: number;
  /** Lessons and drafts deleted with the account — only when nothing is transferred. */
  deletedLessons: number;
  deletedTests: number;
  /** The red box that names what is deleted for good. */
  showCascade: boolean;
};

/** What deleting this teacher does, by the numbers of the directory (D6). */
export function deleteTeacherPlan(teacher: ManagedTeacher, teachers: readonly ManagedTeacher[]): DeleteTeacherPlan {
  const needsTransfer = teacher.studentCount > 0;
  const candidates = teachers.filter((other) => other.id !== teacher.id);
  const deletedLessons = needsTransfer ? 0 : teacher.lessonCount;
  return {
    needsTransfer,
    candidates,
    blocked: needsTransfer && candidates.length === 0,
    transferredLessons: needsTransfer ? teacher.lessonCount : 0,
    deletedLessons,
    deletedTests: teacher.testCount,
    showCascade: deletedLessons > 0 || teacher.testCount > 0,
  };
}

/** «Удалить учителя» is enabled unless a transfer is needed and no (existing, different) teacher is picked. */
export function canDeleteTeacher(plan: DeleteTeacherPlan, transferToTeacherId: string | null): boolean {
  if (!plan.needsTransfer) return true;
  if (plan.blocked) return false;
  return transferToTeacherId !== null && plan.candidates.some((candidate) => candidate.id === transferToTeacherId);
}

export type AccountRole = 'STUDENT' | 'TEACHER';

export type AccountFormValues = {
  role: AccountRole;
  /** The owner picked for a student; not used for a teacher. */
  teacherId: string | null;
  name: string;
  login: string;
  password: string;
};

/** The picked owner, when that teacher is still in the directory. */
export function validOwnerId(teacherId: string | null, teachers: readonly TeacherRef[]): string | null {
  return teacherId !== null && teachers.some((teacher) => teacher.id === teacherId) ? teacherId : null;
}

/** The student form's rules, plus: a student account needs an existing teacher as its owner. */
export function canSubmitAccountForm(values: AccountFormValues, teachers: readonly TeacherRef[]): boolean {
  if (!canSubmitStudentForm(values)) return false;
  return values.role === 'TEACHER' || validOwnerId(values.teacherId, teachers) !== null;
}
