// Size in bytes of a local file (web): picked files are blob: or data: URLs, so the blob itself knows.
export async function getLocalFileSize(uri: string): Promise<number> {
  try {
    const response = await fetch(uri);
    return (await response.blob()).size;
  } catch {
    return 0;
  }
}
