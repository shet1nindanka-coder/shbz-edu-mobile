import { View } from 'react-native';

import type { DeveloperPanelData } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Panel, Panels, ProgressBar, Text } from '@/ui';

import { BudgetsBlock } from './budgets-block';
import { budgetRows, statTiles, type StatTile } from './logic';
import { StatBox } from './stat-box';

/**
 * Status tab (07 §1.9; layout: docs/design/glass-over-paper.md §7): the seven stat blocks as plain figures
 * — two columns of cards on a phone, a grid of soft boxes in the left panel on a tablet — then the three
 * real daily AI budgets (90-addendum-3 §10.2). The box «запусков за 24 часа» is a trailing-24-hour row
 * count; the budgets are the bucket counters that decide a refusal — two different numbers under two
 * different captions.
 */
export function StatusTab({ data }: { data: DeveloperPanelData }) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel;
  const tiles = statTiles(data.stats, data.settings, t.status, m.common.dateTime.msk);
  const budgets = budgetRows(data.aiBudgets);

  const grid = (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <StatTileBox key={tile.key} tile={tile} />
      ))}
    </View>
  );

  if (theme.tablet) {
    return (
      <Panels testID="panel-status">
        <Panel weight={3}>
          <Text variant="sectionTitle" accessibilityRole="header">
            {t.tabs.status}
          </Text>
          {grid}
        </Panel>
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

function StatTileBox({ tile }: { tile: StatTile }) {
  const styles = useStyles();
  return (
    <StatBox
      caption={tile.label}
      value={tile.value}
      valueSuffix={tile.valueSuffix}
      note={tile.hint}
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
