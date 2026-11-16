/**
 * Developer accounts screen (owner spec 04 S9).
 * Source: docs/spec/00-unified-contract.md §1.4.5.
 *
 * Student deletion and student password reset on this screen call `teacherStudents.deleteStudent` /
 * `teacherStudents.resetStudentPassword` (TEACHER own · DEVELOPER any).
 */

export type ManagedTeacher = {
  id: string;
  name: string;
  /** The login. */
  email: string;
  studentCount: number;
  lessonCount: number;
  testCount: number;
};

export type ManagedStudent = {
  id: string;
  name: string;
  email: string;
  /** null = unattributed student. */
  teacherId: string | null;
};

/** `GET /developer/accounts`. Both lists are sorted by name asc. */
export type AccountsDirectory = { teachers: ManagedTeacher[]; students: ManagedStudent[] };

/** `POST /developer/accounts`. `teacherId` is required when `role === "STUDENT"` (the owner teacher); it is not used for a TEACHER. */
export type AccountCreateInput = {
  role: "STUDENT" | "TEACHER";
  teacherId: string;
  name: string;
  login: string;
  password: string;
};

export type CreatedAccount = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "TEACHER";
  teacherId: string | null;
};

/** One row of `PUT /developer/students/owners` (`{ changes: OwnerChange[] }`, non-empty, all-or-nothing). */
export type OwnerChange = { studentId: string; teacherId: string };
