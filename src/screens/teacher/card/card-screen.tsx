import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { Screen } from '@/ui';

/**
 * The parts of the student card every segment shares: the header (the student's name, the "⋯" menu and
 * the three segments) and the banners under it (`null` when there is nothing to say). The header takes the
 * segment's own compact controls and shows them before the "⋯" (the review's "hide diagnostics" eye).
 */
export type CardChrome = { header: (actions?: ReactNode) => ReactNode; top: ReactNode | null };

export type CardScreenProps = {
  chrome: CardChrome;
  /** Icon buttons of the segment for the header, next to the "⋯" menu. */
  headerActions?: ReactNode;
  /** Sticky bar under the list (the assign segment's "selected · deadline · assign" bar). */
  footer?: ReactNode;
  /**
   * The segment lays out tablet panels: the screen brings the gutters and the gap between blocks. Without
   * it the segment owns a list that pads itself.
   */
  panels?: boolean;
  children?: ReactNode;
};

/**
 * Frame of the student card (docs/spec/04-teacher-students.md S3): the header with the segments and one
 * segment's own content below it. Each segment is a route of its own, so each renders this frame itself.
 */
export function CardScreen({ chrome, headerActions, footer, panels = false, children }: CardScreenProps) {
  const styles = useStyles();
  return (
    <Screen testID="teacher-student-screen" header={chrome.header(headerActions)} footer={footer} scroll={false} padded={panels} maxWidth="full">
      {chrome.top ? <View style={panels ? styles.top : styles.topInset}>{chrome.top}</View> : null}
      {children}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  top: { gap: t.space.sm },
  topInset: { gap: t.space.sm, paddingHorizontal: t.space.gutter, paddingBottom: t.space.md },
}));
