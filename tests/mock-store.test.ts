// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createManualClock } from "../src/mock/clock";
import { buildFixtures } from "../src/mock/fixtures";
import { MOCK_STORE_VERSION, MOCK_TABLE_NAMES, MockConstraintError, MockPersistence, MockStore, cascade, createMemoryStorage } from "../src/mock/store";
import { TEST_T0 } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);

function seeded(): MockStore {
  return new MockStore(buildFixtures(T0));
}

describe("mock store: tables", () => {
  it("returns frozen rows and replaces them on update", () => {
    const store = seeded();
    const before = store.users.get("usr_ilya")!;
    assert.ok(Object.isFrozen(before));
    assert.throws(() => {
      (before as { name: string }).name = "changed in place";
    }, TypeError);

    const after = store.users.update("usr_ilya", { name: "Илья С." });
    assert.equal(after.name, "Илья С.");
    assert.equal(before.name, "Илья Смирнов");
    assert.equal(store.users.get("usr_ilya"), after);
    assert.throws(() => store.users.update("usr_nobody", { name: "x" }), /no row/);
  });

  it("enforces primary keys and the unique rules of the schema", () => {
    const store = seeded();
    const ilya = store.users.get("usr_ilya")!;

    // User.email (the login) is unique.
    assert.throws(() => store.users.insert({ ...ilya, id: "usr_copy" }), MockConstraintError);
    assert.throws(() => store.users.insert({ ...ilya, email: "other@example.com" }), /"id"/);
    assert.throws(() => store.users.update("usr_maria", { email: "ilya@example.com" }), MockConstraintError);

    // (topicId, number) and its normalised form ("010203" vs "10203" are twins).
    const number = store.numbers.get("num_010203")!;
    assert.throws(() => store.numbers.insert({ ...number, id: "num_twin", number: "10203" }), /topicNormalizedNumber/);
    assert.doesNotThrow(() => store.numbers.insert({ ...number, id: "num_other_topic", topicId: "top_empty", number: "10203" }));

    // (studentId, homeworkNumberId), (lessonId, studentId), (participantId, homeworkNumberId), (assignmentId, homeworkNumberId).
    const status = store.statuses.by("studentId", "usr_ilya")[0]!;
    assert.throws(() => store.statuses.insert({ ...status, id: "st_dup" }), /studentNumber/);
    const participant = store.participants.get("lp_les_live_artem")!;
    assert.throws(() => store.participants.insert({ ...participant, id: "lp_dup" }), /lessonStudent/);
    const item = store.lessonItems.by("participantId", participant.id)[0]!;
    assert.throws(() => store.lessonItems.insert({ ...item, id: "li_dup" }), /participantNumber/);
    const link = store.homeworkNumbers.by("assignmentId", "hw_ilya_done")[0]!;
    assert.throws(() => store.homeworkNumbers.insert({ ...link, id: "hwn_dup" }), /assignmentNumber/);

    // One PENDING / CHECKING check per assignment, one active submission per lesson item.
    const running = store.homeworkChecks.get("chk_artem_running_1")!;
    assert.throws(() => store.homeworkChecks.insert({ ...running, id: "chk_second_active" }), /activeSlot/);
    assert.doesNotThrow(() => store.homeworkChecks.insert({ ...running, id: "chk_finished", activeSlot: null, status: "DONE" }));
    const activeSubmission = store.submissions.get("sub_les_live_polina_010208_1")!;
    assert.throws(() => store.submissions.insert({ ...activeSubmission, id: "sub_second_active" }), /activeSlot/);

    // One profile per student.
    const profile = store.profiles.findUnique("userId", "usr_ilya")!;
    assert.throws(() => store.profiles.insert({ ...profile, id: "prof_dup" }), /userId/);
  });

  it("keeps the secondary indexes in step with updates and deletes", () => {
    const store = seeded();
    assert.equal(store.users.by("teacherId", "usr_igor").length, 2);
    store.users.update("usr_sofia", { teacherId: "usr_anna" });
    assert.deepEqual(store.users.by("teacherId", "usr_igor").map((user) => user.id), ["usr_egor"]);
    assert.ok(store.users.by("teacherId", "usr_anna").some((user) => user.id === "usr_sofia"));
    store.users.delete("usr_egor");
    assert.equal(store.users.by("teacherId", "usr_igor").length, 0);
    assert.equal(store.users.findUnique("email", "egor@example.com"), undefined);
    assert.throws(() => store.users.by("nope", "x"), /no index/);
  });

  it("generates ids that never collide with fixture ids and never repeat", () => {
    const store = seeded();
    const first = store.nextId("hw");
    const second = store.nextId("hw");
    assert.notEqual(first, second);
    assert.match(first, /^hw_m[0-9a-z]+$/);
    assert.equal(store.homeworks.has(first), false);
    assert.equal(store.meta.idCounter, 2);
  });
});

describe("mock store: transactions", () => {
  it("rolls back table and singleton changes when the work throws", () => {
    const store = seeded();
    const users = store.users.size;
    const limit = store.settings.aiDailyLimit;
    const counter = store.meta.idCounter;

    assert.throws(() => {
      store.transaction(() => {
        store.users.update("usr_ilya", { name: "temporary" });
        store.users.delete("usr_maria");
        store.users.insert({ ...store.users.get("usr_ilya")!, id: store.nextId("usr"), email: "new@example.com" });
        store.patchSettings({ aiDailyLimit: 1 });
        throw new Error("boom");
      });
    }, /boom/);

    assert.equal(store.users.size, users);
    assert.equal(store.users.get("usr_ilya")!.name, "Илья Смирнов");
    assert.ok(store.users.has("usr_maria"));
    assert.equal(store.users.findUnique("email", "new@example.com"), undefined);
    assert.equal(store.users.findUnique("email", "maria@example.com")!.id, "usr_maria");
    assert.equal(store.settings.aiDailyLimit, limit);
    assert.equal(store.meta.idCounter, counter);
  });

  it("keeps the outer work when a nested transaction fails and is caught", () => {
    const store = seeded();
    store.transaction(() => {
      store.users.update("usr_ilya", { name: "outer" });
      try {
        store.transaction(() => {
          store.users.update("usr_maria", { name: "inner" });
          throw new Error("inner failure");
        });
      } catch {
        // The outer work decides to continue.
      }
    });
    assert.equal(store.users.get("usr_ilya")!.name, "outer");
    assert.equal(store.users.get("usr_maria")!.name, "Мария Волкова");
  });

  it("returns the value of the work and refuses an async function", () => {
    const store = seeded();
    assert.equal(store.transaction(() => 42), 42);
    assert.throws(() => store.transaction(async () => 1), /synchronous/);
  });
});

describe("mock store: delete cascades (09 §1.3)", () => {
  it("deletes a student with everything that belongs to them", () => {
    const store = seeded();
    cascade.deleteStudent(store, "usr_ilya");

    assert.equal(store.users.has("usr_ilya"), false);
    for (const [table, index] of [["statuses", "studentId"], ["progressEvents", "studentId"], ["homeworks", "studentId"], ["participants", "studentId"], ["parentCalls", "studentId"], ["notifications", "userId"]] as const) {
      assert.equal(store.table(table).by(index, "usr_ilya").length, 0, table);
    }
    assert.equal(store.profiles.findUnique("userId", "usr_ilya"), undefined);
    assert.equal(store.homeworkChecks.by("assignmentId", "hw_ilya_done").length, 0);
    assert.equal(store.homeworkNumbers.by("assignmentId", "hw_ilya_done").length, 0);
    // Photo files of the deleted homeworks are gone, topic files stay.
    assert.equal(store.files.by("uploadedById", "usr_ilya").length, 0);
    assert.ok(store.files.has("file_linear_theory"));
    // Another student's rows are untouched.
    assert.ok(store.homeworks.has("hw_maria_done1"));
  });

  it("deletes a teacher: groups and lessons cascade, students stay without an owner, calls keep the row", () => {
    const store = seeded();
    const calls = store.parentCalls.by("teacherId", "usr_igor").length;
    assert.ok(calls > 0);

    assert.equal(cascade.deleteTeacher(store, "usr_igor", TEST_T0), true);
    assert.equal(store.users.has("usr_igor"), false);
    assert.equal(store.groups.has("grp_10b"), false);
    assert.equal(store.lessons.has("les_igor_1"), false);
    assert.equal(store.participants.by("lessonId", "les_igor_1").length, 0);
    assert.equal(store.users.get("usr_sofia")!.teacherId, null);
    assert.equal(store.profiles.findUnique("userId", "usr_sofia")!.groupId, null);
    assert.equal(store.parentCalls.by("studentId", "usr_egor").length, calls);
    assert.ok(store.parentCalls.by("studentId", "usr_egor").every((call) => call.teacherId === null));

    // StoredFile.uploadedById is Restrict: a user with uploads cannot be deleted.
    assert.equal(cascade.deleteTeacher(store, "usr_dev", TEST_T0), false);
    assert.ok(store.users.has("usr_dev"));
  });

  it("deletes a group, a topic and a homework the way the database does", () => {
    const store = seeded();

    cascade.deleteGroup(store, "grp_8a", TEST_T0);
    assert.equal(store.profiles.by("groupId", "grp_8a").length, 0);
    assert.equal(store.lessons.get("les_live")!.groupId, null);

    const removedFiles = cascade.deleteTopic(store, "top_log", TEST_T0);
    assert.equal(removedFiles, 3);
    assert.equal(store.numbers.by("topicId", "top_log").length, 0);
    assert.equal(store.homeworks.by("topicId", "top_log").length, 0);
    assert.equal(store.statuses.by("homeworkNumberId", "num_010203").length, 0);
    assert.equal(store.lessonItems.by("homeworkNumberId", "num_010203").length, 0);
    assert.equal(store.lessons.get("hp_ready")!.topicId, null);

    const deadlineBefore = store.statuses.findUnique("studentNumber", "usr_ilya|num_118")!.deadlineAt;
    cascade.deleteHomeworkAssignment(store, "hw_ilya_overdue");
    assert.equal(store.homeworks.has("hw_ilya_overdue"), false);
    assert.equal(store.homeworkChecks.by("assignmentId", "hw_ilya_overdue").length, 0);
    // The mirrored deadline is the caller's job; the status row itself must survive.
    assert.equal(store.statuses.findUnique("studentNumber", "usr_ilya|num_118")!.deadlineAt, deadlineBefore);
    // A draft's stamp is a plain string: cancelling the homework does not touch the draft.
    cascade.deleteHomeworkAssignment(store, "hw_artem_issued");
    assert.equal(store.participants.get("lp_hp_issued_artem")!.issuedAssignmentId, "hw_artem_issued");
  });
});

describe("mock store: persistence", () => {
  it("round-trips the whole store through the key-value adapter", async () => {
    const storage = createMemoryStorage();
    const store = seeded();
    store.users.update("usr_ilya", { name: "Сохранённый Илья" });
    store.patchSettings({ loginHelpContact: "@changed" });
    const persistence = new MockPersistence(storage);
    persistence.schedule(store);
    await persistence.flush();

    // One key per table plus the manifest; every value stays small.
    assert.equal(storage.data.size, MOCK_TABLE_NAMES.length + 1);
    for (const value of storage.data.values()) assert.ok(value.length < 500_000);

    const loaded = await new MockPersistence(storage).load();
    assert.ok(loaded);
    const restored = new MockStore(loaded);
    assert.deepEqual(restored.snapshot(), store.snapshot());
    assert.equal(restored.users.get("usr_ilya")!.name, "Сохранённый Илья");
    assert.equal(restored.settings.loginHelpContact, "@changed");
    assert.equal(restored.meta.t0, T0);
  });

  it("rewrites only the tables that changed", async () => {
    const storage = createMemoryStorage();
    const written: string[] = [];
    const recording = { ...storage, setItem: async (key: string, value: string) => { written.push(key); await storage.setItem(key, value); } };
    const store = seeded();
    const persistence = new MockPersistence(recording);
    persistence.schedule(store);
    await persistence.flush();
    written.length = 0;

    store.notifications.update("ntf_ilya_8", { readAt: TEST_T0 });
    persistence.schedule(store);
    await persistence.flush();
    assert.deepEqual(written, [`shbz-mock:v${MOCK_STORE_VERSION}:t:notifications`, `shbz-mock:v${MOCK_STORE_VERSION}:manifest`]);

    // Nothing changed → nothing written.
    written.length = 0;
    persistence.schedule(store);
    await persistence.flush();
    assert.deepEqual(written, []);
  });

  it("answers null for a missing, foreign-version, corrupt or torn snapshot", async () => {
    assert.equal(await new MockPersistence(createMemoryStorage()).load(), null);

    const storage = createMemoryStorage();
    const store = seeded();
    const persistence = new MockPersistence(storage);
    persistence.schedule(store);
    await persistence.flush();
    const manifestKey = `shbz-mock:v${MOCK_STORE_VERSION}:manifest`;
    const usersKey = `shbz-mock:v${MOCK_STORE_VERSION}:t:users`;

    const corrupt = createMemoryStorage(storage.data);
    corrupt.data.set(usersKey, "{not json");
    assert.equal(await new MockPersistence(corrupt).load(), null);

    const missing = createMemoryStorage(storage.data);
    missing.data.delete(usersKey);
    assert.equal(await new MockPersistence(missing).load(), null);

    const foreign = createMemoryStorage(storage.data);
    foreign.data.set(manifestKey, JSON.stringify({ ...JSON.parse(storage.data.get(manifestKey)!), version: MOCK_STORE_VERSION + 1 }));
    assert.equal(await new MockPersistence(foreign).load(), null);

    // A table written by a save whose manifest never landed (the id counter and the rows would disagree).
    const torn = createMemoryStorage(storage.data);
    const table = JSON.parse(storage.data.get(usersKey)!) as { seq: number; rows: unknown[] };
    torn.data.set(usersKey, JSON.stringify({ ...table, seq: table.seq + 1 }));
    assert.equal(await new MockPersistence(torn).load(), null);
  });

  it("survives a failing adapter and retries the same keys with the next save", async () => {
    const storage = createMemoryStorage();
    let fail = true;
    const flaky = { ...storage, setItem: async (key: string, value: string) => { if (fail) throw new Error("quota exceeded"); await storage.setItem(key, value); } };
    const store = seeded();
    const persistence = new MockPersistence(flaky);
    persistence.schedule(store);
    await persistence.flush();
    assert.equal(storage.data.size, 0);
    assert.ok(store.hasDirty());

    fail = false;
    persistence.schedule(store);
    await persistence.flush();
    assert.equal(storage.data.size, MOCK_TABLE_NAMES.length + 1);
    assert.ok(await new MockPersistence(storage).load());
  });
});

describe("mock clock", () => {
  it("stands still until advanced and fires timers in due order", () => {
    const clock = createManualClock(TEST_T0);
    const fired: string[] = [];
    clock.setTimeout(() => fired.push(`b@${clock.now() - T0}`), 2000);
    clock.setTimeout(() => {
      fired.push(`a@${clock.now() - T0}`);
      // A follow-up scheduled from a callback keeps its spacing.
      clock.setTimeout(() => fired.push(`c@${clock.now() - T0}`), 500);
    }, 1000);
    const cancelled = clock.setTimeout(() => fired.push("never"), 1500);
    cancelled.cancel();

    assert.equal(clock.now(), T0);
    clock.advance(999);
    assert.deepEqual(fired, []);
    clock.advance(2001);
    assert.deepEqual(fired, ["a@1000", "c@1500", "b@2000"]);
    assert.equal(clock.now(), T0 + 3000);
    assert.equal(clock.pendingTimers(), 0);
    assert.throws(() => clock.advance(-1), /backwards/);
  });

  it("sleep never resolves synchronously and waits for the clock", async () => {
    const clock = createManualClock(TEST_T0);
    let done = false;
    const immediate = clock.sleep(0).then(() => { done = true; });
    assert.equal(done, false);
    await immediate;
    assert.equal(done, true);

    let woke = false;
    const sleeping = clock.sleep(300).then(() => { woke = true; });
    await Promise.resolve();
    assert.equal(woke, false);
    clock.advance(300);
    await sleeping;
    assert.equal(woke, true);
  });
});
