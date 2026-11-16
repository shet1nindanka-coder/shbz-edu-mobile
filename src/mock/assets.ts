/**
 * Bundled sample files of the mock. The mock backend is pure TypeScript and never touches bytes: a fixture
 * file row names the SAMPLE that stands in for it (`MockStoredFile.sample`), an uploaded file row keeps the
 * local URI it was picked from, and generated documents (PDF reports, lesson handouts) are represented by a
 * sample as well. The device layer (`src/services/files`, mock `FileService`) owns the bytes: it maps a
 * sample key to the bundled file under `assets/mock-files/`.
 *
 * The keys are the ones of `MockSampleKey` in `src/services/files/mock-samples.ts` (without the thumbnail
 * variants, which the file service derives itself); they are repeated here because `src/mock` must not
 * import the device layer.
 */

export const MOCK_PHOTO_SAMPLES = ["photo1", "photo2", "photo3", "photo4", "photo5", "photo6", "photo7", "photo8"] as const;

export const MOCK_FILE_SAMPLES = [
  /** A 12-page PDF — the paging / performance fixture. */
  "pdfLong",
  /** A one-page PDF. */
  "pdfShort",
  /** A small Word file — the "download only" path. */
  "docx",
  /** A typeset formula sheet — an image used as a theory file. */
  "cheatsheet",
  /** Eight "handwritten solution" photos. */
  ...MOCK_PHOTO_SAMPLES,
] as const;

/** Key of a bundled sample file. */
export type MockFileSample = (typeof MOCK_FILE_SAMPLES)[number];

export function isMockFileSample(value: unknown): value is MockFileSample {
  return typeof value === "string" && (MOCK_FILE_SAMPLES as readonly string[]).includes(value);
}

/** Sample documents standing in for files the server would generate. */
export const MOCK_DOCUMENT_SAMPLES = {
  /** `teacherStudents.downloadStudentReport` — the weekly report of one student. */
  studentReport: { sample: "pdfShort", mimeType: "application/pdf" },
  /** `groups.downloadGroupAttendancePdf` — the attendance sheet of a group (a Russian-only document). */
  groupAttendance: { sample: "pdfShort", mimeType: "application/pdf" },
  /** `planner.getHandoutUrl` — the printable handout of a lesson. */
  lessonHandout: { sample: "pdfLong", mimeType: "application/pdf" },
} as const satisfies Record<string, { sample: MockFileSample; mimeType: string }>;

export type MockDocumentKind = keyof typeof MOCK_DOCUMENT_SAMPLES;

/** What the device hook `materializeDocument` receives. */
export type MockDocumentRequest = {
  kind: MockDocumentKind;
  /** The bundled sample to copy into the app cache. */
  sample: MockFileSample;
  mimeType: string;
  /** The file name the server would send (shown by the share sheet). */
  fileName: string;
};

/** Scheme of the URL `planner.getHandoutUrl` returns in the mock: `mock-sample://<sample>?<query>`. The file viewer resolves it. */
export const MOCK_SAMPLE_SCHEME = "mock-sample://";

/** Builds a `mock-sample://` URL: `mockSampleUrl("pdfLong", { lessonId: "les_live", answers: "1" })`. */
export function mockSampleUrl(sample: MockFileSample, query: Record<string, string | undefined> = {}): string {
  const pairs = Object.entries(query)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return `${MOCK_SAMPLE_SCHEME}${sample}${pairs.length > 0 ? `?${pairs.join("&")}` : ""}`;
}

/** Parses a `mock-sample://` URL back into the sample key and its query; null for any other URL. */
export function parseMockSampleUrl(url: string): { sample: MockFileSample; query: Record<string, string> } | null {
  if (!url.startsWith(MOCK_SAMPLE_SCHEME)) return null;
  const rest = url.slice(MOCK_SAMPLE_SCHEME.length);
  const mark = rest.indexOf("?");
  const sample = mark === -1 ? rest : rest.slice(0, mark);
  if (!isMockFileSample(sample)) return null;
  const query: Record<string, string> = {};
  if (mark !== -1) {
    for (const pair of rest.slice(mark + 1).split("&")) {
      if (!pair) continue;
      const equals = pair.indexOf("=");
      const key = decodeURIComponent(equals === -1 ? pair : pair.slice(0, equals));
      query[key] = equals === -1 ? "" : decodeURIComponent(pair.slice(equals + 1));
    }
  }
  return { sample, query };
}
