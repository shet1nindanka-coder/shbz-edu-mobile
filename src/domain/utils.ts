// The site's `lib/utils.ts` surface under one name, so ported modules and tests keep importing
// `@/domain/utils` where the site imports `@/lib/utils`. The code lives in topical modules.
//
// Not ported (web-only): `cx` (CSS class joiner), `roleHome` / `roleSettingsPath` (site URLs — the app's
// role homes live in `src/navigation`).
export { formatDate, formatDateTime, formatShortDate, toIsoDateTimeString } from "./dates";
export {
  allowedUploadExtensions,
  allowedUploadMimeTypes,
  formatFileSize,
  getFileExtension,
  getMimeTypeFromExtension,
  isImageMime,
  isOfficeMime,
  isPdfMime,
  sanitizeFileName
} from "./files";
export {
  compareHomeworkNumbers,
  findHomeworkNumberTwins,
  normalizeHomeworkNumber,
  parseNumbersInput
} from "./numbers";
export { completionPercent, getStatusCounts, homeworkStatusMeta, isHomeworkOverdue } from "./statuses";
export {
  MAX_LOGIN_LENGTH,
  MAX_USER_NAME_LENGTH,
  matchesAccountSearch,
  normalizeLoginInput,
  normalizeMultilineText,
  normalizeSingleLineText
} from "./text";
