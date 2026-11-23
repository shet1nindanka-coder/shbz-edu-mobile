import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type HomeworkNumberStatus } from '@/theme';

import { Icon, type IconName } from './icon';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';

/** Mark of a status: «решил сам» — check, «исправил» — turn-back arrow, «нужна помощь» — cross. */
export const STATUS_ICONS: Record<HomeworkNumberStatus, IconName> = { GREEN: 'check', YELLOW: 'rotateCcw', RED: 'close' };

export type NumberTileProps = {
  /** What the tile shows: the number as recorded («051004» — a string, leading zeros kept) or its tail («004»). */
  label: string;
  /** Status of the number; `null` = not marked (neutral tile). */
  status: HomeworkNumberStatus | null;
  /** The number the card below shows: an ink tile. */
  current?: boolean;
  /** Show the status mark before the label. Default on; switch off in dense grids. */
  icon?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  /** The full number and its status: «051004, нужна помощь». */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Number tile (`.nt`): 44 high, radius 12, 13 / 700 tabular digits on the soft status fill. The colour is
 * the status and nothing else; a student cannot change it — the tile only selects the number.
 */
export function NumberTile({ label, status, current = false, icon = true, onPress, accessibilityLabel, testID, style }: NumberTileProps) {
  const theme = useTheme();
  const styles = useStyles();
  const palette = current
    ? { bg: theme.colors.tabActiveBg, text: theme.colors.tabActiveText }
    : status
      ? theme.status[status]
      : theme.status.none;
  const content = (
    <>
      {icon && status && !current ? <Icon name={STATUS_ICONS[status]} size={theme.sizes.icon.sm} tint={palette.text} /> : null}
      <Text variant="tile" tabular numberOfLines={1} style={{ color: palette.text }}>
        {label}
      </Text>
    </>
  );
  const box = [styles.tile, { backgroundColor: palette.bg }, style];
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? label} testID={testID} style={box}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      testID={testID}
      style={box}
    >
      {content}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  tile: {
    height: t.sizes.tile,
    minWidth: t.sizes.tile,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xxs,
    paddingHorizontal: t.space.md,
    borderRadius: t.radii.md,
  },
}));
