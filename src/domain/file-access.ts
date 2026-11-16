// Ported 1:1 from the site (lib/file-access.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
import { UserRole } from "@/domain/enums";

type FileAccessUser = {
  id: string;
  role: UserRole;
};

type FileAccessCounts = {
  theoryForTopics: number;
  homeworkForTopics: number;
  /** Файл ответов темы: только для учителя, ученику не отдаётся никогда. */
  answersForTopics: number;
  answerForNumberEntries: number;
  checkPhotoEntries: number;
};

export type StoredFileAccessSnapshot = {
  uploadedById: string;
  counts: FileAccessCounts;
};

export function canAccessStoredFile(user: FileAccessUser, file: StoredFileAccessSnapshot) {
  // Разработчик видит всё (решение владельца): файлы тем, банка задач и любые
  // фото решений — иначе разбор жалобы на автопроверку упирается в 404.
  if (user.role === UserRole.DEVELOPER) {
    return true;
  }

  if (user.role === UserRole.TEACHER) {
    // Файлы тем и банка задач общие; свои загрузки тоже доступны. Фото решений
    // сюда НЕ входят: их принадлежность ученику учителя проверяется отдельным
    // запросом в роуте (ownsStudentPhoto) — чужие детские работы закрыты (SEC-003).
    return (
      file.uploadedById === user.id ||
      file.counts.theoryForTopics > 0 ||
      file.counts.homeworkForTopics > 0 ||
      file.counts.answersForTopics > 0 ||
      file.counts.answerForNumberEntries > 0
    );
  }

  return file.counts.theoryForTopics > 0 || file.counts.homeworkForTopics > 0;
}

export function summarizeStoredFileAccess(file: StoredFileAccessSnapshot) {
  return {
    uploadedById: file.uploadedById,
    theoryTopicCount: file.counts.theoryForTopics,
    homeworkTopicCount: file.counts.homeworkForTopics,
    answersTopicCount: file.counts.answersForTopics,
    answerEntryCount: file.counts.answerForNumberEntries,
    checkPhotoEntryCount: file.counts.checkPhotoEntries
  };
}
