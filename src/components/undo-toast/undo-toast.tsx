import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme';
import { Enter, Text, TextButton } from '@/ui';

export type UndoToastProps = {
  /** What happened: «№ 12 убран из набора», «Вердикты ИИ приняты: 3». */
  text: string;
  /** «Отменить». */
  undoLabel: string;
  onUndo: () => void;
  testID?: string;
};

/**
 * The floating "done — Undo" card (05 §1.3 the lesson board's removed number; 04 S4 item 5 the accepted
 * AI verdicts): bottom centre, above the list, never blocking it. The owner decides how long it stays and
 * removes it.
 */
export function UndoToast({ text, undoLabel, onUndo, testID }: UndoToastProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.layer, { bottom: theme.space.lg + insets.bottom }]}>
      <Enter>
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.toast, theme.shadows.card]} testID={testID}>
          <Text variant="smallStrong" style={styles.text}>
            {text}
          </Text>
          <TextButton label={undoLabel} onPress={onUndo} testID={testID ? `${testID}-undo` : undefined} style={styles.undo} />
        </View>
      </Enter>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  layer: { position: 'absolute', left: t.space.gutter, right: t.space.gutter, alignItems: 'center', pointerEvents: 'box-none' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    maxWidth: '100%',
    minHeight: t.sizes.minTouch,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.cardBorder,
    backgroundColor: t.colors.cardBg,
  },
  text: { flexShrink: 1, minWidth: 0 },
  // A full-height touch target for the one action of the card.
  undo: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
