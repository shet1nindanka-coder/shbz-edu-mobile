// Which bundled sample stands in for a file in mock mode (docs/spec/09-data-i18n-math.md §5.2: "the mock
// implementation returns bundled assets by fileId"). Pure selection only — the assets themselves are
// required in `mock-sample-assets.ts`, so this module is safe for tests.
import { fileKindOf, hashFileId } from './file-names';

export const MOCK_PHOTO_COUNT = 8;

export type MockPhotoIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type MockSampleKey =
  | 'pdfLong'
  | 'pdfShort'
  | 'docx'
  | 'cheatsheet'
  /** The print version of a lesson handout (an HTML page, `planner.getHandoutUrl({ format: 'html' })`). */
  | 'printHtml'
  | `photo${MockPhotoIndex}`
  | `photo${MockPhotoIndex}Thumb`;

/** What the mock knows about a file. Only `id` and `mimeType` are required. */
export type MockFileMeta = {
  id: string;
  mimeType: string;
  originalName?: string;
  /** Declared size in bytes; a big PDF maps to the 12-page sample. */
  size?: number;
  /** Explicit choice by the fixture author; wins over the heuristics. */
  sample?: MockSampleKey;
};

/** A PDF this large is "the long one" (the fixture's 12-page theory file is 1.4 MB). */
const LONG_PDF_BYTES = 512 * 1024;
/** Image files that are documents rather than photographed notebooks. */
const DOCUMENT_IMAGE_NAME = /cheat|theory|шпаргал|теори|таблиц|конспект/i;

function photoKey(fileId: string): `photo${MockPhotoIndex}` {
  return `photo${((hashFileId(fileId) % MOCK_PHOTO_COUNT) + 1) as MockPhotoIndex}`;
}

/**
 * Deterministic sample for a file: by MIME type first, then by a hash of the id, so the same file always
 * shows the same picture and different photos of one homework differ. `null` → no sample for this type.
 */
export function pickMockSample(meta: MockFileMeta, variant: 'original' | 'thumb' = 'original'): MockSampleKey | null {
  if (meta.sample) return meta.sample;
  switch (fileKindOf(meta.mimeType)) {
    case 'pdf':
      if (typeof meta.size === 'number' && meta.size > 0) {
        return meta.size >= LONG_PDF_BYTES ? 'pdfLong' : 'pdfShort';
      }
      return hashFileId(meta.id) % 3 === 0 ? 'pdfLong' : 'pdfShort';
    case 'docx':
      return 'docx';
    case 'image': {
      if (meta.originalName && DOCUMENT_IMAGE_NAME.test(meta.originalName)) return 'cheatsheet';
      const photo = photoKey(meta.id);
      return variant === 'thumb' ? `${photo}Thumb` : photo;
    }
    default:
      return null;
  }
}

/** The sample for an id nothing is known about: `source()` is only ever asked for images. */
export function pickMockPhoto(fileId: string, variant: 'original' | 'thumb' = 'original'): MockSampleKey {
  const photo = photoKey(fileId);
  return variant === 'thumb' ? `${photo}Thumb` : photo;
}

/** Real type and a plausible name of each sample (the cached copy is named after the requested file). */
export const MOCK_SAMPLE_MIME: Record<MockSampleKey, string> = {
  pdfLong: 'application/pdf',
  pdfShort: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  cheatsheet: 'image/jpeg',
  printHtml: 'text/html',
  photo1: 'image/jpeg',
  photo2: 'image/jpeg',
  photo3: 'image/jpeg',
  photo4: 'image/jpeg',
  photo5: 'image/jpeg',
  photo6: 'image/jpeg',
  photo7: 'image/jpeg',
  photo8: 'image/jpeg',
  photo1Thumb: 'image/jpeg',
  photo2Thumb: 'image/jpeg',
  photo3Thumb: 'image/jpeg',
  photo4Thumb: 'image/jpeg',
  photo5Thumb: 'image/jpeg',
  photo6Thumb: 'image/jpeg',
  photo7Thumb: 'image/jpeg',
  photo8Thumb: 'image/jpeg',
};

/** Runtime check for a key coming from outside the device layer (a `mock-sample://` URL of the backend). */
export function isMockSampleKey(value: string): value is MockSampleKey {
  return Object.prototype.hasOwnProperty.call(MOCK_SAMPLE_MIME, value);
}
