// Ported from the site (tests/upload-validation.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ORIGINAL_FILE_NAME_LENGTH,
  MAX_UPLOAD_SIZE_BYTES,
  UploadValidationError,
  validateUploadMetadata,
  validateUploadedBytes
} from "@/domain/upload-validation";

// [MOBILE] The site test builds its fixtures with Node's `Buffer`; these helpers do the same with plain
// typed arrays so the test file needs no Node globals.
function ascii(text: string) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

function createZip(entries: (string | Uint8Array)[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = typeof entry === "string" ? new TextEncoder().encode(entry) : entry;
    const localHeader = new Uint8Array(30);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(26, name.byteLength, true);
    localParts.push(localHeader, name);

    const centralHeader = new Uint8Array(46);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.byteLength + name.byteLength;
  }

  const centralDirectory = concat(centralParts);
  const endRecord = new Uint8Array(22);
  const end = new DataView(endRecord.buffer);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralDirectory.byteLength, true);
  end.setUint32(16, localOffset, true);

  return concat([...localParts, centralDirectory, endRecord]);
}

test("accepts PDF, PNG and JPEG only when their magic bytes match", () => {
  const pdf = ascii("%PDF-1.7\n");
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

  assert.equal(validateUploadedBytes(pdf, "document.pdf", "application/pdf").mimeType, "application/pdf");
  assert.equal(validateUploadedBytes(png, "image.png", "image/png").mimeType, "image/png");
  assert.equal(validateUploadedBytes(jpeg, "image.jpeg", "image/jpeg").mimeType, "image/jpeg");

  assert.throws(
    () => validateUploadedBytes(ascii("not a pdf"), "document.pdf", "application/pdf"),
    UploadValidationError
  );
  assert.throws(() => validateUploadedBytes(pdf, "image.png", "image/png"), UploadValidationError);
});

test("accepts a structurally valid DOCX package with OOXML markers", () => {
  const docx = createZip(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  const result = validateUploadedBytes(
    docx,
    "homework.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  assert.equal(result.extension, ".docx");
  assert.equal(result.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
});

test("rejects ZIP files that are not DOCX packages", () => {
  const missingContentTypes = createZip(["word/document.xml"]);
  const missingWordPart = createZip(["[Content_Types].xml", "docProps/core.xml"]);
  const fakeZip = ascii("PK\u0003\u0004[Content_Types].xml word/document.xml");
  const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  assert.throws(
    () => validateUploadedBytes(missingContentTypes, "homework.docx", mimeType),
    UploadValidationError
  );
  assert.throws(() => validateUploadedBytes(missingWordPart, "homework.docx", mimeType), UploadValidationError);
  assert.throws(() => validateUploadedBytes(fakeZip, "homework.docx", mimeType), UploadValidationError);
});

test("rejects mismatched MIME, claimed size and overlong originalName", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  assert.throws(() => validateUploadedBytes(png, "image.png", "application/pdf"), UploadValidationError);
  assert.throws(() => validateUploadedBytes(png, "image.png", "image/png", png.byteLength + 1), UploadValidationError);
  assert.throws(
    () => validateUploadedBytes(png, `${"a".repeat(MAX_ORIGINAL_FILE_NAME_LENGTH)}.png`, "image/png"),
    UploadValidationError
  );

  assert.equal(validateUploadedBytes(png, "image.png", "application/octet-stream").mimeType, "image/png");
});

// ── [MOBILE] additions ──────────────────────────────────────────────────────────────────────────────

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test("DOCX entry names are decoded as strict UTF-8 without TextDecoder", () => {
  // Non-ASCII (2-, 3- and 4-byte) entry names are fine.
  const withUnicodeNames = createZip(["[Content_Types].xml", "word/документ.xml", "word/メモ.xml", "word/😀.xml"]);
  assert.equal(validateUploadedBytes(withUnicodeNames, "домашка.docx", DOCX_MIME).extension, ".docx");

  // Malformed names reject the whole package, exactly like `new TextDecoder("utf-8", { fatal: true })`.
  const malformed: Uint8Array[] = [
    Uint8Array.from([0x77, 0x6f, 0x72, 0x64, 0x2f, 0xff]), // invalid lead byte
    Uint8Array.from([0x77, 0x6f, 0x72, 0x64, 0x2f, 0xc3]), // truncated sequence
    Uint8Array.from([0x77, 0x6f, 0x72, 0x64, 0x2f, 0xc0, 0xaf]), // overlong "/"
    Uint8Array.from([0x77, 0x6f, 0x72, 0x64, 0x2f, 0xed, 0xa0, 0x80]), // UTF-16 surrogate
    Uint8Array.from([0x77, 0x6f, 0x72, 0x64, 0x2f, 0xf4, 0x90, 0x80, 0x80]), // above U+10FFFF
    Uint8Array.from([0x77, 0x6f, 0x72, 0x64, 0x2f, 0x80]) // stray continuation byte
  ];

  for (const name of malformed) {
    const broken = createZip(["[Content_Types].xml", "word/document.xml", name]);

    assert.throws(() => validateUploadedBytes(broken, "homework.docx", DOCX_MIME), UploadValidationError);
  }
});

test("validateUploadMetadata checks name, extension, size and declared MIME, with localised messages", () => {
  assert.deepEqual(validateUploadMetadata("  Теория.PDF ", "application/pdf", 1024), {
    originalName: "Теория.PDF",
    extension: ".pdf",
    mimeType: "application/pdf"
  });
  assert.equal(validateUploadMetadata("photo.JPG", "", 10).mimeType, "image/jpeg");

  assert.throws(() => validateUploadMetadata("", "application/pdf", 10), UploadValidationError);
  assert.throws(() => validateUploadMetadata("bad\u0007name.pdf", "application/pdf", 10), UploadValidationError);
  assert.throws(() => validateUploadMetadata("archive.zip", "application/zip", 10), UploadValidationError);
  assert.throws(() => validateUploadMetadata("empty.pdf", "application/pdf", 0), UploadValidationError);
  assert.throws(() => validateUploadMetadata("huge.pdf", "application/pdf", MAX_UPLOAD_SIZE_BYTES + 1), UploadValidationError);
  assert.equal(validateUploadMetadata("max.pdf", "application/pdf", MAX_UPLOAD_SIZE_BYTES).extension, ".pdf");
  assert.throws(() => validateUploadMetadata("scan.png", "image/jpeg", 10), UploadValidationError);

  const messageOf = (locale: "ru" | "en") => {
    try {
      validateUploadMetadata("archive.zip", "application/zip", 10, locale);
    } catch (error) {
      return error instanceof Error ? error.message : "";
    }

    return "";
  };

  assert.notEqual(messageOf("ru"), "");
  assert.notEqual(messageOf("en"), "");
  assert.notEqual(messageOf("ru"), messageOf("en"));
  assert.doesNotMatch(messageOf("en"), /[А-Яа-яЁё]/);
});
