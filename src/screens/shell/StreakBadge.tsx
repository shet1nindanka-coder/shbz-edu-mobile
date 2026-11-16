import { LinearGradient } from 'expo-linear-gradient';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { makeStyles, streakColorMeta, streakPalette, useTheme } from '@/theme';
import { Icon, PressableScale, Text } from '@/ui';

export type StreakBadgeProps = {
  /** `StudentStreak.currentStreak`. */
  currentStreak: number;
  /** Makes the pill a button (the app bar leads to the overview, where the full widget is). */
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The streak pill (docs/spec/01-shell-auth.md §1.7, §4.5): a flame and «{n} дн.», coloured by the streak's
 * colour tier. The tier comes from `currentStreak` alone, as on the site.
 */
export function StreakBadge({ currentStreak, onPress, testID, style }: StreakBadgeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { locale, dict } = useI18n();
  const weekly = dict.student.weekly;
  const palette = streakPalette(streakColorMeta(currentStreak).tier, theme.colors);
  const label = `${weekly.flame}: ${plural(locale, currentStreak, weekly.dayForms)}`;

  const pill = (
    <LinearGradient
      colors={[palette.bgStart, palette.bgEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.pill, { borderColor: palette.border }]}
    >
      <Icon name="flame" size={13} tint={palette.flame} />
      <Text variant="captionBold" tabular numberOfLines={1} style={{ color: palette.text }}>
        {format(weekly.daysShort, { n: currentStreak })}
      </Text>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} testID={testID} style={style}>
        {pill}
      </PressableScale>
    );
  }
  return (
    <View accessible accessibilityLabel={label} testID={testID} style={style}>
      {pill}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: t.radii.sm,
    borderWidth: t.borders.hairline,
  },
}));
