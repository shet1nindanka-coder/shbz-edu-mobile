import { isApiError } from '@/api';

/**
 * Text of a failed call: the server's localised message (a network failure carries the client's localised
 * message), otherwise the fallback line from the dictionary.
 */
export function errorText(error: unknown, fallback: string): string {
  return isApiError(error) && error.message ? error.message : fallback;
}

/** Seconds the server asked to wait (`429 rateLimited`, `503`); 0 when the error names none. */
export function retryAfterOf(error: unknown): number {
  return isApiError(error) && typeof error.retryAfterSeconds === 'number' && error.retryAfterSeconds > 0 ? error.retryAfterSeconds : 0;
}
