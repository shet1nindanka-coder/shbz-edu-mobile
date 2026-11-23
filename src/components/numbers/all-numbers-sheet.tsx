import { View } from 'react-native';

import { commonPrefixLength, groupByStatus, shortNumber, type FocusNumber, type StatusKey } from '@/domain/number-focus';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Icon, NumberTile, STATUS_ICONS, Text } from '@/ui';

import { statusGroupTitle, statusLabel } from './status-labels';

export type AllNumbersSheetProps = {
  visible: boolean;
  onClose: () => void;
  numbers: readonly FocusNumber[];
  /** The number whose card is shown now. */
  selectedId?: string | null;
  /** A tile was pressed: the owner selects that number and closes the sheet. */
  onSelect: (id: string) => void;
  testID?: string;
};

/**
 * «Все номера» (docs/design/glass-over-paper.md §7, principle 5): every number of a set in one sheet,
 * grouped by status — «нужна помощь», the unmarked, «исправил», «решил сам». When all numbers share a
 * prefix the tiles show the last three digits; the range under the title gives the whole numbers.
 */
export function AllNumbersSheet({ visible, onClose, numbers, selectedId, onSelect, testID }: AllNumbersSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  const statuses = m.common.statuses;
  const prefix = commonPrefixLength(numbers);
  const groups = groupByStatus(numbers);
  const first = numbers[0]?.number;
  const last = numbers[numbers.length - 1]?.number;
  const toneColor = (status: StatusKey) => (status === 'none' ? theme.colors.label : theme.status[status].text);

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={m.common.actions.close} title={m.common.numbers.all} testID={testID}>
      <View style={styles.body}>
        {first && last && numbers.length > 1 ? (
          <Text variant="small" color="textMuted" tabular>
            {format(m.common.numbers.range, { first, last })}
          </Text>
        ) : null}
        {groups.map((group) => (
          <View key={group.status} style={styles.group}>
            <View style={styles.groupHead}>
              {group.status === 'none' ? null : <Icon name={STATUS_ICONS[group.status]} size={theme.sizes.icon.sm} tint={toneColor(group.status)} />}
              <Text variant="smallBold" accessibilityRole="header" style={{ color: toneColor(group.status) }}>
                {statusGroupTitle(group.status, group.numbers.length, statuses)}
              </Text>
            </View>
            <View style={styles.grid}>
              {group.numbers.map((entry) => (
                <NumberTile
                  key={entry.id}
                  label={shortNumber(entry.number, prefix)}
                  status={entry.status}
                  current={entry.id === selectedId}
                  icon={false}
                  onPress={() => onSelect(entry.id)}
                  accessibilityLabel={format(m.common.numbers.tileA11y, { number: entry.number, status: statusLabel(entry.status, statuses) })}
                  testID={testID ? `${testID}-${entry.number}` : undefined}
                  style={prefix > 0 ? styles.cellShort : styles.cellWide}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.lg, paddingBottom: t.space.sm },
  group: { gap: t.space.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  // Three-digit tails: 44-wide cells, seven to a phone row. Whole numbers need a wider cell.
  cellShort: { width: t.sizes.tile, paddingHorizontal: 0 },
  cellWide: { minWidth: 72 + t.space.sm },
}));
