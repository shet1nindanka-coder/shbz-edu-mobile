// Bytes of a local file picked on this device (web): pickers hand over `blob:` / `data:` URLs, which
// `fetch` reads. Anything else is not a picked file and resolves to null (the byte check is skipped).
export async function readLocalFileBytes(uri: string): Promise<Uint8Array | null> {
  if (!/^(blob|data):/i.test(uri)) return null;
  try {
    const response = await fetch(uri);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}
