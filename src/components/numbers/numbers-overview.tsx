import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { commonPrefixLength, countByStatus, leftCount, shortNumber, stripNumbers, type FocusNumber } from '@/domain/number-focus';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, NumberTile, PressableScale, StatusBar, Text } from '@/ui';

import { AllNumbersSheet } from './all-numbers-sheet';
import { statusBreakdown, statusLabel } from './status-labels';

export type NumbersOverviewProps = {
  numbers: readonly FocusNumber[];
  /** The number whose card is shown below. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Short fact on the right of the summary line: the deadline («до завтра, 23:59»). */
  aside?: string;
  /** `attention` paints the aside red: the deadline has passed. */
  asideTone?: 'muted' | 'attention';
  /**
   * Show EVERY number as a wrapping grid of tiles instead of one row and the «Все номера» link: a tablet
   * panel has the room (the map of a homework in the mockups). Tiles show the last three digits when all
   * numbers share a prefix.
   */
  grid?: boolean;
  testID?: string;
};

/**
 * The numbers of a homework without growing the screen (docs/design/glass-over-paper.md §7, principle 5):
 * «Осталось 13 из 50», the bar by status, ONE row of tiles with the numbers that still need work (those
 * that need help first, then the unmarked) and the way to «Все номера». The owner shows one card — of the
 * selected number — under it. Fifty numbers take as much room as five.
 */
export function NumbersOverview({ numbers, selectedId, onSelect, aside, asideTone = 'muted', grid = false, testID }: NumbersOverviewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const statuses = m.common.statuses;
  const counts = countByStatus(numbers);
  const left = leftCount(counts);
  const strip = stripNumbers(numbers);
  const prefix = grid ? commonPrefixLength(numbers) : 0;

  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.head}>
        <Text variant="bodyBold" accessibilityRole="header" style={styles.left} testID={testID ? `${testID}-left` : undefined}>
          {left > 0 ? format(m.common.numbers.leftOf, { left, total: numbers.length }) : m.common.numbers.allSolved}
        </Text>
        {aside ? (
          <Text variant="small" color={asideTone === 'attention' ? 'redText' : 'textMuted'} numberOfLines={1} style={styles.aside}>
            {aside}
          </Text>
        ) : null}
      </View>

      <StatusBar counts={counts} accessibilityLabel={statusBreakdown(counts, statuses, true)} />

      {grid ? (
        <View style={styles.grid}>
          {numbers.map((entry) => (
            <NumberTile
              key={entry.id}
              label={shortNumber(entry.number, prefix)}
              status={entry.status}
              current={entry.id === selectedId}
              onPress={() => onSelect(entry.id)}
              accessibilityLabel={format(m.common.numbers.tileA11y, { number: entry.number, status: statusLabel(entry.status, statuses) })}
              testID={testID ? `${testID}-tile-${entry.number}` : undefined}
              style={styles.gridTile}
            />
          ))}
        </View>
      ) : (
        <>
          {/* One row, scrolled sideways; the card's padding is cancelled so the tiles run to its edges. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
            {strip.map((entry) => (
              <NumberTile
                key={entry.id}
                label={entry.number}
                status={entry.status}
                current={entry.id === selectedId}
                onPress={() => onSelect(entry.id)}
                accessibilityLabel={format(m.common.numbers.tileA11y, { number: entry.number, status: statusLabel(entry.status, statuses) })}
                testID={testID ? `${testID}-tile-${entry.number}` : undefined}
              />
            ))}
          </ScrollView>

          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={m.common.numbers.all}
            onPress={() => setSheetOpen(true)}
            scaleTo={1}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            pressedStyle={styles.pressed}
            testID={testID ? `${testID}-all` : undefined}
            style={styles.all}
          >
            <Text variant="buttonSm" color="accentSolid">
              {m.common.numbers.all}
            </Text>
            <Icon name="chevronRight" size={theme.sizes.icon.sm} color="accentSolid" />
          </PressableScale>
        </>
      )}

      <AllNumbersSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        numbers={numbers}
        selectedId={selectedId}
        onSelect={(id) => {
          setSheetOpen(false);
          onSelect(id);
        }}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  left: { flexShrink: 1 },
  aside: { flexShrink: 0, maxWidth: '55%' },
  strip: { marginHorizontal: -t.space.card, flexGrow: 0 },
  stripContent: { gap: t.space.sm, paddingHorizontal: t.space.card },
  all: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: t.space.xxs, minHeight: t.sizes.control.sm },
  pressed: { opacity: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  // Ten to a row of a tablet panel, like the map of a homework in the mockups.
  gridTile: { flexBasis: 88, flexGrow: 1, maxWidth: 120, paddingHorizontal: t.space.sm },
}));
