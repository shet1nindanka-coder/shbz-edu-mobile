// Pure rules of the developer's accounts screen: directory search, unsaved owner changes, the
// teacher-deletion plan and when the create form may be sent (docs/spec/04-teacher-students.md S9).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ManagedStudent, ManagedTeacher } from "../src/api/types";
import {
  canDeleteTeacher,
  canSubmitAccountForm,
  deleteTeacherPlan,
  filterAccounts,
  isOwnerDirty,
  ownerChanges,
  selectedOwnerId,
  teacherNameOf,
  teacherOptionLabel,
  teacherOptions,
  validOwnerId,
  withOwnerDraft,
} from "../src/screens/developer/accounts/accounts-logic";

const teacher = (id: string, name: string, email: string, counts: Partial<ManagedTeacher> = {}): ManagedTeacher => ({
  id,
  name,
  email,
  studentCount: 0,
  lessonCount: 0,
  testCount: 0,
  ...counts,
});

const anna = teacher("usr_anna", "Анна Петрова", "teacher@example.com", { studentCount: 7, lessonCount: 12 });
const igor = teacher("usr_igor", "Игорь Соколов", "teacher2@example.com", { studentCount: 2, lessonCount: 1 });
const olga = teacher("usr_olga", "Ольга Новикова", "teacher3@example.com");
const teachers = [anna, igor, olga];

const ilya: ManagedStudent = { id: "usr_ilya", name: "Илья Смирнов", email: "ilya@example.com", teacherId: "usr_anna" };
const maria: ManagedStudent = { id: "usr_maria", name: "Мария Кузнецова", email: "maria@example.com", teacherId: "usr_anna" };
const lev: ManagedStudent = { id: "usr_orphan", name: "Лев Без-Учителя", email: "lev@example.com", teacherId: null };
const students = [ilya, lev, maria];

describe("teacher pickers", () => {
  it("label a teacher with the name and the login", () => {
    assert.equal(teacherOptionLabel(anna), "Анна Петрова (teacher@example.com)");
    assert.deepEqual(teacherOptions([igor]), [{ value: "usr_igor", label: "Игорь Соколов (teacher2@example.com)" }]);
  });

  it("resolve an owner's name, and nothing for an orphan or an unknown id", () => {
    assert.equal(teacherNameOf("usr_igor", teachers), "Игорь Соколов");
    assert.equal(teacherNameOf(null, teachers), null);
    assert.equal(teacherNameOf("usr_gone", teachers), null);
  });
});

describe("directory search", () => {
  it("matches every word against name and login, case-insensitively", () => {
    assert.deepEqual(filterAccounts(students, "  "), students);
    assert.deepEqual(filterAccounts(students, "ИЛЬЯ"), [ilya]);
    assert.deepEqual(filterAccounts(students, "maria@"), [maria]);
    assert.deepEqual(filterAccounts(students, "смирнов ilya"), [ilya]);
    assert.deepEqual(filterAccounts(students, "смирнов maria"), []);
    assert.deepEqual(filterAccounts(teachers, "teacher2"), [igor]);
  });

  it("keeps the directory order", () => {
    assert.deepEqual(filterAccounts(students, "example.com"), students);
  });
});

describe("owner drafts", () => {
  it("show the stored owner until another teacher is picked", () => {
    assert.equal(selectedOwnerId(ilya, {}, teachers), "usr_anna");
    assert.equal(selectedOwnerId(lev, {}, teachers), null);
    assert.equal(isOwnerDirty(ilya, {}, teachers), false);
    assert.equal(isOwnerDirty(lev, {}, teachers), false);
  });

  it("mark a row changed once the pick differs from the stored owner", () => {
    const drafts = withOwnerDraft({}, ilya, "usr_igor");
    assert.deepEqual(drafts, { usr_ilya: "usr_igor" });
    assert.equal(selectedOwnerId(ilya, drafts, teachers), "usr_igor");
    assert.equal(isOwnerDirty(ilya, drafts, teachers), true);
    assert.equal(isOwnerDirty(maria, drafts, teachers), false);
  });

  it("drop the draft when the stored owner is picked again", () => {
    const drafts = withOwnerDraft(withOwnerDraft({}, ilya, "usr_igor"), ilya, "usr_anna");
    assert.deepEqual(drafts, {});
  });

  it("do not mutate the previous drafts", () => {
    const before = { usr_maria: "usr_olga" };
    const after = withOwnerDraft(before, ilya, "usr_igor");
    assert.deepEqual(before, { usr_maria: "usr_olga" });
    assert.deepEqual(after, { usr_maria: "usr_olga", usr_ilya: "usr_igor" });
  });

  it("give an orphan its first owner", () => {
    const drafts = withOwnerDraft({}, lev, "usr_olga");
    assert.equal(isOwnerDirty(lev, drafts, teachers), true);
    assert.deepEqual(ownerChanges(students, drafts, teachers), [{ studentId: "usr_orphan", teacherId: "usr_olga" }]);
  });

  it("send every pending change in directory order, whatever the search shows", () => {
    const drafts = { usr_maria: "usr_igor", usr_ilya: "usr_olga" };
    assert.deepEqual(ownerChanges(students, drafts, teachers), [
      { studentId: "usr_ilya", teacherId: "usr_olga" },
      { studentId: "usr_maria", teacherId: "usr_igor" },
    ]);
  });

  it("ignore a draft equal to the stored owner and an empty one", () => {
    assert.deepEqual(ownerChanges(students, { usr_ilya: "usr_anna", usr_maria: "" }, teachers), []);
  });

  it("ignore drafts of students who left the directory", () => {
    assert.deepEqual(ownerChanges([maria], { usr_ilya: "usr_igor" }, teachers), []);
  });

  it("ignore a draft that names a teacher who was deleted meanwhile", () => {
    const drafts = { usr_ilya: "usr_igor" };
    const withoutIgor = [anna, olga];
    assert.equal(selectedOwnerId(ilya, drafts, withoutIgor), "usr_anna");
    assert.equal(isOwnerDirty(ilya, drafts, withoutIgor), false);
    assert.deepEqual(ownerChanges(students, drafts, withoutIgor), []);
  });

  it("show no owner when the stored one is not a teacher of the directory", () => {
    assert.equal(selectedOwnerId(ilya, {}, [igor]), null);
  });
});

describe("teacher deletion plan", () => {
  it("needs a transfer for a teacher with students; lessons move with them", () => {
    const plan = deleteTeacherPlan(anna, teachers);
    assert.equal(plan.needsTransfer, true);
    assert.deepEqual(plan.candidates, [igor, olga]);
    assert.equal(plan.blocked, false);
    assert.equal(plan.transferredLessons, 12);
    assert.equal(plan.deletedLessons, 0);
    assert.equal(plan.showCascade, false);
  });

  it("deletes the lessons of a teacher without students and warns about it", () => {
    const loner = teacher("usr_x", "Пётр", "p@example.com", { lessonCount: 3 });
    const plan = deleteTeacherPlan(loner, [...teachers, loner]);
    assert.equal(plan.needsTransfer, false);
    assert.equal(plan.transferredLessons, 0);
    assert.equal(plan.deletedLessons, 3);
    assert.equal(plan.showCascade, true);
    assert.equal(canDeleteTeacher(plan, null), true);
  });

  it("has nothing to warn about for an empty teacher", () => {
    const plan = deleteTeacherPlan(olga, teachers);
    assert.equal(plan.needsTransfer, false);
    assert.equal(plan.showCascade, false);
    assert.equal(canDeleteTeacher(plan, null), true);
  });

  it("warns about tests even when the lessons are transferred", () => {
    const withTests = teacher("usr_t", "Тест", "t@example.com", { studentCount: 1, lessonCount: 2, testCount: 4 });
    const plan = deleteTeacherPlan(withTests, [...teachers, withTests]);
    assert.equal(plan.deletedLessons, 0);
    assert.equal(plan.deletedTests, 4);
    assert.equal(plan.showCascade, true);
  });

  it("is blocked for the only teacher who still has students", () => {
    const plan = deleteTeacherPlan(anna, [anna]);
    assert.equal(plan.blocked, true);
    assert.deepEqual(plan.candidates, []);
    assert.equal(canDeleteTeacher(plan, null), false);
    assert.equal(canDeleteTeacher(plan, "usr_anna"), false);
  });

  it("may be confirmed only with a different existing teacher picked", () => {
    const plan = deleteTeacherPlan(anna, teachers);
    assert.equal(canDeleteTeacher(plan, null), false);
    assert.equal(canDeleteTeacher(plan, "usr_anna"), false);
    assert.equal(canDeleteTeacher(plan, "usr_gone"), false);
    assert.equal(canDeleteTeacher(plan, "usr_igor"), true);
  });
});

describe("new account form", () => {
  const filled = { name: "Мария Смирнова", login: "maria2@example.com", password: "Smirnova-beku4725" };

  it("needs an existing teacher for a student", () => {
    assert.equal(canSubmitAccountForm({ ...filled, role: "STUDENT", teacherId: null }, teachers), false);
    assert.equal(canSubmitAccountForm({ ...filled, role: "STUDENT", teacherId: "usr_gone" }, teachers), false);
    assert.equal(canSubmitAccountForm({ ...filled, role: "STUDENT", teacherId: "usr_anna" }, teachers), true);
    assert.equal(canSubmitAccountForm({ ...filled, role: "STUDENT", teacherId: "usr_anna" }, []), false);
  });

  it("needs no teacher for a teacher account", () => {
    assert.equal(canSubmitAccountForm({ ...filled, role: "TEACHER", teacherId: null }, []), true);
  });

  it("applies the name, login and password rules to both roles", () => {
    assert.equal(canSubmitAccountForm({ ...filled, role: "TEACHER", teacherId: null, name: "  " }, teachers), false);
    assert.equal(canSubmitAccountForm({ ...filled, role: "TEACHER", teacherId: null, login: "" }, teachers), false);
    assert.equal(canSubmitAccountForm({ ...filled, role: "STUDENT", teacherId: "usr_anna", password: "12345678" }, teachers), false);
  });

  it("forgets a picked owner who is no longer a teacher", () => {
    assert.equal(validOwnerId("usr_igor", teachers), "usr_igor");
    assert.equal(validOwnerId("usr_igor", [anna]), null);
    assert.equal(validOwnerId(null, teachers), null);
  });
});
