import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';

export type DividerProps = {
  /** Hairline colour: `softBorder` inside cards (default), `rowBorder` between list rows, `divider` on the page. */
  color?: Extract<ColorToken, 'divider' | 'softBorder' | 'rowBorder' | 'cardBorder' | 'headerBorder'>;
  /** Left/right inset. */
  inset?: number;
  /** Vertical rule for rows; it stretches to the row height. */
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** 1px static hairline. */
export function Divider({ color = 'softBorder', inset = 0, vertical = false, style }: DividerProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        { backgroundColor: theme.colors[color] },
        vertical
          ? { width: theme.borders.hairline, alignSelf: 'stretch', marginVertical: inset }
          : { height: theme.borders.hairline, alignSelf: 'stretch', marginHorizontal: inset },
        style,
      ]}
    />
  );
}
