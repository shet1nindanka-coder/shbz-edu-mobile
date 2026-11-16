/**
 * `DeveloperAccountsApi` on the mock store — the developer's accounts screen: directory of teachers and
 * students, account creation, bulk change of a student's owner teacher, teacher password reset, teacher
 * deletion with transfer (docs/spec/04-teacher-students.md S9, §3.7 – §3.10a, §4.13; 00 §2.9;
 * 90-addendum-1 A.11).
 *
 * Every method is DEVELOPER-only (`403 developerRightsRequired` otherwise). Deleting a student and resetting
 * a student's password on that screen are `teacherStudents.deleteStudent` / `.resetStudentPassword`.
 */
import type { DeveloperAccountsApi } from "@/api/client";
import type { ManagedStudent, ManagedTeacher } from "@/api/types";
import { validateDeveloperAccountInput } from "@/domain/account-validation";
import { MAX_PASSWORD_LENGTH, validatePasswordStrength } from "@/domain/password-policy";

import type { MockContext } from "../context";

export function createDeveloperAccounts(ctx: MockContext): DeveloperAccountsApi {
  const { store, errors, auth, q, limits } = ctx;

  const studentsOf = (teacherId: string) => store.users.by("teacherId", teacherId).filter((user) => user.role === "STUDENT");

  return {
    async getAccounts() {
      auth.requireDeveloper();

      const teachers: ManagedTeacher[] = q.teachers().map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        studentCount: studentsOf(teacher.id).length,
        // `Lesson` rows taught: lessons AND homework drafts.
        lessonCount: store.lessons.by("teacherId", teacher.id).length,
        // SPEC-GAP: the `Test*` tables are schema-only on the site (no code writes them) and are not part of
        // the mobile model, so a teacher never has tests.
        testCount: 0,
      }));

      // Every student, the unattributed ones included (`teacherId: null`). Never the password.
      const students: ManagedStudent[] = q.allStudents().map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        teacherId: student.teacherId,
      }));

      return { teachers, students };
    },

    async createAccount(input) {
      const developer = auth.requireDeveloper();

      const parsed = validateDeveloperAccountInput({
        role: String(input?.role ?? ""),
        teacherId: typeof input?.teacherId === "string" ? input.teacherId : "",
        name: String(input?.name ?? ""),
        login: String(input?.login ?? ""),
        password: String(input?.password ?? ""),
      });
      if (!parsed.ok) throw errors.invalidData((dict) => dict.students.actions.createAccount.invalid);

      limits.enforce("create-account", { message: (dict) => dict.students.actions.createAccount.rateLimited });

      // A student must always belong to an existing teacher.
      if (parsed.role === "STUDENT" && !q.teacher(parsed.teacherId)) {
        throw errors.notFound("teacherNotFound", (dict) => dict.students.actions.createAccount.teacherMissing);
      }

      // The login is unique across every role.
      if (store.users.findUnique("email", parsed.login)) {
        return errors.fail({ status: 409, code: "exists", message: (dict) => dict.students.actions.createAccount.exists });
      }

      const now = ctx.nowIso();
      const account = store.users.insert({
        id: store.nextId("usr"),
        name: parsed.name,
        email: parsed.login,
        role: parsed.role,
        teacherId: parsed.teacherId,
        createdAt: now,
        updatedAt: now,
        password: parsed.password,
      });

      ctx.audit.write({
        category: "DATA",
        action: "account.create",
        actor: developer,
        targetType: "User",
        targetLabel: account.name,
        text: { key: "account.created", params: { name: account.name, role: parsed.role } },
        meta: { accountLogin: account.email, accountRole: parsed.role },
      });
      ctx.emit({ kind: "students-changed" });

      return { account: { id: account.id, name: account.name, email: account.email, role: parsed.role, teacherId: account.teacherId } };
    },

    async changeStudentOwners(changes) {
      const developer = auth.requireDeveloper();
      const invalid = () => errors.make({ status: 400, code: "ownerInvalid", message: (dict) => dict.students.accounts.notices.ownerInvalid });

      if (!Array.isArray(changes)) throw invalid();
      // Entries with an empty id are dropped; an empty list is refused.
      const entries: { studentId: string; teacherId: string }[] = [];
      for (const change of changes) {
        const studentId = ctx.validate.id(change?.studentId);
        const teacherId = ctx.validate.id(change?.teacherId);
        if (studentId !== null && teacherId !== null) entries.push({ studentId, teacherId });
      }
      if (entries.length === 0) throw invalid();

      // One missing student or teacher means the list on the screen is stale: nothing is applied.
      if (entries.some((entry) => !q.student(entry.studentId) || !q.teacher(entry.teacherId))) throw invalid();

      store.transaction(() => {
        const now = ctx.nowIso();
        const nowMs = ctx.now();
        for (const entry of entries) {
          store.users.update(entry.studentId, { teacherId: entry.teacherId, updatedAt: now });

          // Out of a group led by someone else: the previous owner must not keep access through it.
          const profile = q.profile(entry.studentId);
          const group = q.group(profile?.groupId);
          if (profile && group && group.teacherId !== entry.teacherId) store.profiles.update(profile.id, { groupId: null, updatedAt: now });

          // Out of other teachers' lessons that have not started and drafts that are not issued (no hand-ins
          // or results there yet). Past and running lessons stay as history.
          for (const participant of store.participants.by("studentId", entry.studentId)) {
            if (participant.issuedAssignmentId !== null) continue;
            const lesson = q.lesson(participant.lessonId);
            if (!lesson || lesson.teacherId === entry.teacherId) continue;
            if (lesson.finishedAt !== null || lesson.status === "FINISHED") continue;
            const notStarted = lesson.kind === "HOMEWORK" || lesson.startsAt === null || new Date(lesson.startsAt).getTime() > nowMs;
            if (notStarted) ctx.cascade.deleteParticipant(participant.id);
          }
        }
      });

      ctx.audit.write({
        category: "DATA",
        action: "student.owner_change",
        actor: developer,
        targetType: "User",
        text: { key: "account.owner_changed", params: { count: entries.length } },
        meta: { changes: entries },
      });
      ctx.emit({ kind: "students-changed" });

      return { changed: entries.length };
    },

    async resetTeacherPassword(teacherId, password) {
      const developer = auth.requireDeveloper();
      const missing = () => errors.notFound("teacherNotFound", (dict) => dict.students.accounts.notices.teacherPasswordMissing);

      const id = ctx.validate.id(teacherId);
      if (id === null) throw missing();

      const next = typeof password === "string" ? password : "";
      if (next.length > MAX_PASSWORD_LENGTH || validatePasswordStrength(next) !== null) {
        throw errors.invalidData((dict) => dict.students.accounts.notices.teacherPasswordInvalid);
      }

      // Consumed by every valid request, before the teacher is looked up.
      limits.enforce("reset-teacher-password", { message: (dict) => dict.students.accounts.notices.teacherPasswordRateLimited });

      const teacher = q.teacher(id);
      if (!teacher) throw missing();

      store.transaction(() => {
        store.users.update(teacher.id, { password: next, updatedAt: ctx.nowIso() });
        // Every session of the TEACHER ends; students and their work are untouched.
        ctx.cascade.deleteUserSessions(teacher.id);
      });

      ctx.audit.write({
        category: "DATA",
        action: "teacher.password_reset",
        actor: developer,
        targetType: "User",
        targetId: teacher.id,
        text: { key: "teacher.password_reset" },
      });
    },

    async deleteTeacher(teacherId, transferToTeacherId) {
      const developer = auth.requireDeveloper();

      const teacher = q.teacher(ctx.validate.id(teacherId));
      if (!teacher) throw errors.notFound("teacherNotFound", (dict) => dict.students.accounts.notices.teacherMissing);

      // Students may not be left without an owner (they would vanish from every list): with at least one
      // student a DIFFERENT existing teacher must take them over.
      const students = studentsOf(teacher.id);
      let newOwnerId: string | null = null;
      if (students.length > 0) {
        const targetId = ctx.validate.id(transferToTeacherId);
        const newOwner = targetId !== null && targetId !== teacher.id ? q.teacher(targetId) : undefined;
        if (!newOwner) {
          return errors.fail({ status: 409, code: "teacherTransfer", message: (dict) => dict.students.accounts.notices.teacherTransfer });
        }
        newOwnerId = newOwner.id;
      }

      store.transaction(() => {
        const now = ctx.nowIso();
        if (newOwnerId !== null) {
          // Lessons, homework drafts and groups move with the students — attendance and results are kept.
          for (const student of students) store.users.update(student.id, { teacherId: newOwnerId, updatedAt: now });
          for (const lesson of store.lessons.by("teacherId", teacher.id)) store.lessons.update(lesson.id, { teacherId: newOwnerId, updatedAt: now });
          for (const group of store.groups.by("teacherId", teacher.id)) store.groups.update(group.id, { teacherId: newOwnerId, updatedAt: now });
        }
        // Files the teacher uploaded go to the developer: the check history of former students rests on them.
        for (const file of store.files.by("uploadedById", teacher.id)) store.files.update(file.id, { uploadedById: developer.id });
        // Without a transfer the teacher's lessons / drafts and groups are deleted with the account.
        if (!ctx.cascade.deleteTeacher(teacher.id)) throw errors.make({ status: 500, code: "deleteFailed", message: (dict) => dict.students.accounts.notices.teacherDelete });
      });

      ctx.audit.write({
        category: "DATA",
        action: "teacher.delete",
        actor: developer,
        targetType: "User",
        targetId: teacher.id,
        targetLabel: teacher.name,
        text: { key: "teacher.deleted", params: { name: teacher.name, count: students.length } },
        meta: { studentCount: students.length, newOwnerId },
      });
      ctx.emit({ kind: "students-changed" });

      return { transferredStudents: newOwnerId !== null ? students.length : 0 };
    },
  };
}
