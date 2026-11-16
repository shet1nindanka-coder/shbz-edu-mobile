// The app's single QueryClient. A module-level singleton (not React state) because non-React code — the
// pending-writes queue, the session cleanup — needs the same instance the provider serves.
import type { QueryClient } from '@tanstack/react-query';

import { createAppQueryClient } from '@/services/query';

let client: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  client ??= createAppQueryClient();
  return client;
}
