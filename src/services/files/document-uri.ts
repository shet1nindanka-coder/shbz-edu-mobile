// Documents addressed by a URL instead of a file id. There is exactly one source of them:
// `planner.getHandoutUrl`, the only method of the contract that returns a URL (00 §5 item 12). In the
// mock that URL is `mock-sample://<sample>?…` and stands for a bundled sample; this module turns it into
// something a viewer can open. An `HttpApiClient` URL (which needs the session header) gets its
// authorised download here as well, so viewers never learn which client produced the address.
import { MOCK_SAMPLE_SCHEME, parseMockSampleUrl } from '@/mock/assets';

import type { CacheableFile } from './file-cache';
import { materialiseMockSample } from './mock-sample-store';

/** True when `uri` cannot be shown as is and has to go through `resolveDocumentUri` first. */
export function isDeferredDocumentUri(uri: string): boolean {
  return uri.startsWith(MOCK_SAMPLE_SCHEME);
}

/**
 * The local (or directly loadable) URI of a document. Anything that is not a deferred address is returned
 * unchanged, so callers may pass every `localUri` through it. `file` names the cache entry: use an id that
 * differs between variants of one document (with / without answers, per student).
 */
export async function resolveDocumentUri(uri: string, file: CacheableFile): Promise<string> {
  if (!isDeferredDocumentUri(uri)) return uri;
  const mock = parseMockSampleUrl(uri);
  // An address of the mock scheme that names no bundled sample: the caller shows its generic failure text.
  if (!mock) throw new Error(`Unknown mock sample document: ${uri}`);
  return materialiseMockSample(mock.sample, file);
}
