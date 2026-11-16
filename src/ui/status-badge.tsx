import { type StyleProp, type ViewStyle } from 'react-native';

import { statusTone, type HomeworkNumberStatus } from '@/theme';

import { Badge } from './badge';

export type StatusBadgeProps = {
  /** Traffic-light status of a problem; `null` = not marked. */
  status: HomeworkNumberStatus | null;
  /** `dict.status[status].shortLabel`, or `dict.student.statusBadge.unmarked` for `null`. */
  label: string;
  style?: StyleProp<ViewStyle>;
};

/** Traffic-light badge (`HomeworkStatusBadge`). The colour always comes with a word. */
export function StatusBadge({ status, label, style }: StatusBadgeProps) {
  return <Badge tone={statusTone(status)} label={label} style={style} />;
}
