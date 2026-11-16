/** Secure storage of the one session token (`expo-secure-store` on devices, `localStorage` on web). */
export interface TokenStorage {
  /** The stored token, or null when there is none or the store cannot be read. */
  read(): Promise<string | null>;
  /** False when the store refused the value — the session then lasts until the app is closed. */
  write(token: string): Promise<boolean>;
  clear(): Promise<void>;
}
