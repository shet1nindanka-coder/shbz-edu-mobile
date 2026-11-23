import type { ReactNode } from 'react';

import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { AppBar, Logo, PressableScale } from '@/ui';

import { ShellActions } from './ShellActions';

export type ShellAppBarProps = {
  /** Screen title: the section name («Домашние задания»), or the greeting on the overview. Without it the logo is shown. */
  title?: string;
  /** One muted line under the title. */
  subtitle?: string;
  /**
   * Controls of the section that belong to its header — a segmented switch, the main button: in the header
   * row on a tablet, in a row of their own under it on a phone.
   */
  aside?: ReactNode;
  testID?: string;
};

/**
 * Header of every section root (docs/design/glass-over-paper.md §5): the title on the left and the three
 * round glass buttons on the right — number search, the bell with its unread counter, the avatar that
 * leads to the profile.
 *
 * Usage: `<Screen header={<ShellAppBar title={m.shell.tabs.homeworks} />}>`.
 */
export function ShellAppBar({ title, subtitle, aside, testID }: ShellAppBarProps) {
  const { dict } = useI18n();
  const navigation = useAppNavigation();
  return (
    <AppBar
      testID={testID ?? 'shell-app-bar'}
      title={title}
      subtitle={subtitle}
      left={
        title === undefined ? (
          <PressableScale accessibilityRole="button" accessibilityLabel={dict.common.home} onPress={navigation.goHome} scaleTo={1} hitSlop={10}>
            <Logo size={24} />
          </PressableScale>
        ) : undefined
      }
      aside={aside}
      right={<ShellActions />}
    />
  );
}
