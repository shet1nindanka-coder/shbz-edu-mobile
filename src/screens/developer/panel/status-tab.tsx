import { View } from 'react-native';

import type { DeveloperPanelData } from '@/api/types';
import { useI18n } from '@/i18n';
import { useNowTick } from '@/services/clock';
import { makeStyles, useTheme } from '@/theme';
import { Card, Panel, Panels, ProgressBar } from '@/ui';

import { BudgetsBlock } from './budgets-block';
import { budgetRows, statTiles, type StatTile, type StatTileKey } from './logic';
import { StatBox } from './stat-box';

/**
 * Status tab (07 §1.9; layout: docs/design/glass-over-paper.md §7, §1a): the seven stat blocks as plain
 * figures — a caption of one or two words and the number; the site's full names and its note lines are
 * read out by a screen reader — two columns of cards on a phone, a grid of soft boxes in the left panel on
 * a tablet — then the three real daily AI budgets (90-addendum-3 §10.2). The box «ИИ за сутки» is a
 * trailing-24-hour row count; the budgets are the bucket counters that decide a refusal — two different
 * numbers under two different captions.
 */
export function StatusTab({ data }: { data: DeveloperPanelData }) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.devPanel;
  // Only "which year is it" depends on the clock: a slow tick is enough.
  const now = useNowTick(60_000);
  const tiles = statTiles(data.stats, data.settings, t.status, locale, now);
  const budgets = budgetRows(data.aiBudgets);
  // The site's captions that are a phrase get a short form; the others already are one or two words.
  const short: Partial<Record<StatTileKey, string>> = {
    queue: m.developer.status.tiles.queue,
    runs24h: m.developer.status.tiles.runs24h,
    lessonQueue: m.developer.status.tiles.lessonQueue,
    files: dict.topics.edit.files,
    lastRetention: m.developer.status.tiles.lastRetention,
  };

  const grid = (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <StatTileBox key={tile.key} tile={tile} caption={short[tile.key] ?? tile.label} />
      ))}
    </View>
  );

  if (theme.tablet) {
    return (
      <Panels testID="panel-status">
        <Panel weight={3}>{grid}</Panel>
        {budgets.length > 0 ? (
          <Panel weight={2}>
            <BudgetsBlock budgets={budgets} />
          </Panel>
        ) : null}
      </Panels>
    );
  }

  return (
    <View style={styles.root} testID="panel-status">
      {grid}
      {budgets.length > 0 ? (
        <Card>
          <BudgetsBlock budgets={budgets} />
        </Card>
      ) : null}
    </View>
  );
}

function StatTileBox({ tile, caption }: { tile: StatTile; caption: string }) {
  const styles = useStyles();
  return (
    <StatBox
      caption={caption}
      value={tile.value}
      valueSuffix={tile.valueSuffix}
      // The site's wording in full: «Запусков за 24 часа, 4 / 300, дневной бюджет ИИ».
      accessibilityLabel={[tile.label, [tile.value, tile.valueSuffix].filter(Boolean).join(' '), tile.valueSuffix === tile.hint ? null : tile.hint]
        .filter(Boolean)
        .join(', ')}
      attention={tile.attention}
      compact={tile.wide}
      style={tile.wide ? styles.tileWide : styles.tile}
      testID={`panel-stat-${tile.key}`}
    >
      {tile.percent !== undefined ? <ProgressBar value={tile.percent} accessibilityLabel={tile.label} /> : null}
    </StatBox>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.block },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  // Two columns on a phone, three in the tablet panel: the basis is below the column's share, the boxes grow.
  tile: { flexBasis: t.tablet ? '30%' : '46%', flexGrow: 1, minWidth: 0 },
  tileWide: { flexBasis: '100%' },
}));
