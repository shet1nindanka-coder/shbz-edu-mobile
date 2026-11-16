// Mock implementation of `FileService` (declared in src/api/client.ts; docs/spec/09-data-i18n-math.md
// §5.2). No bytes come from a server: a file resolves to (1) the real file picked on this device, when
// the mock backend registered one under its id, or (2) a bundled sample chosen by MIME type and a hash of
// the id. It still behaves like the HTTP one will — downloads take time and report progress, land in the
// disk cache under the file id, and a missing or forbidden file is `404 fileNotFound` (the access check
// of `lookup` runs before anything is resolved, picked files included).
import type { DownloadableFile, FileService } from '@/api/client';
import { ApiError } from '@/api/errors';
import { getMobileDictionary } from '@/i18n/mobile';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';

import { findCachedFile, trimFileCache } from './file-cache';
import { resolveLocalFile } from './local-file-store';
import { materialiseMockSample, mockSampleUri } from './mock-sample-store';
import { pickMockPhoto, pickMockSample, type MockFileMeta } from './mock-samples';

export type MockFileLookup = (fileId: string) => Omit<MockFileMeta, 'id'> | null;

export type MockFileServiceOptions = {
  /**
   * Metadata of a file the signed-in user may read, or `null` when it does not exist or is not theirs
   * (both are `404 fileNotFound`, deliberately indistinguishable). Wire it to the mock store. Without it
   * every id resolves, typed by what the caller passes.
   */
  lookup?: MockFileLookup;
  /** Language of error messages; read on every failure, so it follows a language switch. */
  locale?: () => Locale;
  /** Simulated transfer time of one download in ms. Default 600; 0 disables the delay. */
  latencyMs?: number;
};

const PROGRESS_STEPS = 6;

type Progress = (fraction: number) => void;
type InFlight = { promise: Promise<string>; listeners: Set<Progress> };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockFileService(options: MockFileServiceOptions = {}): FileService {
  const { lookup, locale, latencyMs = 600 } = options;
  // One transfer per file: a second caller joins the running download instead of starting another.
  const inFlight = new Map<string, InFlight>();

  const notFound = () =>
    new ApiError({
      code: 'fileNotFound',
      status: 404,
      message: getMobileDictionary(locale?.() ?? DEFAULT_LOCALE).common.errors.fileNotFound,
    });

  async function transfer(file: DownloadableFile, listeners: Set<Progress>): Promise<string> {
    const emit = (fraction: number) => listeners.forEach((listener) => listener(fraction));

    // Access first, like the server: a file picked on this device by one user must stay a 404 for an
    // account that may not read its row.
    const known = lookup ? lookup(file.id) : { mimeType: file.mimeType, originalName: file.originalName };
    if (!known) throw notFound();

    const local = resolveLocalFile(file.id);
    if (local) {
      emit(1);
      return local.uri;
    }
    const meta: MockFileMeta = {
      id: file.id,
      mimeType: known.mimeType,
      originalName: known.originalName ?? file.originalName,
      size: known.size ?? ('size' in file ? file.size : undefined),
      sample: known.sample,
    };
    const cacheable = { id: file.id, originalName: meta.originalName ?? file.originalName, mimeType: meta.mimeType };

    const cached = findCachedFile(cacheable);
    if (cached) {
      emit(1);
      return cached;
    }

    const sample = pickMockSample(meta);
    if (!sample) throw notFound();

    if (latencyMs > 0) {
      for (let step = 0; step < PROGRESS_STEPS; step += 1) {
        emit(step / PROGRESS_STEPS);
        await wait(latencyMs / PROGRESS_STEPS);
      }
    }
    const uri = await materialiseMockSample(sample, cacheable);
    // A new entry may push the cache over its size limit; the stalest files go first.
    trimFileCache();
    emit(1);
    return uri;
  }

  return {
    source(fileId, variant = 'original') {
      if (!lookup) {
        const local = resolveLocalFile(fileId);
        return { uri: local ? local.uri : mockSampleUri(pickMockPhoto(fileId, variant)), headers: {} };
      }
      const known = lookup(fileId);
      // `source` is synchronous and feeds image components: an unreadable file is an image that fails
      // to load, not an exception thrown during render.
      if (!known) return { uri: '', headers: {} };
      const local = resolveLocalFile(fileId);
      if (local) return { uri: local.uri, headers: {} };
      const sample = pickMockSample({ id: fileId, ...known }, variant);
      return { uri: sample ? mockSampleUri(sample) : '', headers: {} };
    },

    download(file, onProgress) {
      const running = inFlight.get(file.id);
      if (running) {
        if (onProgress) running.listeners.add(onProgress);
        return running.promise;
      }
      const listeners = new Set<Progress>();
      if (onProgress) listeners.add(onProgress);
      const promise = transfer(file, listeners).finally(() => inFlight.delete(file.id));
      inFlight.set(file.id, { promise, listeners });
      return promise;
    },
  };
}
