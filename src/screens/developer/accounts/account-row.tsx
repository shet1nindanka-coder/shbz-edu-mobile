import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Avatar, Icon, PressableScale, Text } from '@/ui';

export type AccountRowProps = {
  name: string;
  /** The login. */
  email: string;
  /** Lines under the login: student count, owner, warnings. */
  children?: ReactNode;
  /** Read by a screen reader after the name: everything the row shows as text. */
  accessibilityLabel: string;
  /** What the tap opens. */
  accessibilityHint: string;
  onPress: () => void;
  testID?: string;
};

/**
 * One account of the directory (docs/spec/04-teacher-students.md S9b, mobile note): the site's table row
 * with its buttons becomes a card that is one touch target — the tap opens the row's sheet, the trailing
 * "⋯" only shows that there is more behind it.
 */
export function AccountRow({ name, email, children, accessibilityLabel, accessibilityHint, onPress, testID }: AccountRowProps) {
  const styles = useStyles();
  const theme = useTheme();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      scaleTo={1}
      pressedStyle={styles.pressed}
      style={[styles.card, theme.shadows.card]}
      testID={testID}
    >
      <Avatar name={name} />
      <View style={styles.texts}>
        <Text variant="bodyBold" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {email}
        </Text>
        {children}
      </View>
      <Icon name="more" size={18} color="kicker" />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.gutter,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.cardBorder,
    backgroundColor: t.colors.cardBg,
  },
  pressed: { backgroundColor: t.colors.softBg },
  texts: { flex: 1, minWidth: 0, gap: 2 },
}));
