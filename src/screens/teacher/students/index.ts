// Students area of the teacher (docs/spec/04-teacher-students.md S2, S2a, D1 – D3). The sheets are written
// against a `{ id, name }` target so the student card and the developer's accounts screen can reuse them.
export { canSubmitPassword, canSubmitStudentForm, passwordFeedback, shouldSuggestPassword, type StudentFormValues } from './account-form';
export { CreateStudentSheet, type CreateStudentSheetProps } from './create-student-sheet';
export { buildCredentialLines, credentialLineText, credentialsMessage, type CredentialLine } from './credentials-message';
export { CredentialsSheet, type CreatedCredentials, type CredentialsSheetProps } from './credentials-sheet';
export { DeleteStudentDialog, type DeleteStudentDialogProps, type DeleteStudentTarget } from './delete-student-dialog';
export { isStudentGone } from './error-text';
export { invalidateStudents } from './invalidate-students';
export { postStudentsListNotice, useStudentsListNotice, type StudentsListNoticeKey } from './list-notice';
export { PasswordFeedback, type PasswordFeedbackProps } from './password-feedback';
export { PasswordResetSheet, type PasswordResetSheetProps } from './password-reset-sheet';
export { PasswordSuggestion, type PasswordSuggestionProps } from './password-suggestion';
export { ResetPasswordSheet, type ResetPasswordSheetProps, type ResetPasswordTarget } from './reset-password-sheet';
export { secureRandomInt } from './secure-random';
export { SITE_HOST } from './site-host';
export { StudentActionsSheet, type StudentAction, type StudentActionsSheetProps } from './student-actions-sheet';
export { StudentRow, type StudentRowProps } from './student-row';
export { useLatched } from './use-latched';
export { useNoticeScroll } from './use-notice-scroll';
