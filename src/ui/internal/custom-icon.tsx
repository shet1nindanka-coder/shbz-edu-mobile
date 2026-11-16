import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

// Glyphs Feather lacks, drawn in the same style (24 × 24 viewBox, stroke 2, round caps and joins).
export const CUSTOM_ICON_NAMES = ['flame', 'calendarCheck', 'idCard', 'usersGroup'] as const;
export type CustomIconName = (typeof CUSTOM_ICON_NAMES)[number];

export type CustomIconProps = { name: CustomIconName; size: number; color: string };

export function CustomIcon({ name, size, color }: CustomIconProps) {
  if (name === 'flame') {
    // The site's streak flame: the only filled glyph.
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M12 2c1 3-1.5 4.5-1.5 7A3.5 3.5 0 0 0 14 12c0-2 1.5-3 1.5-3 1 4 .5 5-.5 7a4 4 0 1 1-7-3.5C9.5 9 11 7 12 2z"
        />
      </Svg>
    );
  }
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'calendarCheck' ? (
        <>
          <Rect x={3} y={4} width={18} height={18} rx={2} {...stroke} />
          <Line x1={16} y1={2} x2={16} y2={6} {...stroke} />
          <Line x1={8} y1={2} x2={8} y2={6} {...stroke} />
          <Line x1={3} y1={10} x2={21} y2={10} {...stroke} />
          <Path d="M9 16l2 2 4-4" {...stroke} />
        </>
      ) : null}
      {name === 'idCard' ? (
        <>
          <Rect x={2} y={5} width={20} height={14} rx={2} {...stroke} />
          <Circle cx={8} cy={11} r={2} {...stroke} />
          <Path d="M5 16c.6-1.4 1.7-2 3-2s2.4.6 3 2" {...stroke} />
          <Line x1={14.5} y1={10} x2={18.5} y2={10} {...stroke} />
          <Line x1={14.5} y1={14} x2={18.5} y2={14} {...stroke} />
        </>
      ) : null}
      {name === 'usersGroup' ? (
        <>
          <Circle cx={12} cy={8} r={3} {...stroke} />
          <Path d="M7 20v-1a5 5 0 0 1 10 0v1" {...stroke} />
          <Circle cx={4.5} cy={10.5} r={2} {...stroke} />
          <Path d="M1.5 19v-.5A3.5 3.5 0 0 1 5 15" {...stroke} />
          <Circle cx={19.5} cy={10.5} r={2} {...stroke} />
          <Path d="M22.5 19v-.5A3.5 3.5 0 0 0 19 15" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}
