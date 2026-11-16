// Gives components the `FileService` chosen by the composition root (mock today, HTTP later). Shared
// composites — FileCard, FileViewer, PhotoThumb — read it from here, so screens only pass file refs.
import { createContext, use, type ReactNode } from 'react';

import type { FileService } from '@/api/client';

const FileServiceContext = createContext<FileService | null>(null);

export type FileServiceProviderProps = { service: FileService; children: ReactNode };

/** Mount once in the composition root, next to `ApiProvider`. */
export function FileServiceProvider({ service, children }: FileServiceProviderProps) {
  return <FileServiceContext value={service}>{children}</FileServiceContext>;
}

/** The app's `FileService`. Throws when no provider is mounted — a wiring bug, not a runtime state. */
export function useFileService(): FileService {
  const service = use(FileServiceContext);
  if (!service) throw new Error('useFileService: <FileServiceProvider> is not mounted above this component.');
  return service;
}
