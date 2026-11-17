// Web variant: bundled samples are plain URLs of the static export; the DOCX (carried as base64) and the
// HTML print version (a string) become blob: URLs created once per page.
import { Asset } from 'expo-asset';

import type { CacheableFile } from './file-cache';
import { MOCK_DOCX_BASE64 } from './generated/mock-docx';
import { MOCK_PRINT_HTML } from './mock-print-html';
import { MOCK_SAMPLE_MODULES } from './mock-sample-assets';
import { MOCK_SAMPLE_MIME, type MockSampleKey } from './mock-samples';

let docxUrl: string | null = null;
let printHtmlUrl: string | null = null;

function printHtmlBlobUrl(): string {
  if (printHtmlUrl === null) {
    printHtmlUrl = URL.createObjectURL(new Blob([MOCK_PRINT_HTML], { type: `${MOCK_SAMPLE_MIME.printHtml};charset=utf-8` }));
  }
  return printHtmlUrl;
}

function docxBlobUrl(): string {
  if (docxUrl === null) {
    const binary = atob(MOCK_DOCX_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    docxUrl = URL.createObjectURL(new Blob([bytes], { type: MOCK_SAMPLE_MIME.docx }));
  }
  return docxUrl;
}

export function mockSampleUri(key: MockSampleKey): string {
  if (key === 'docx' || key === 'printHtml') return '';
  return Asset.fromModule(MOCK_SAMPLE_MODULES[key]).uri;
}

export async function materialiseMockSample(key: MockSampleKey, _file: CacheableFile): Promise<string> {
  if (key === 'docx') return docxBlobUrl();
  if (key === 'printHtml') return printHtmlBlobUrl();
  return mockSampleUri(key);
}
