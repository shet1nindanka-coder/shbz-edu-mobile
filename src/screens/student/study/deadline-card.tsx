import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Chip, Icon, PressableScale, ProgressBar, Text } from '@/ui';

import { describeDeadline, type DeadlineItem } from './deadline-model';

export type DeadlineCardProps = {
  item: DeadlineItem;
  /**
   * `compact` — «Что дальше» and the calendar day sheet: progress label and the «3/8» fraction under the
   * bar. `full` — the «Ближайшие ДЗ» list: a roomier card with the bar and the «Открыть ДЗ» link only.
   */
  variant: 'compact' | 'full';
  /** Trailing chevron next to the label (the day sheet only: in the hero it would cost the label a line). */
  showChevron?: boolean;
  /** The server-corrected clock, for the «Просрочено» badge. */
  now: number;
  onPress: (item: DeadlineItem) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Homework deadline card (site: `DeadlineList` item; 02 S1 "Homework deadline card"). The whole card is
 * the link to the homework — the site's separate «Открыть ДЗ» button becomes the card's own action.
 */
export function DeadlineCard({ item, variant, showChevron = false, now, onPress, testID, style }: DeadlineCardProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.student.deadlineList;
  const texts = describeDeadline(item, t, locale, now);
  const compact = variant === 'compact';
  const badges = [texts.done ? t.doneBadge : null, texts.overdue ? t.overdueBadge : null].filter((badge): badge is string => badge !== null);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[item.label, ...badges, texts.meta, texts.progress].join('. ')}
      accessibilityHint={t.open}
      onPress={() => onPress(item)}
      testID={testID}
      style={[styles.card, compact ? styles.compact : styles.full, style]}
    >
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <Text style={styles.label}>{item.label}</Text>
          {texts.done ? <Chip tone="green" label={t.doneBadge} /> : null}
          {texts.overdue ? <Chip tone="red" label={t.overdueBadge} /> : null}
        </View>
        {showChevron ? (
          <View style={styles.chevron}>
            <Icon name="chevronRight" size={16} color="textMuted" />
          </View>
        ) : null}
      </View>
      <Text variant="small" color="textMuted">
        {texts.meta}
      </Text>
      <ProgressBar value={texts.percent} accessibilityLabel={texts.progress} style={compact ? styles.barCompact : styles.bar} />
      {compact ? (
        <View style={styles.foot}>
          <Text variant="badgeMuted" color="kicker" style={styles.footText}>
            {texts.progress}
          </Text>
          <Text variant="smallExtra" tabular>
            {texts.fraction}
          </Text>
        </View>
      ) : (
        // The full card has no progress label and no fraction (02 S1): only the link that names its action.
        <View style={styles.footOpen}>
          <View style={styles.open}>
            <Text variant="link" color="accentSolid">
              {t.open}
            </Text>
            <Icon name="chevronRight" size={14} color="accentSolid" />
          </View>
        </View>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: { borderWidth: t.borders.hairline, backgroundColor: t.colors.cardBg, gap: t.space.xs },
  compact: { borderRadius: t.radii.md, borderColor: t.colors.softBorder, paddingHorizontal: 16, paddingVertical: 14 },
  full: { borderRadius: t.radii.lg, borderColor: t.colors.cardBorder, padding: t.space.card, ...t.shadows.card },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.space.md },
  titleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  // A word longer than the column wraps inside it instead of leaving the card.
  label: { ...t.typography.cardTitle, fontFamily: t.fonts.extrabold, color: t.colors.textStrong, flexShrink: 1 },
  chevron: { marginTop: 4 },
  bar: { marginTop: t.space.sm },
  barCompact: { marginTop: t.space.xs, height: 7 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, marginTop: 2 },
  footText: { flexShrink: 1 },
  footOpen: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 2 },
}));
