import type { StyleProp, TextStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Text } from './text';

export type SectionCaptionProps = {
  children: string;
  testID?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * Caption of a block (`.sec`): 13 / 600, muted, sentence case. It names a card that has no title of its
 * own («Домашние задания» above the list). There are no upper-case over-titles in this design.
 */
export function SectionCaption({ children, testID, style }: SectionCaptionProps) {
  const styles = useStyles();
  return (
    <Text variant="kicker" color="textMuted" accessibilityRole="header" testID={testID} style={[styles.caption, style]}>
      {children}
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  caption: { paddingHorizontal: t.space.xxs, paddingTop: t.space.xxs },
}));
