/**
 * Default reader of picked-file bytes for the mock's upload checks (`MockApiClientOptions.readUploadBytes`).
 *
 * Pickers on web hand over `blob:` / `data:` URLs, which `fetch` reads in every browser. Native `file://` /
 * `content://` URIs are left to a device hook (expo-file-system), because `fetch` of a local file behaves
 * differently per platform and a wrong answer would refuse a valid upload: anything else resolves to null,
 * which skips the byte check. The mock stays free of React Native / Expo imports.
 */
export async function readPickedFileBytes(uri: string): Promise<Uint8Array | null> {
  if (!/^(blob|data):/i.test(uri)) return null;
  const fetchFn = (globalThis as { fetch?: (input: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }> }).fetch;
  if (typeof fetchFn !== "function") return null;
  try {
    const response = await fetchFn(uri);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}
