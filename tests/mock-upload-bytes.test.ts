// Content checks of uploads in the mock (the site's `saveUploadedFile` → `validateUploadedBytes`): the real
// size equals the declared one and the magic bytes match the extension — topic files of the developer and
// solution photos of a student (homework and lesson submissions). The bytes come from the device hook
// `readUploadBytes`; content that cannot be read is not checked.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import { readPickedFileBytes } from "../src/mock/upload-bytes";
import { createTestMock, type TestMock } from "../src/mock/testing";

const PDF = new TextEncoder().encode("%PDF-1.7\n%test\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const TEXT = new TextEncoder().encode("notjpeg");

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const SIGNATURE_RU = "Содержимое файла не соответствует заявленному формату.";

async function rejects(promise: Promise<unknown>, code: AnyApiErrorCode, status: number): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
  throw new assert.AssertionError({ message: `expected a rejection with "${code}"` });
}

/** A mock whose device hook serves `files` by URI; an unknown URI reads as "cannot be read". */
function mockWithBytes(files: Record<string, Uint8Array>): TestMock {
  return createTestMock({ readUploadBytes: async (uri) => files[uri] ?? null });
}

describe("content.uploadFile checks the content", () => {
  it("refuses bytes that do not match the extension, and a size that does not match the declared one", async () => {
    const mock = mockWithBytes({ "file:///x.docx": PDF, "file:///img.jpeg": PNG, "file:///x.jpg": TEXT, "file:///ok.pdf": PDF, "file:///short.pdf": PDF });
    await mock.signIn("dev@example.com");
    const upload = (name: string, bytes: Uint8Array, size = bytes.byteLength) =>
      mock.api.content.uploadFile({ uri: `file:///${name}`, name, mimeType: "", size });

    const refused = await rejects(upload("x.docx", PDF), "uploadUnsupportedType", 400);
    assert.equal(refused.message, SIGNATURE_RU);
    await rejects(upload("img.jpeg", PNG), "uploadUnsupportedType", 400);
    await rejects(upload("x.jpg", TEXT), "uploadUnsupportedType", 400);
    const mismatch = await rejects(upload("short.pdf", PDF, PDF.byteLength + 1), "uploadRejected", 400);
    assert.equal(mismatch.message, "Фактический размер файла не совпадает с заявленным.");
    assert.equal(mock.store.files.all().filter((file) => file.localUri !== null).length, 0, "nothing refused is stored");

    const stored = await upload("ok.pdf", PDF);
    assert.equal(stored.mimeType, "application/pdf");

    mock.setLocale("en");
    assert.equal((await rejects(upload("x.jpg", TEXT), "uploadUnsupportedType", 400)).message, "The file contents do not match the declared format.");
  });

  it("does not check content it cannot read", async () => {
    const mock = mockWithBytes({});
    await mock.signIn("dev@example.com");
    const stored = await mock.api.content.uploadFile({ uri: "file:///unreadable.pdf", name: "unreadable.pdf", mimeType: "application/pdf", size: 10 });
    assert.equal(stored.size, 10);
  });
});

describe("student photo uploads check the content", () => {
  it("homework photos: a mislabelled photo is refused after the homework and limit checks, nothing is attached", async () => {
    const mock = mockWithBytes({ "file:///a.jpg": JPEG, "file:///b.jpg": PNG });
    await mock.signIn("ilya@example.com");
    const photo = (name: string, size: number) => ({ uri: `file:///${name}`, name, mimeType: "image/jpeg" as const, size });
    const attached = () => mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_soon").length;
    const before = attached();

    const refused = await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_soon", [photo("a.jpg", JPEG.byteLength), photo("b.jpg", PNG.byteLength)]), "uploadUnsupportedType", 400);
    assert.equal(refused.message, SIGNATURE_RU);
    await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_soon", [photo("a.jpg", JPEG.byteLength + 5)]), "uploadRejected", 400);
    assert.equal(attached(), before);
    // A foreign / missing homework is still a 404 first, as on the site.
    await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_missing", [photo("b.jpg", PNG.byteLength)]), "homeworkNotFound", 404);

    await mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_soon", [photo("a.jpg", JPEG.byteLength)]);
    assert.equal(attached(), before + 1);
  });

  it("lesson submissions: a mislabelled photo is refused and no submission is created", async () => {
    const mock = mockWithBytes({ "file:///a.png": JPEG, "file:///b.png": PNG });
    await mock.signIn("polina@example.com");
    const lesson = (await mock.api.studentWork.getLiveLesson()).active;
    assert.ok(lesson);
    const item = lesson.items.find((entry) => entry.canSubmit && entry.submission === null);
    assert.ok(item);
    const photo = (name: string, size: number) => ({ uri: `file:///${name}`, name, mimeType: "image/png" as const, size });
    const before = mock.store.submissions.all().length;

    await rejects(mock.api.studentWork.submitLessonItem(lesson.lessonId, item.id, [photo("a.png", JPEG.byteLength)]), "uploadUnsupportedType", 400);
    assert.equal(mock.store.submissions.all().length, before);
    await mock.api.studentWork.submitLessonItem(lesson.lessonId, item.id, [photo("b.png", PNG.byteLength)]);
    assert.equal(mock.store.submissions.all().length, before + 1);
  });
});

describe("readPickedFileBytes (the default device hook)", () => {
  it("reads data: URLs and leaves native file URIs to the device", async () => {
    const bytes = await readPickedFileBytes(`data:application/pdf;base64,${toBase64(PDF)}`);
    assert.deepEqual(bytes, PDF);
    assert.equal(await readPickedFileBytes("file:///cache/a.jpg"), null);
    assert.equal(await readPickedFileBytes("content://media/1"), null);
    assert.equal(await readPickedFileBytes("blob:http://localhost/does-not-exist"), null);
  });

  it("is the mock's default: a data: URL with the wrong content is refused", async () => {
    const mock = createTestMock();
    await mock.signIn("dev@example.com");
    const uri = `data:image/jpeg;base64,${toBase64(TEXT)}`;
    await rejects(mock.api.content.uploadFile({ uri, name: "x.jpg", mimeType: "image/jpeg", size: TEXT.byteLength }), "uploadUnsupportedType", 400);
  });
});
