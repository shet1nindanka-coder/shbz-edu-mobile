import { View } from 'react-native';

import type { TeacherHomeworkCheckResult } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';

export type ReviewInjectionBannerProps = {
  /** Results of the latest finished check that carry the injection flag. */
  results: readonly TeacherHomeworkCheckResult[];
  testID?: string;
};

/**
 * "The photo contains an instruction aimed at the AI" (docs/spec/04-teacher-students.md S4): a security
 * signal, not a grade — an ink outline on the soft tone, never the red of an incorrect answer.
 */
export function ReviewInjectionBanner({ results, testID }: ReviewInjectionBannerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict } = useI18n();
  const t = dict.students.review;
  return (
    <View accessibilityRole="alert" style={styles.banner} testID={testID}>
      <View style={styles.title}>
        <Icon name="alert" size={theme.sizes.icon.sm} color="textStrong" />
        <Text variant="smallBold" style={styles.titleText}>
          {t.injectionTitle}
        </Text>
      </View>
      {results.map((result) =>
        result.injectionNote ? (
          <View key={result.number} style={styles.quote}>
            <Text variant="mono" selectable>
              {`${format(t.number, { n: result.number })}: ${result.injectionNote}`}
            </Text>
          </View>
        ) : null,
      )}
      <Text variant="small" color="textMuted">
        {t.injectionUnreliable}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  banner: {
    gap: t.space.sm,
    padding: t.space.lg,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.textStrong,
    backgroundColor: t.colors.softBg,
  },
  title: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  titleText: { flex: 1 },
  quote: { paddingVertical: t.space.xs, paddingHorizontal: t.space.md, borderRadius: t.radii.sm, backgroundColor: t.colors.soft2 },
}));
