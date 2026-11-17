// Pure parts of the file services: naming of cached copies, the deterministic choice of mock samples,
// the registry of files picked on the device, photo normalisation rules, and the bundled sample files.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { applyDescription, fileTypeLabel, toDownloadable, viewerFileKind, viewerFileName } from "@/components/files/viewer-file";
import { validateUploadedBytes } from "@/domain/upload-validation";
import {
  cacheFileName,
  extensionForMime,
  fileKindOf,
  hashFileId,
  safeFileId,
  utiForMime
} from "@/services/files/file-names";
import { MOCK_DOCX_BASE64, MOCK_DOCX_SIZE } from "@/services/files/generated/mock-docx";
import {
  clearLocalFileRegistry,
  getRegisteredLocalFile,
  registerLocalFile,
  unregisterLocalFile
} from "@/services/files/local-file-registry";
import { MOCK_PRINT_HTML } from "@/services/files/mock-print-html";
import { MOCK_PHOTO_COUNT, MOCK_SAMPLE_MIME, isMockSampleKey, pickMockPhoto, pickMockSample } from "@/services/files/mock-samples";
import {
  clampSelectionLimit,
  IOS_PICKER_EXIT_MS,
  normalisedPhotoName,
  pickerExitRemainingMs,
  PHOTO_MAX_SIDE,
  planPhotoResize
} from "@/services/photos/photo-rules";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** `atob` exists in Node and in every app runtime; no Buffer, so the test needs no Node typings. */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

test("hashFileId is stable and spreads ids", () => {
  assert.equal(hashFileId(""), 0x811c9dc5);
  assert.equal(hashFileId("file_theory_linear"), hashFileId("file_theory_linear"));
  assert.notEqual(hashFileId("file_a"), hashFileId("file_b"));
  assert.ok(Number.isInteger(hashFileId("фото")) && hashFileId("фото") >= 0);
});

test("safeFileId keeps cuid-like ids and neutralises path characters", () => {
  assert.equal(safeFileId("clx9a8b7c0001"), "clx9a8b7c0001");
  assert.equal(safeFileId("file_photo-1"), "file_photo-1");
  assert.equal(safeFileId("../../etc/passwd"), "_etc_passwd");
  assert.match(safeFileId("///"), /^_$/);
  assert.match(safeFileId(""), /^file_[0-9a-z]+$/);
  assert.ok(safeFileId("x".repeat(500)).length <= 96);
});

test("cacheFileName is ASCII-safe and carries the extension of the real type", () => {
  assert.equal(cacheFileName("linear-equations-theory.pdf", "application/pdf"), "linear-equations-theory.pdf");
  assert.equal(cacheFileName("Теория 1.pdf", "application/pdf"), "1.pdf");
  assert.equal(cacheFileName("Теория.pdf", "application/pdf"), "file.pdf");
  assert.equal(cacheFileName("photo.JPEG", "image/jpeg"), "photo.jpeg");
  assert.equal(cacheFileName("IMG_0001.HEIC", "image/jpeg"), "IMG_0001.heic.jpg");
  assert.equal(cacheFileName("scan.png", "image/jpeg"), "scan.jpg");
  assert.equal(cacheFileName("report", "application/pdf"), "report.pdf");
  assert.equal(cacheFileName("", "application/pdf"), "file.pdf");
  assert.equal(cacheFileName("notes.txt", "text/plain"), "notes.txt");
});

test("MIME helpers: extension, UTI, viewer kind", () => {
  assert.equal(extensionForMime("application/pdf"), ".pdf");
  assert.equal(extensionForMime(" IMAGE/JPEG "), ".jpg");
  assert.equal(extensionForMime("text/plain"), "");
  assert.equal(utiForMime("application/pdf"), "com.adobe.pdf");
  assert.equal(utiForMime(DOCX_MIME), "org.openxmlformats.wordprocessingml.document");
  assert.equal(utiForMime("text/plain"), undefined);
  assert.equal(fileKindOf("image/png"), "image");
  assert.equal(fileKindOf("application/pdf"), "pdf");
  assert.equal(fileKindOf(DOCX_MIME), "docx");
  assert.equal(fileKindOf("image/webp"), "other");
});

test("mock samples: PDFs by size, then by hash", () => {
  assert.equal(pickMockSample({ id: "a", mimeType: "application/pdf", size: 1_400_000 }), "pdfLong");
  assert.equal(pickMockSample({ id: "a", mimeType: "application/pdf", size: 48_000 }), "pdfShort");

  const byHash = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"].map((id) =>
    pickMockSample({ id, mimeType: "application/pdf" })
  );

  assert.ok(byHash.includes("pdfLong") && byHash.includes("pdfShort"));
  assert.deepEqual(
    byHash,
    ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"].map((id) => pickMockSample({ id, mimeType: "application/pdf" }))
  );
});

test("mock samples: DOCX, unknown types, explicit choice", () => {
  assert.equal(pickMockSample({ id: "a", mimeType: DOCX_MIME }), "docx");
  assert.equal(pickMockSample({ id: "a", mimeType: "text/plain" }), null);
  assert.equal(pickMockSample({ id: "a", mimeType: "image/jpeg", sample: "cheatsheet" }), "cheatsheet");
});

test("mock samples: photos are spread over the eight samples, thumbs match their originals", () => {
  const ids = Array.from({ length: 200 }, (_, index) => `file_photo_${index}`);
  const used = new Set(ids.map((id) => pickMockSample({ id, mimeType: "image/jpeg" })));

  assert.equal(used.size, MOCK_PHOTO_COUNT);

  for (const id of ids.slice(0, 20)) {
    const original = pickMockSample({ id, mimeType: "image/jpeg" });
    const thumb = pickMockSample({ id, mimeType: "image/jpeg" }, "thumb");

    assert.equal(thumb, `${original}Thumb`);
    assert.equal(pickMockPhoto(id), original);
    assert.equal(pickMockPhoto(id, "thumb"), thumb);
  }
});

test("mock samples: a theory image is the formula sheet, not a notebook photo", () => {
  assert.equal(
    pickMockSample({ id: "a", mimeType: "image/png", originalName: "derivative-cheatsheet.png" }),
    "cheatsheet"
  );
  assert.match(
    String(pickMockSample({ id: "a", mimeType: "image/jpeg", originalName: "IMG_2041.jpg" })),
    /^photo[1-8]$/
  );
});

test("every photo sample has a thumbnail twin and a MIME type", () => {
  for (let index = 1; index <= MOCK_PHOTO_COUNT; index += 1) {
    assert.equal(MOCK_SAMPLE_MIME[`photo${index}` as keyof typeof MOCK_SAMPLE_MIME], "image/jpeg");
    assert.equal(MOCK_SAMPLE_MIME[`photo${index}Thumb` as keyof typeof MOCK_SAMPLE_MIME], "image/jpeg");
  }

  assert.equal(Object.keys(MOCK_SAMPLE_MIME).length, MOCK_PHOTO_COUNT * 2 + 5);
});

test("the bundled DOCX is a real Word file by the site's upload rules", () => {
  const bytes = decodeBase64(MOCK_DOCX_BASE64);

  assert.equal(bytes.byteLength, MOCK_DOCX_SIZE);
  assert.doesNotThrow(() => validateUploadedBytes(bytes, "homework.docx", DOCX_MIME));
  // The same bytes under another extension are rejected: the signature check is real.
  assert.throws(() => validateUploadedBytes(bytes, "homework.pdf", "application/pdf"));
});

test("local file registry: register, replace, unregister, clear", () => {
  clearLocalFileRegistry();
  assert.equal(getRegisteredLocalFile("file_1"), null);

  const picked = { uri: "file:///cache/a.jpg", mimeType: "image/jpeg", originalName: "a.jpg", size: 1200 };
  registerLocalFile("file_1", picked);
  assert.deepEqual(getRegisteredLocalFile("file_1"), picked);
  // A copy is stored: later changes to the caller's object do not leak in.
  assert.notEqual(getRegisteredLocalFile("file_1"), picked);

  registerLocalFile("file_1", { ...picked, uri: "file:///documents/file_1.jpg" });
  assert.equal(getRegisteredLocalFile("file_1")?.uri, "file:///documents/file_1.jpg");

  assert.equal(unregisterLocalFile("file_1"), true);
  assert.equal(unregisterLocalFile("file_1"), false);

  registerLocalFile("file_2", picked);
  clearLocalFileRegistry();
  assert.equal(getRegisteredLocalFile("file_2"), null);
});

test("photo resize: long side at most 2400, never upscaled", () => {
  assert.equal(PHOTO_MAX_SIDE, 2400);
  assert.deepEqual(planPhotoResize(4032, 3024), { width: 2400 });
  assert.deepEqual(planPhotoResize(3024, 4032), { height: 2400 });
  assert.deepEqual(planPhotoResize(3000, 3000), { width: 2400 });
  assert.equal(planPhotoResize(2400, 1800), null);
  assert.equal(planPhotoResize(900, 1200), null);
  assert.equal(planPhotoResize(0, 0), null);
  assert.equal(planPhotoResize(Number.NaN, 100), null);
});

test("photo names end in .jpg and stay ASCII", () => {
  assert.equal(normalisedPhotoName("IMG_0042.HEIC", 1700000000000, 0), "IMG_0042.jpg");
  assert.equal(normalisedPhotoName("scan 3.png", 1700000000000, 0), "scan-3.jpg");
  assert.equal(normalisedPhotoName("решение.jpg", 1700000000000, 2), "photo-1700000000000-3.jpg");
  assert.equal(normalisedPhotoName(null, 1700000000000, 0), "photo-1700000000000-1.jpg");
  assert.equal(normalisedPhotoName("  ", 5, 1), "photo-5-2.jpg");
  assert.equal(normalisedPhotoName("noextension", 5, 0), "noextension.jpg");
  assert.ok(normalisedPhotoName(`${"a".repeat(300)}.jpg`, 5, 0).length <= 84);
});

test("selection limit: free slots, single pick, no slots", () => {
  assert.equal(clampSelectionLimit(undefined, false), 1);
  assert.equal(clampSelectionLimit(5, false), 1);
  assert.equal(clampSelectionLimit(0, false), 0);
  assert.equal(clampSelectionLimit(undefined, true), 0);
  assert.equal(clampSelectionLimit(3, true), 3);
  assert.equal(clampSelectionLimit(-2, true), 0);
  assert.equal(clampSelectionLimit(2.9, true), 2);
});

test("viewer file helpers", () => {
  const pdf = { id: "f", originalName: "theory.pdf", mimeType: "application/pdf", size: 10 };

  assert.equal(viewerFileKind(pdf), "pdf");
  assert.equal(fileTypeLabel(pdf), "PDF");
  assert.equal(fileTypeLabel({ originalName: "a.docx", mimeType: DOCX_MIME }), "DOCX");
  assert.equal(fileTypeLabel({ originalName: "notes.txt", mimeType: "text/plain" }), "TXT");
  assert.equal(fileTypeLabel({ originalName: "noext", mimeType: "application/octet-stream" }), "");
  assert.deepEqual(toDownloadable(pdf), pdf);
  assert.deepEqual(toDownloadable({ id: "p", originalName: "a.jpg", mimeType: "image/jpeg", localUri: "file:///a.jpg" }), {
    id: "p",
    originalName: "a.jpg",
    mimeType: "image/jpeg"
  });
  // A file a deep link names by id only has no name of its own (viewer-handoff): the neutral word is shown.
  assert.equal(viewerFileName(pdf, "Файл"), "theory.pdf");
  assert.equal(viewerFileName({ originalName: "" }, "Файл"), "Файл");
  assert.equal(viewerFileName({ originalName: "  " }, "File"), "File");
  assert.equal(fileTypeLabel({ originalName: "", mimeType: "" }), "");
});

test("a file known by id alone is typed from the stored file, never from its link", () => {
  const linked = { id: "f", originalName: "", mimeType: "" };
  const stored = { id: "f", originalName: "linear-equations-theory.pdf", mimeType: "application/pdf", size: 1400 };
  // Described: the stored name, type and size — the page is a PDF and the header shows the real name.
  const described = applyDescription(linked, { status: "ready", ref: stored });
  assert.deepEqual(described, stored);
  assert.equal(viewerFileKind(described), "pdf");
  assert.equal(viewerFileName(described, "Файл"), "linear-equations-theory.pdf");
  // Whatever the link wrote is not used, before or after the description.
  const forged = { id: "f", originalName: "Введите пароль", mimeType: "image/png", size: 5 };
  assert.deepEqual(applyDescription(forged, { status: "ready", ref: stored }), stored);
  assert.deepEqual(applyDescription(forged, undefined), linked);
  // Not described (404, network): no name, no type — the page downloads it by id and shows that error.
  assert.deepEqual(applyDescription(forged, { status: "failed", notFound: false }), linked);
  // An unknown size is not passed on.
  assert.deepEqual(applyDescription(linked, { status: "ready", ref: { ...stored, size: 0 } }), {
    id: "f",
    originalName: stored.originalName,
    mimeType: stored.mimeType
  });
});

test("iOS: a picked photo is reported only after the system picker has left the screen", () => {
  assert.equal(pickerExitRemainingMs("ios", 1000, 1000), IOS_PICKER_EXIT_MS);
  // The re-encoding already took part of the wait.
  assert.equal(pickerExitRemainingMs("ios", 1000, 1400), IOS_PICKER_EXIT_MS - 400);
  assert.equal(pickerExitRemainingMs("ios", 1000, 1000 + IOS_PICKER_EXIT_MS + 50), 0);
  // Android re-shows a refused dialog itself; web has no native modal.
  assert.equal(pickerExitRemainingMs("android", 1000, 1000), 0);
  assert.equal(pickerExitRemainingMs("web", 1000, 1000), 0);
});

test("the mock print version of a handout is a real HTML document", () => {
  assert.equal(MOCK_SAMPLE_MIME.printHtml, "text/html");
  assert.match(MOCK_PRINT_HTML.trimStart(), /^<!doctype html>/i);
  assert.equal(isMockSampleKey("printHtml"), true);
  assert.equal(isMockSampleKey("pdfLong"), true);
  assert.equal(isMockSampleKey("toString"), false);
});
