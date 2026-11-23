import { View } from 'react-native';

import type { StatisticsPlatformResponse } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { ListRow, Text } from '@/ui';

import { MAX_GAPS_SHOWN, bankInsight, bankUsageRows, contentRows, gapLine, moreGapsLine, platformMetricCards } from '../logic';
import { Columns } from '../parts/columns';
import { InsightBox } from '../parts/insight-box';
import { MetricGrid } from '../parts/metric-card';
import { ProgressRow } from '../parts/progress-row';
import { StatsCard } from '../parts/stats-card';

/**
 * View «Метрики платформы» (06 §1.6.c; layout: mockup D-stats): the summary figures, then two cards — the
 * size of the problem bank and how much of it is in use, and how complete the content is. A content gap is
 * a row that opens the topic's edit screen.
 */
export function PlatformView({ data }: { data: StatisticsPlatformResponse }) {
  const styles = useStyles();
  const navigation = useAppNavigation();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.statistics;
  const { overview, homework, content } = data;
  const moreGaps = moreGapsLine(content.gaps.length, t, locale);
  const gaps = content.gaps.slice(0, MAX_GAPS_SHOWN);

  return (
    <View style={styles.view} testID="stats-view-developer">
      <MetricGrid cards={platformMetricCards(overview, homework, t)} />

      <Columns>
        <StatsCard title={t.bankUsage}>
          <View style={styles.rows}>
            {bankUsageRows(overview, t).map((row) => (
              <ProgressRow key={row.key} row={row} />
            ))}
          </View>
          <InsightBox kicker={t.keyInsight} text={bankInsight(overview, t)} testID="stats-bank-insight" />
          <Hint>
            <Text variant="small" color="textMuted">
              {t.bankExplainer}
            </Text>
          </Hint>
        </StatsCard>

        <StatsCard title={t.contentCompleteness}>
          <View style={styles.rows}>
            {contentRows(content, t).map((row) => (
              <ProgressRow key={row.key} row={row} />
            ))}
          </View>

          <View>
            <Text variant="smallStrong" color="textMuted" accessibilityRole="header">
              {t.contentGaps}
            </Text>
            {content.gaps.length === 0 ? (
              <Text variant="small" color="textMuted" style={styles.complete} testID="stats-gaps-complete">
                {t.contentComplete}
              </Text>
            ) : (
              <>
                {gaps.map((gap, index) => {
                  const link = { screen: 'content.topicEdit', topicId: gap.topicId } as const;
                  // A role without the edit screen gets a plain row, never a link that bounces home.
                  const canOpen = navigation.canOpen(link);
                  const line = gapLine(gap, t);
                  return (
                    <ListRow
                      key={gap.topicId}
                      title={gap.title}
                      titleLines={2}
                      subtitle={line}
                      subtitleLines={2}
                      chevron={canOpen}
                      inset={0}
                      divider={index < gaps.length - 1}
                      onPress={canOpen ? () => navigation.open(link) : undefined}
                      accessibilityLabel={canOpen ? `${format(m.stats.gaps.openTopicAria, { title: gap.title })}. ${line}` : `${gap.title}. ${line}`}
                      testID={`stats-gap-${gap.topicId}`}
                    />
                  );
                })}
                {moreGaps ? (
                  <Text variant="small" color="textMuted" testID="stats-gaps-more">
                    {moreGaps}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </StatsCard>
      </Columns>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  view: { gap: t.space.block },
  rows: { gap: t.space.lg },
  complete: { paddingVertical: t.space.sm },
}));
