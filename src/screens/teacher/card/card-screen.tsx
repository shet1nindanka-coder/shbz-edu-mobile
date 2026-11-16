import type { ReactNode } from 'react';

import { Screen } from '@/ui';

/** The parts of the student card every segment shares: the app bar and the fixed strip with the segments. */
export type CardChrome = { header: ReactNode; top: ReactNode };

export type CardScreenProps = {
  chrome: CardChrome;
  /** Sticky bar under the list (the assign segment's "selected · deadline · assign" bar). */
  footer?: ReactNode;
  children?: ReactNode;
};

/**
 * Frame of the student card (docs/spec/04-teacher-students.md S3): app bar, the three segments and one
 * segment's own list below them. Each segment is a route of its own, so each renders this frame itself.
 */
export function CardScreen({ chrome, footer, children }: CardScreenProps) {
  return (
    <Screen testID="teacher-student-screen" header={chrome.header} footer={footer} scroll={false} padded={false}>
      {chrome.top}
      {children}
    </Screen>
  );
}
