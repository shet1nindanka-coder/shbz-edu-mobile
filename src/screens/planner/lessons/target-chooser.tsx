import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, Icon, IconTile, ListCard, ListRow, LoadingState, Notice, Panel, Panels, Screen, SectionCaption, Text, TextField } from '@/ui';

import { filterByName } from './new-lesson-logic';

export type LessonTarget = { groupId: string } | { studentId: string };

export type TargetChooserProps = {
  /** Header of the screen. */
  header: ReactNode;
  onPick: (target: LessonTarget) => void;
};

/**
 * Whom the lesson is for (docs/spec/05-teacher-lessons-plans.md §1.2.a): the teacher's groups and
 * students as two lists of rows under one search field. A phone stacks the lists; a tablet puts them side
 * by side.
 */
export function TargetChooser({ header, onPick }: TargetChooserProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonNew;
  const [query, setQuery] = useState('');

  const targets = useQuery({ queryKey: qk('planner', 'getLessonTargets'), queryFn: () => api.planner.getLessonTargets() });
  const data = targets.data;
  const { refreshing, refresh } = usePullRefresh([targets]);

  if (!data) {
    return (
      <Screen testID="planner-lesson-new-screen" header={header}>
        {targets.isError || isWaitingForNetwork(targets) ? (
          <LoadFailure query={targets} testID="lesson-targets-error" />
        ) : (
          <LoadingState variant="list" count={6} accessibilityLabel={m.common.a11y.loading} testID="lesson-targets-loading" />
        )}
      </Screen>
    );
  }

  const groups = filterByName(data.groups, query);
  const students = filterByName(data.students, query);
  const searching = query.trim() !== '';

  const note = (text: string) => (
    <Text variant="small" color="textMuted" style={styles.note}>
      {text}
    </Text>
  );

  const groupRows =
    groups.length > 0
      ? groups.map((group, index) => (
          <ListRow
            key={group.id}
            title={group.name}
            meta={String(group.membersCount)}
            accessibilityLabel={`${group.name} · ${group.membersCount}`}
            left={<IconTile icon="bookUser" tone="quiet" />}
            divider={index < groups.length - 1}
            onPress={() => onPick({ groupId: group.id })}
            testID={`lesson-target-group-${group.id}`}
          />
        ))
      : note(searching && data.groups.length > 0 ? dict.planner.common.nothingFound : t.noGroups);

  const studentRows =
    students.length > 0
      ? students.map((student, index) => (
          <ListRow
            key={student.id}
            title={student.name}
            left={<Avatar name={student.name} tone="neutral" />}
            divider={index < students.length - 1}
            onPress={() => onPick({ studentId: student.id })}
            testID={`lesson-target-student-${student.id}`}
          />
        ))
      : note(searching && data.students.length > 0 ? dict.planner.common.nobodyFound : t.noStudents);

  const top = (
    <>
      {targets.isError ? <Notice tone="error" text={errorText(targets.error, m.common.errors.generic)} testID="lesson-targets-refresh-error" /> : null}
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={m.planner.lessonNew.searchPlaceholder}
        accessibilityLabel={m.planner.lessonNew.searchAria}
        autoCorrect={false}
        returnKeyType="search"
        left={<Icon name="search" size={theme.sizes.icon.md} color="textMuted" />}
        testID="lesson-targets-search"
      />
    </>
  );

  if (theme.tablet) {
    return (
      <Screen testID="planner-lesson-new-screen" header={header} scroll={false} maxWidth="full">
        {top}
        <Panels testID="lesson-targets-list">
          <Panel
            padded={false}
            contentStyle={styles.panelRows}
            header={
              <Text variant="sectionTitle" accessibilityRole="header" style={styles.panelHead}>
                {t.forGroup}
              </Text>
            }
          >
            {groupRows}
          </Panel>
          <Panel
            padded={false}
            contentStyle={styles.panelRows}
            header={
              <Text variant="sectionTitle" accessibilityRole="header" style={styles.panelHead}>
                {t.forStudent}
              </Text>
            }
          >
            {studentRows}
          </Panel>
        </Panels>
      </Screen>
    );
  }

  return (
    <Screen testID="planner-lesson-new-screen" header={header} onRefresh={refresh} refreshing={refreshing}>
      {top}
      <View style={styles.section} testID="lesson-targets-list">
        <SectionCaption>{t.forGroup}</SectionCaption>
        <ListCard>{groupRows}</ListCard>
      </View>
      <View style={styles.section}>
        <SectionCaption>{t.forStudent}</SectionCaption>
        <ListCard>{studentRows}</ListCard>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.xs },
  note: { paddingHorizontal: t.space.card, paddingVertical: t.space.md },
  panelHead: { paddingHorizontal: t.space.card, paddingTop: t.space.card },
  panelRows: { gap: 0, paddingTop: t.space.xs, paddingBottom: t.space.sm },
}));
