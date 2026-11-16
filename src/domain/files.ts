// File helpers: extensions, MIME types, allowed-upload lists, size formatter.
// Ported 1:1 from the site (lib/utils.ts); the photo lists are the student-photo subset the site keeps
// inside its submission routes (docs/spec/09-data-i18n-math.md §1.7).
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

export const allowedUploadExtensions = [".pdf", ".docx", ".png", ".jpg", ".jpeg"];

export const allowedUploadMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
  "image/png",
  "image/jpeg"
]);

/** Student solution photos (homework and live lesson): PNG / JPG only. */
export const allowedPhotoExtensions = [".png", ".jpg", ".jpeg"];

export const allowedPhotoMimeTypes = new Set(["image/png", "image/jpeg"]);

const fileSizeUnits: Record<Locale, [string, string, string]> = {
  ru: ["Б", "КБ", "МБ"],
  en: ["B", "KB", "MB"]
};

export function formatFileSize(size: number, locale: Locale = DEFAULT_LOCALE) {
  const [bytes, kilobytes, megabytes] = fileSizeUnits[locale];

  if (size < 1024) {
    return `${size} ${bytes}`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} ${kilobytes}`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} ${megabytes}`;
}

export function getFileExtension(fileName: string) {
  const normalizedName = fileName.split("?")[0]?.split("#")[0] ?? fileName;
  const extensionIndex = normalizedName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return "";
  }

  return normalizedName.slice(extensionIndex).toLowerCase();
}

export function isPdfMime(mimeType: string) {
  return mimeType === "application/pdf";
}

export function isImageMime(mimeType: string) {
  return mimeType === "image/png" || mimeType === "image/jpeg";
}

export function isOfficeMime(mimeType: string) {
  return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function getMimeTypeFromExtension(extension: string) {
  switch (extension.toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

export function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
