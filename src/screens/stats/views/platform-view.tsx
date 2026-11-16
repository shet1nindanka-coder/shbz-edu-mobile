import { View } from 'react-native';

import type { StatisticsPlatformResponse } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Icon, PressableScale, SectionCard, Text } from '@/ui';

import { MAX_GAPS_SHOWN, bankInsight, bankUsageRows, contentRows, gapLine, moreGapsLine, platformMetricCards } from '../logic';
import { InsightBox } from '../parts/insight-box';
import { MetricGrid } from '../parts/metric-card';
import { ProgressRow } from '../parts/progress-row';

/**
 * View «Метрики платформы» (06 §1.6.c): the size of the problem bank and how much of it is in use, and
 * how complete the content is. A content gap opens the topic's edit screen.
 */
export function PlatformView({ data }: { data: StatisticsPlatformResponse }) {
  const styles = useStyles();
  const navigation = useAppNavigation();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.statistics;
  const { overview, homework, content } = data;
  const moreGaps = moreGapsLine(content.gaps.length, t, locale);

  return (
    <View style={styles.view} testID="stats-view-developer">
      <MetricGrid cards={platformMetricCards(overview, homework, t)} />

      <SectionCard title={t.bankUsage}>
        <View style={styles.stack}>
          {bankUsageRows(overview, t).map((row) => (
            <ProgressRow key={row.key} row={row} />
          ))}
          <InsightBox kicker={t.keyInsight} text={bankInsight(overview, t)} testID="stats-bank-insight" />
          <Hint>
            <Text variant="hint" color="textMuted">
              {t.bankExplainer}
            </Text>
          </Hint>
        </View>
      </SectionCard>

      <SectionCard title={t.contentCompleteness}>
        <View style={styles.stack}>
          {contentRows(content, t).map((row) => (
            <ProgressRow key={row.key} row={row} />
          ))}

          <Text variant="cardTitle" accessibilityRole="header" style={styles.gapsTitle}>
            {t.contentGaps}
          </Text>
          {content.gaps.length === 0 ? (
            <Text variant="small" color="textMuted" align="center" style={styles.complete} testID="stats-gaps-complete">
              {t.contentComplete}
            </Text>
          ) : (
            <View style={styles.gaps}>
              {content.gaps.slice(0, MAX_GAPS_SHOWN).map((gap) => {
                const link = { screen: 'content.topicEdit', topicId: gap.topicId } as const;
                const body = (
                  <>
                    <View style={styles.gapText}>
                      <Text variant="smallBold" numberOfLines={2}>
                        {gap.title}
                      </Text>
                      <Text variant="caption" color="textMuted">
                        {gapLine(gap, t)}
                      </Text>
                    </View>
                    {navigation.canOpen(link) ? <Icon name="chevronRight" size={16} color="kicker" /> : null}
                  </>
                );
                // A role without the edit screen gets plain text, never a link that bounces home.
                return navigation.canOpen(link) ? (
                  <PressableScale
                    key={gap.topicId}
                    accessibilityRole="link"
                    accessibilityLabel={`${format(m.stats.gaps.openTopicAria, { title: gap.title })}. ${gapLine(gap, t)}`}
                    onPress={() => navigation.open(link)}
                    style={styles.gap}
                    testID={`stats-gap-${gap.topicId}`}
                  >
                    {body}
                  </PressableScale>
                ) : (
                  <View key={gap.topicId} style={styles.gap}>
                    {body}
                  </View>
                );
              })}
              {moreGaps ? (
                <Text variant="caption" color="textMuted" testID="stats-gaps-more">
                  {moreGaps}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </SectionCard>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  view: { gap: t.space.sectionGap - t.space.md },
  stack: { gap: t.space.field },
  gapsTitle: { marginTop: t.space.xs },
  complete: { paddingVertical: t.space.lg },
  gaps: { gap: t.space.sm },
  gap: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.gutter,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  gapText: { flex: 1, minWidth: 0, gap: 2 },
}));
