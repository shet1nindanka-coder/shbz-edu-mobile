import { type StyleProp, type ViewStyle } from 'react-native';

import { statusTone, type HomeworkNumberStatus } from '@/theme';

import { Badge } from './badge';

export type StatusBadgeProps = {
  /** Traffic-light status of a problem; `null` = not marked. */
  status: HomeworkNumberStatus | null;
  /** The short name of the status: «решил сам», «исправил», «нужна помощь», «не отмечено». */
  label: string;
  /** The long name for screen readers («Решен с первого раза»); default: `label`. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Traffic-light badge (`HomeworkStatusBadge`). The colour always comes with a word. */
export function StatusBadge({ status, label, accessibilityLabel, style }: StatusBadgeProps) {
  return <Badge tone={statusTone(status)} label={label} accessibilityLabel={accessibilityLabel} style={style} />;
}
