import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { qk, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, ErrorState, Icon, ListRow, LoadingState, Notice, Text, TextField } from '@/ui';

import { errorText } from '../shared/error-text';
import { isWaitingForNetwork } from '../shared/query-state';
import { filterByName } from './new-lesson-logic';

export type LessonTarget = { groupId: string } | { studentId: string };

export type TargetChooserProps = {
  onPick: (target: LessonTarget) => void;
};

type ChooserRow =
  | { type: 'title'; key: string; title: string }
  | { type: 'note'; key: string; text: string }
  | { type: 'group'; key: string; id: string; name: string; membersCount: number; last: boolean }
  | { type: 'student'; key: string; id: string; name: string; last: boolean };

/**
 * Whom the lesson is for (docs/spec/05-teacher-lessons-plans.md §1.2.a): the teacher's groups and
 * students as two searchable lists.
 */
export function TargetChooser({ onPick }: TargetChooserProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonNew;
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const targets = useQuery({ queryKey: qk('planner', 'getLessonTargets'), queryFn: () => api.planner.getLessonTargets() });
  const data = targets.data;

  const rows = useMemo<ChooserRow[]>(() => {
    if (!data) return [];
    const groups = filterByName(data.groups, query);
    const students = filterByName(data.students, query);
    const searching = query.trim() !== '';
    return [
      { type: 'title', key: 'groups-title', title: t.forGroup },
      ...(groups.length > 0
        ? groups.map<ChooserRow>((group, index) => ({
            type: 'group',
            key: `group-${group.id}`,
            id: group.id,
            name: group.name,
            membersCount: group.membersCount,
            last: index === groups.length - 1,
          }))
        : [{ type: 'note', key: 'groups-empty', text: searching && data.groups.length > 0 ? dict.planner.common.nothingFound : t.noGroups } satisfies ChooserRow]),
      { type: 'title', key: 'students-title', title: t.forStudent },
      ...(students.length > 0
        ? students.map<ChooserRow>((student, index) => ({
            type: 'student',
            key: `student-${student.id}`,
            id: student.id,
            name: student.name,
            last: index === students.length - 1,
          }))
        : [{ type: 'note', key: 'students-empty', text: searching && data.students.length > 0 ? dict.planner.common.nobodyFound : t.noStudents } satisfies ChooserRow]),
    ];
  }, [data, query, t, dict]);

  if (!data) {
    return targets.isError || isWaitingForNetwork(targets) ? (
      <View style={styles.state}>
        <ErrorState
          title={dict.shells.errorTitle}
          description={targets.isError ? errorText(targets.error, dict.shells.errorDescription) : m.common.errors.network}
          retryLabel={dict.common.retry}
          onRetry={() => void targets.refetch()}
          retrying={targets.isFetching}
          testID="lesson-targets-error"
        />
      </View>
    ) : (
      <View style={styles.state}>
        <LoadingState variant="list" count={6} accessibilityLabel={m.common.a11y.loading} testID="lesson-targets-loading" />
      </View>
    );
  }

  const refresh = () => {
    setRefreshing(true);
    void targets.refetch().finally(() => setRefreshing(false));
  };

  const renderRow = ({ item }: { item: ChooserRow }) => {
    switch (item.type) {
      case 'title':
        return (
          <Text variant="sectionTitle" accessibilityRole="header" style={styles.title}>
            {item.title}
          </Text>
        );
      case 'note':
        return (
          <Text variant="small" color="textMuted" style={styles.note}>
            {item.text}
          </Text>
        );
      case 'group':
        return (
          <ListRow
            title={item.name}
            meta={String(item.membersCount)}
            accessibilityLabel={`${item.name} · ${item.membersCount}`}
            left={
              <View style={styles.groupIcon}>
                <Icon name="usersGroup" size={18} color="kicker" />
              </View>
            }
            chevron
            inset={0}
            divider={!item.last}
            onPress={() => onPick({ groupId: item.id })}
            testID={`lesson-target-group-${item.id}`}
          />
        );
      case 'student':
        return (
          <ListRow
            title={item.name}
            left={<Avatar name={item.name} size={36} />}
            inset={0}
            divider={!item.last}
            onPress={() => onPick({ studentId: item.id })}
            testID={`lesson-target-student-${item.id}`}
          />
        );
    }
  };

  return (
    <FlashList
      data={rows}
      keyExtractor={(row) => row.key}
      getItemType={(row) => row.type}
      renderItem={renderRow}
      ListHeaderComponent={
        <View style={styles.header}>
          {targets.isError ? <Notice tone="error" text={errorText(targets.error, m.common.errors.generic)} testID="lesson-targets-refresh-error" /> : null}
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={m.planner.lessonNew.searchPlaceholder}
            accessibilityLabel={m.planner.lessonNew.searchAria}
            autoCorrect={false}
            returnKeyType="search"
            left={<Icon name="search" size={18} color="kicker" />}
            testID="lesson-targets-search"
          />
        </View>
      }
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={theme.colors.accentSolid}
          colors={[theme.colors.accentSolid]}
          progressBackgroundColor={theme.colors.cardBg}
        />
      }
      testID="lesson-targets-list"
    />
  );
}

const useStyles = makeStyles((t) => ({
  state: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg },
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md },
  title: { paddingTop: t.space.xl, paddingBottom: t.space.xs },
  note: { paddingVertical: t.space.sm },
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: t.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.softBg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
  },
}));
