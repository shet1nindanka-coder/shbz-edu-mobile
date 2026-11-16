import type { ScreenId } from '@/api/types';
import { useI18n } from '@/i18n';
import { moreSections, navItemOf, useAppNavigation, type AppLink } from '@/navigation';
import { makeStyles } from '@/theme';
import { Card, Icon, ListRow, Screen, navIcons, type IconName } from '@/ui';

import { ShellAppBar } from './ShellAppBar';
import { screenTitle } from './screen-titles';

const LINKS: Partial<Record<ScreenId, AppLink>> = {
  'content.topics': { screen: 'content.topics' },
  'groups.list': { screen: 'groups.list' },
};

/**
 * Root of the teacher's fifth tab «ещё / more» (docs/spec/00-unified-contract.md §3.1): the primary
 * sections that do not fit the bar — темы and группы — in site order. Not a registered screen of its own:
 * it replaces the site's hamburger list for these two entries.
 */
export function TeacherMoreScreen() {
  const styles = useStyles();
  const { m } = useI18n();
  const navigation = useAppNavigation();
  const sections = moreSections('TEACHER');
  const hints: Partial<Record<ScreenId, string>> = {
    'content.topics': m.shell.nav.moreTopicsHint,
    'groups.list': m.shell.nav.moreGroupsHint,
  };
  const icons: Record<string, IconName> = navIcons.teacher;

  return (
    <Screen testID="teacher-more-screen" bottomInset={false} header={<ShellAppBar title={m.shell.tabs.more} />}>
      <Card padded={false}>
        {sections.map((section, index) => {
          const link = LINKS[section.screen];
          if (!link) return null;
          return (
            <ListRow
              key={section.screen}
              title={screenTitle(section.screen, m.shell.tabs)}
              subtitle={hints[section.screen]}
              left={<Icon name={icons[navItemOf(section.labelKey)] ?? 'more'} size={20} color="textStrong" />}
              onPress={() => navigation.push(link)}
              divider={index < sections.length - 1}
              style={styles.row}
              testID={`more-${section.screen}`}
            />
          );
        })}
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: 64, paddingVertical: t.space.xs },
}));
