/**
 * Readable ids of the fixture rows other code refers to by name (docs/spec/09-data-i18n-math.md §2,
 * 90-addendum-6 §6). Still opaque strings as far as the API is concerned.
 */

export const USER = {
  dev: "usr_dev",
  anna: "usr_anna",
  igor: "usr_igor",
  olga: "usr_olga",
  ilya: "usr_ilya",
  maria: "usr_maria",
  artem: "usr_artem",
  polina: "usr_polina",
  kirill: "usr_kirill",
  dasha: "usr_dasha",
  timur: "usr_timur",
  sofia: "usr_sofia",
  egor: "usr_egor",
  orphan: "usr_orphan",
} as const;

export type FixtureUserKey = keyof typeof USER;

export const GROUP = { g8a: "grp_8a", empty: "grp_empty", g10b: "grp_10b" } as const;

export const TOPIC = {
  linear: "top_linear",
  quadratic: "top_quadratic",
  derivative: "top_derivative",
  log: "top_log",
  systems: "top_systems",
  empty: "top_empty",
  word: "top_word",
} as const;

export type FixtureTopicKey = keyof typeof TOPIC;

/** Id of a fixture number by its label: `numberId("010203")` → `"num_010203"`. Labels are unique across the fixture topics. */
export function numberId(label: string): string {
  return `num_${label}`;
}

/** Short key of a fixture user id: `"usr_ilya"` → `"ilya"` (used inside derived row ids). */
export function userKey(userId: string): string {
  return userId.replace(/^usr_/, "");
}

/** The demo logins and passwords (the three site seed accounts are kept unchanged). */
export const DEMO_PASSWORDS = { developer: "developer123", teacher: "teacher123", student: "student123" } as const;
