import { View } from 'react-native';

import type { ScreenId } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { tabsForRole, useAppNavigation, type AppLink } from '@/navigation';
import { useRole } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, ListRow, Screen, Text } from '@/ui';

import { DetailAppBar } from './DetailAppBar';
import { ShellAppBar } from './ShellAppBar';
import { screenTitle } from './screen-titles';

export type ScreenPlaceholderProps = {
  screenId: ScreenId;
  /** Route params the screen received, shown as a list (proves the route passes them on). */
  params?: Record<string, string | number | undefined>;
  /** Onward links of the real screen, so navigation can be walked end to end before the screen exists. */
  links?: readonly AppLink[];
  /** Extra node under the links (e.g. the planner's segment switch). */
  children?: React.ReactNode;
};

function describe(link: AppLink): string {
  const { screen, ...params } = link as { screen: string } & Record<string, unknown>;
  const text = Object.entries(params)
    .filter(([, value]) => value !== undefined && typeof value !== 'object')
    .map(([name, value]) => `${name}: ${String(value)}`)
    .join(' · ');
  return text ? `${screen} (${text})` : screen;
}

/**
 * Stand-in for a screen an area team has not delivered yet. It already behaves like the real screen in
 * everything the shell owns: the right app bar (tab root or pushed), the route params, safe areas and
 * the onward links. The area's `<Name>Screen.tsx` replaces this body without touching the route.
 */
export function ScreenPlaceholder({ screenId, params, links, children }: ScreenPlaceholderProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const role = useRole();
  const navigation = useAppNavigation();
  const title = screenTitle(screenId, m.shell.tabs);
  const isTabRoot = role !== null && tabsForRole(role).some((tab) => tab.section === screenId);
  // The home tab shows the logo; the teacher's second planner segment is a tab root as well.
  const isHome = screenId === 'student.home' || screenId === 'teacher.home';
  const tabRoot = isTabRoot || screenId === 'planner.drafts';
  const entries = Object.entries(params ?? {}).filter(([, value]) => value !== undefined && value !== '');

  return (
    <Screen
      testID={`screen-${screenId}`}
      bottomInset={!tabRoot}
      header={tabRoot ? <ShellAppBar title={isHome ? undefined : title} /> : <DetailAppBar title={title} />}
    >
      <View style={styles.stack}>
        <Card variant="soft" dashed>
          <Text variant="kicker">{screenId}</Text>
          <Text variant="emptyTitle" style={styles.title}>
            {title}
          </Text>
          <Text variant="small" color="textMuted">
            {format(m.shell.placeholder.body, { screen: title })}
          </Text>
        </Card>

        {entries.length > 0 ? (
          <Card>
            <Text variant="kicker">{m.shell.placeholder.params}</Text>
            {entries.map(([name, value]) => (
              <View key={name} style={styles.param}>
                <Text variant="smallStrong" color="textMuted">
                  {name}
                </Text>
                <Text variant="mono" selectable style={styles.paramValue}>
                  {String(value)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {children}

        {links && links.length > 0 ? (
          <Card padded={false}>
            {links.map((link, index) => {
              const available = navigation.canOpen(link);
              return (
                <ListRow
                  key={describe(link)}
                  title={describe(link)}
                  titleLines={2}
                  subtitle={available ? undefined : dict.apiCommon.unauthorized}
                  // A link the role cannot open is plain text, never a tappable row (A2 B.2).
                  onPress={available ? () => navigation.open(link) : undefined}
                  divider={index < links.length - 1}
                  testID={`placeholder-link-${link.screen}`}
                />
              );
            })}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  stack: { gap: t.space.lg },
  title: { marginTop: t.space.xs, marginBottom: t.space.xs },
  param: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.md, marginTop: t.space.sm },
  paramValue: { flex: 1 },
}));
