import { useWindowDimensions, View } from 'react-native';

import type { ScoreRow } from '@/domain/exam-scores';
import { makeStyles } from '@/theme';
import { Icon, Text, widthForText } from '@/ui';

export type ScoreScaleGridProps = {
  rows: readonly ScoreRow[];
  /** Raw score whose chip gets the accent border (the pass threshold). */
  highlightPrimary: number;
};

/** Three columns (02 S5 "Phone translation"); two on the narrowest phones, where «30 → 100» does not fit a third of the row. */
const COLUMNS = 3;
const NARROW_COLUMNS = 2;
const NARROW_BELOW_WIDTH = 360;

function chunk<T>(list: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < list.length; index += size) rows.push(list.slice(index, index + size));
  return rows;
}

/** «Первичные → тестовые»: a three-column grid of `{raw} → {scaled}` chips (02 S5). */
export function ScoreScaleGrid({ rows, highlightPrimary }: ScoreScaleGridProps) {
  const styles = useStyles();
  const window = useWindowDimensions();
  // The chips hold numbers drawn with the OS font size: three of them need more room at a larger one.
  const columns = window.width < widthForText(NARROW_BELOW_WIDTH, window.fontScale) ? NARROW_COLUMNS : COLUMNS;
  return (
    <View style={styles.grid} testID="exam-scale-grid">
      {chunk(rows, columns).map((line) => (
        <View key={line[0]?.primary} style={styles.line}>
          {line.map((row) => (
            <View
              key={row.primary}
              accessible
              accessibilityLabel={`${row.primary} → ${row.secondary}`}
              style={[styles.chip, row.primary === highlightPrimary ? styles.highlight : null]}
              testID={`exam-scale-${row.primary}`}
            >
              <Text variant="smallBold" color="kicker" tabular>
                {row.primary}
              </Text>
              <Icon name="forward" size={12} color="weekDotOff" />
              <Text variant="cardTitle" tabular style={styles.scaled}>
                {row.secondary}
              </Text>
            </View>
          ))}
          {/* Fillers keep the chips of an incomplete last line on the column grid. */}
          {Array.from({ length: columns - line.length }, (_, index) => (
            <View key={`filler-${index}`} style={styles.filler} />
          ))}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  grid: { gap: 8 },
  line: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  highlight: { borderColor: t.colors.accentSolid, borderWidth: t.borders.interactive },
  scaled: { fontFamily: t.fonts.extrabold },
  // As wide as a chip's horizontal padding plus border: with a zero flex basis they are part of the base
  // size, and a bare filler would end up narrower than the columns above it.
  filler: { flex: 1, paddingHorizontal: 8 + t.borders.hairline },
}));
