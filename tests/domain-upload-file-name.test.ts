// Ported from the site (tests/upload-file-name.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { getSafeUploadFileName } from "@/domain/upload-file-name";

test("getSafeUploadFileName keeps extension and strips unsafe characters", () => {
  assert.equal(getSafeUploadFileName("Résumé final 2026.PDF"), "Resume-final-2026.pdf");
  assert.equal(getSafeUploadFileName("report(1).docx"), "report-1.docx");
});

test("getSafeUploadFileName falls back to file when name becomes empty", () => {
  assert.equal(getSafeUploadFileName("???###.png"), "file.png");
  assert.equal(getSafeUploadFileName("   "), "file");
});
