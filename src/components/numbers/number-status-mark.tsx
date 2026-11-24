import { View } from 'react-native';

import type { HomeworkNumberStatus } from '@/api/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { StatusBadge } from '@/ui';

import { statusLabel } from './status-labels';

export type NumberStatusMarkProps = {
  /** The student's own status of the problem; `null` = not marked. */
  status: HomeworkNumberStatus | null;
};

/**
 * The status next to a number's title (docs/design/glass-over-paper.md §1 rule 3, §1a "status is colour and
 * shape"): a label only where attention is needed — «нужна помощь»; a solved number is a coloured dot and
 * an unmarked one shows nothing. Read-only everywhere it is drawn. Hidden from screen readers — the
 * element it sits in says the status in full.
 */
export function NumberStatusMark({ status }: NumberStatusMarkProps) {
  const theme = useTheme();
  const { m } = useI18n();
  if (status === null) return null;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {status === 'RED' ? (
        <StatusBadge status={status} label={statusLabel(status, m.common.statuses)} />
      ) : (
        <View style={{ width: theme.sizes.titleDot, height: theme.sizes.titleDot, borderRadius: theme.radii.full, backgroundColor: theme.status[status].solid }} />
      )}
    </View>
  );
}
