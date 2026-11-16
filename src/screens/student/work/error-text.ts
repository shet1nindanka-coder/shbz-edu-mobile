import { isApiError } from '@/api';

/** The server's localised text of a failed call (a network failure is localised by the client too). */
export function errorText(error: unknown, fallback: string): string {
  return isApiError(error) && error.message ? error.message : fallback;
}
