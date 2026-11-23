import type { ReactNode } from 'react';

import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui';

import { ShellActions } from './ShellActions';

export type DetailAppBarProps = {
  title: string;
  subtitle?: string;
  /**
   * Where "back" leads, shown in the link above the title: «‹ Домашние задания». Default: the generic
   * «Назад». A screen reader always hears «Вернуться назад».
   */
  backTitle?: string;
  /** Compact controls next to the title: a «⋯» menu, a "+" mark. */
  right?: ReactNode;
  /**
   * Larger controls of the screen that belong to its header (a segmented switch, the main button): in the
   * header row on a tablet, in a row of their own under the title on a phone.
   */
  aside?: ReactNode;
  /** Custom back action; default: go back, or to the role home when there is no history. */
  onBack?: () => void;
  testID?: string;
};

/**
 * Header of a pushed screen (docs/design/glass-over-paper.md §5): the "back" link above the title. "Back"
 * always works — after a web reload or a deep entry there is no history, so it leads to the role's home
 * instead of doing nothing.
 *
 * A phone shows only the link, the title and the screen's own controls: a pushed screen is about one
 * thing, and the title needs the whole width. A tablet has the room, so the three round buttons stay.
 *
 * Usage: `<Screen header={<DetailAppBar title={topic.title} backTitle={m.shell.tabs.topics} />}>`.
 */
export function DetailAppBar({ title, subtitle, backTitle, right, aside, onBack, testID }: DetailAppBarProps) {
  const { m } = useI18n();
  const theme = useTheme();
  const navigation = useAppNavigation();
  return (
    <AppBar
      testID={testID ?? 'detail-app-bar'}
      title={title}
      subtitle={subtitle}
      aside={aside}
      right={
        theme.tablet ? (
          <>
            {right}
            <ShellActions />
          </>
        ) : (
          right
        )
      }
      onBack={onBack ?? navigation.back}
      backLabel={m.common.a11y.goBack}
      backTitle={backTitle ?? m.common.back}
    />
  );
}
