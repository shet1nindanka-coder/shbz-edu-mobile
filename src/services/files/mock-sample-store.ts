// Turns a bundled sample into something displayable (native): a URI for images, or a real file in the
// app cache for viewers and the share sheet. Metro picks `mock-sample-store.web.ts` on web.
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { prepareCacheTarget, type CacheableFile } from './file-cache';
import { MOCK_DOCX_BASE64 } from './generated/mock-docx';
import { MOCK_SAMPLE_MODULES } from './mock-sample-assets';
import type { MockSampleKey } from './mock-samples';

/** A URI an image component can load directly. The DOCX sample has none. */
export function mockSampleUri(key: MockSampleKey): string {
  if (key === 'docx') return '';
  return Asset.fromModule(MOCK_SAMPLE_MODULES[key]).uri;
}

/** Writes the sample into the cache entry of `file` and returns the local file URI. */
export async function materialiseMockSample(key: MockSampleKey, file: CacheableFile): Promise<string> {
  if (key === 'docx') {
    const target = prepareCacheTarget(file);
    target.create({ overwrite: true });
    await target.write(MOCK_DOCX_BASE64, { encoding: 'base64' });
    return target.uri;
  }
  // In development the asset is served by the dev server; `downloadAsync` gives a file:// copy either way.
  const asset = await Asset.fromModule(MOCK_SAMPLE_MODULES[key]).downloadAsync();
  const target = prepareCacheTarget(file);
  await new File(asset.localUri ?? asset.uri).copy(target);
  return target.uri;
}
