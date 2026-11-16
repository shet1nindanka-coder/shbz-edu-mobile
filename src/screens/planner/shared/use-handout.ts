import { useCallback, useState } from 'react';

import { hasErrorCode, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';

import { errorText } from './error-text';
import { handoutFileId, handoutFileName, handoutMimeType, type HandoutVariant } from './handout-file';
import { useRetryWait, type RetryWait } from './use-retry-wait';

export type HandoutRequest = HandoutVariant & {
  /** Lesson id, or a homework-draft id together with `answers: true` (a draft has only the answer sheet). */
  lessonId: string;
  /** `createdAt` of the lesson / draft: the date in the file name. */
  createdAt: string;
};

export type HandoutFailure = {
  text: string;
  /** `503 pdfRendererUnavailable`: the PDF cannot be built — offer the HTML print version instead. */
  canOpenPrintVersion: boolean;
  request: HandoutRequest;
};

export type Handout = {
  /** Opens the handout in the file viewer; a refusal lands in `failure`. */
  open: (request: HandoutRequest) => void;
  failure: HandoutFailure | null;
  dismiss: () => void;
  /** Cooling down after `429 rateLimited` (30 handouts / 60 s). */
  wait: RetryWait;
};

/**
 * The printable handout / answer sheet of a lesson (05 §1.4, 90-addendum-2 A.2.6). `getHandoutUrl` is the
 * one synchronous method of the contract: it only builds an address, the file viewer downloads it. The
 * mock runs the request's checks inside the builder, so a refusal is thrown right here.
 */
export function useHandout(): Handout {
  const api = useApi();
  const navigation = useAppNavigation();
  const { m } = useI18n();
  const wait = useRetryWait();
  const [failure, setFailure] = useState<HandoutFailure | null>(null);
  const note = wait.note;

  const open = useCallback(
    (request: HandoutRequest) => {
      setFailure(null);
      const format = request.format ?? 'pdf';
      try {
        const url = api.planner.getHandoutUrl(request.lessonId, {
          format,
          ...(request.studentId ? { studentId: request.studentId } : {}),
          ...(request.answers ? { answers: true } : {}),
        });
        navigation.openFiles(
          [
            {
              id: handoutFileId(request.lessonId, { ...request, format }),
              originalName: handoutFileName(request.createdAt, { answers: request.answers, format }),
              mimeType: handoutMimeType(format),
              localUri: url,
            },
          ],
          { title: request.answers ? m.planner.handout.answersTitle : m.planner.handout.title },
        );
      } catch (error) {
        note(error);
        const rendererDown = hasErrorCode(error, 'pdfRendererUnavailable');
        setFailure({
          // The server's text for this code tells a browser user to press Ctrl+P; the app has its own wording.
          text: rendererDown ? m.planner.handout.rendererUnavailable : errorText(error, m.planner.handout.failed),
          canOpenPrintVersion: rendererDown && format === 'pdf',
          request,
        });
      }
    },
    [api, navigation, m, note],
  );

  const dismiss = useCallback(() => setFailure(null), []);
  return { open, failure, dismiss, wait };
}
