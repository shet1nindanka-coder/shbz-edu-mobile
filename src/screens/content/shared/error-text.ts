import { isApiError } from '@/api';

/**
 * Text of a failed call: the server's localised message (also for a network failure, whose message is
 * localised by the client), otherwise the screen's fallback line from the site dictionary.
 */
export function errorText(error: unknown, fallback: string): string {
  return isApiError(error) && error.message ? error.message : fallback;
}
