// Pure builder of the "message to pass on" shown once after an account is created
// (docs/spec/04-teacher-students.md D1). The lines on screen and the copied / shared text come from one
// list, so they cannot drift apart. No React, no React Native — unit-tested in tests/teacher-students.test.ts.

export type CredentialLineId = 'site' | 'login' | 'password';

export type CredentialLine = { id: CredentialLineId; label: string; value: string };

export type CredentialLabels = { site: string; login: string; password: string };

export type CredentialValues = { host: string; login: string; password: string };

/** Site, login, password — in the order they are read out to the student. */
export function buildCredentialLines(labels: CredentialLabels, values: CredentialValues): CredentialLine[] {
  return [
    { id: 'site', label: labels.site, value: values.host },
    { id: 'login', label: labels.login, value: values.login },
    { id: 'password', label: labels.password, value: values.password },
  ];
}

/** One line as displayed: «Логин: maria@example.com». */
export function credentialLineText(line: CredentialLine): string {
  return `${line.label}: ${line.value}`;
}

/** The whole message, one line per value, ready for a messenger. */
export function credentialsMessage(lines: readonly CredentialLine[]): string {
  return lines.map(credentialLineText).join('\n');
}
