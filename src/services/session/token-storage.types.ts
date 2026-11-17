/** Secure storage of the one session token (`expo-secure-store` on devices, `localStorage` on web). */
export interface TokenStorage {
  /** The stored token, or null when there is none, the store cannot be read, or it was signed out. */
  read(): Promise<string | null>;
  /** False when the store refused the value — the session then lasts until the app is closed. */
  write(token: string): Promise<boolean>;
  /**
   * Removes the token (falling back to overwriting it, then to a signed-out marker that start-up honours).
   * False only when a token may still be restored at the next start.
   */
  clear(): Promise<boolean>;
}
