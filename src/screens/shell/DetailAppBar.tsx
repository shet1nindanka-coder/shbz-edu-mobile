import type { ReactNode } from 'react';

import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { AppBar } from '@/ui';

export type DetailAppBarProps = {
  title: string;
  subtitle?: string;
  /** Trailing controls (icon circles). */
  right?: ReactNode;
  /** Custom back action; default: go back, or to the role home when there is no history. */
  onBack?: () => void;
  testID?: string;
};

/**
 * App bar of a pushed screen: back arrow + title. "Back" always works — after a web reload or a deep
 * entry there is no history, so it leads to the role's home instead of doing nothing.
 *
 * Usage: `<Screen header={<DetailAppBar title={topic.title} />}>`.
 */
export function DetailAppBar({ title, subtitle, right, onBack, testID }: DetailAppBarProps) {
  const { m } = useI18n();
  const navigation = useAppNavigation();
  return (
    <AppBar
      testID={testID ?? 'detail-app-bar'}
      title={title}
      subtitle={subtitle}
      right={right}
      onBack={onBack ?? navigation.back}
      backLabel={m.common.a11y.goBack}
    />
  );
}
