import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { LessonListItem, TeacherStudentListItem } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { statusBreakdown } from '@/components/numbers';
import { formatMsk } from '@/domain/dates';
import { lessonWhen } from '@/domain/lesson-when';
import { correctedNow } from '@/domain/server-clock';
import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar } from '@/screens/shell';
import { useNowTick } from '@/services/clock';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import {
  Avatar,
  Button,
  Card,
  Enter,
  Icon,
  IconTile,
  ListCard,
  ListRow,
  LoadingState,
  Notice,
  Panel,
  Panels,
  PressableScale,
  Screen,
  SectionCaption,
  StatusBar,
  Text,
  TextButton,
  navIcons,
} from '@/ui';

import { pickCallCounts } from './home/home-cards';
import { lessonAudience, progressCounts, studentsNeedingHelp, upcomingLessons } from './home/overview-model';

/** How many lessons «Ближайшие занятия» lists after the nearest one (tablet). */
const UPCOMING_ROWS = 3;

/**
 * `teacher.home` — «Обзор» (docs/spec/04-teacher-students.md S1; layout: docs/design/glass-over-paper.md
 * §7): what is next and who needs the teacher. One card for the nearest lesson with «Открыть доску», then
 * «Требуют внимания» — students with numbers marked «нужна помощь» and the parent calls that are due. A
 * tablet adds «Ближайшие занятия» and the «Прогресс» panel with a bar by status per student.
 *
 * The blocks are assembled from reads the app already makes: the overview summary and the call counters
 * (this screen's own), the students list (the «ученики» section) and the lessons list (the «занятия»
 * section) — the same cache entries. Topics, students, calls and lessons are opened from the dock.
 */
export function TeacherHomeScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const t = dict.teacherHome;
  const mt = m.teacher.home;
  const navigation = useAppNavigation();

  const home = useQuery({
    queryKey: qk('teacherStudents', 'getTeacherHome'),
    queryFn: () => api.teacherStudents.getTeacherHome(),
  });
  // The calls section refreshes this read after a call is recorded; the overview follows it (00 §3.2).
  const callCounts = useQuery({
    queryKey: qk('groups', 'getParentCallCounts'),
    queryFn: () => api.groups.getParentCallCounts(),
  });
  // The read of the «ученики» section: the counters by status of every student.
  const students = useQuery({
    queryKey: qk('teacherStudents', 'listStudents'),
    queryFn: () => api.teacherStudents.listStudents(),
  });
  // The read of the «занятия» section: the nearest lesson comes from its list.
  const lessons = useQuery({
    queryKey: qk('planner', 'listLessons'),
    queryFn: () => api.planner.listLessons(),
  });

  useRefetchOnFocus([home, callCounts, students, lessons]);
  const homeFailure = loadFailureOf(home);
  const { refreshing, refresh } = usePullRefresh([home, callCounts, students, lessons]);

  // "Today" follows the server clock, as in the lessons list.
  const deviceNow = useNowTick(60_000);
  const now = correctedNow(lessons.data?.serverNow, lessons.dataUpdatedAt, deviceNow);

  const summary = home.data;
  const calls = summary
    ? pickCallCounts(
        { data: summary.calls, updatedAt: home.dataUpdatedAt },
        callCounts.data ? { data: callCounts.data, updatedAt: callCounts.dataUpdatedAt } : null,
      )
    : null;
  const ahead = lessons.data ? upcomingLessons(lessons.data.lessons) : [];
  const nextLesson = ahead[0] ?? null;
  const later = ahead.slice(1, 1 + UPCOMING_ROWS);
  const list = students.data?.students;
  const needHelp = list ? studentsNeedingHelp(list) : [];

  const openStudent = (student: TeacherStudentListItem) => navigation.open({ screen: 'teacher.student.review', studentId: student.id });
  const openBoard = (lesson: LessonListItem) => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id });

  const whenOf = (lesson: LessonListItem) => {
    const when = lesson.startsAt ? lessonWhen(lesson.startsAt, lesson.status === 'ACTIVE', now, locale, mt) : '';
    const who = lessonAudience(lesson);
    return who ? format(mt.lessonWith, { when, who }) : when;
  };

  const callParts = calls
    ? [
        calls.due > 0 ? format(mt.callsLine, { label: t.calls.due, n: calls.due }) : null,
        calls.overdue > 0 ? format(mt.callsLine, { label: t.calls.overdue, n: calls.overdue }) : null,
      ].filter((part): part is string => part !== null)
    : [];

  /** Rows of «Требуют внимания». `inset` 0 inside a tablet panel, which pads its content itself. */
  const attentionRows = (inset: number | undefined) => {
    const rows = needHelp.map((student) => (
      <ListRow
        key={student.id}
        left={<Avatar name={student.name} tone="neutral" />}
        title={student.name}
        subtitle={plural(locale, student.redCount, mt.needHelpForms)}
        inset={inset}
        onPress={() => openStudent(student)}
        testID={`teacher-home-attention-${student.id}`}
      />
    ));
    if (calls && callParts.length > 0) {
      rows.push(
        <ListRow
          key="calls"
          left={
            <View style={styles.rowIcon}>
              <Icon name={navIcons.teacher.calls} size={theme.sizes.icon.md} color="label" />
            </View>
          }
          title={t.calls.title}
          subtitle={callParts.join(' · ')}
          subtitleTone={calls.overdue > 0 ? 'attention' : 'muted'}
          inset={inset}
          onPress={() => navigation.open({ screen: 'calls.list' })}
          testID="teacher-home-attention-calls"
        />,
      );
    }
    if (rows.length === 0) rows.push(<ListRow key="empty" title={mt.attentionEmpty} inset={inset} testID="teacher-home-attention-empty" />);
    return rows;
  };

  const lessonCard = nextLesson ? (
    <Enter index={0}>
      <Card style={theme.tablet ? styles.lessonWide : styles.lesson} testID="teacher-home-lesson">
        <View style={styles.lessonHead}>
          <IconTile icon={navIcons.teacher.lessons} />
          <View style={styles.lessonTexts}>
            {/* A phone leads with the time, a tablet with the title (it has the room for the larger line). */}
            <Text variant={theme.tablet ? 'sectionTitle' : 'bodyBold'} numberOfLines={1}>
              {theme.tablet ? nextLesson.title : whenOf(nextLesson)}
            </Text>
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {theme.tablet ? whenOf(nextLesson) : nextLesson.title}
            </Text>
          </View>
        </View>
        <Button
          label={mt.openBoard}
          accessibilityLabel={format(mt.openBoardOf, { title: nextLesson.title, when: whenOf(nextLesson) })}
          size={theme.tablet ? 'md' : 'lg'}
          rightIcon={theme.tablet ? 'forward' : undefined}
          onPress={() => openBoard(nextLesson)}
          testID="teacher-home-open-board"
        />
      </Card>
    </Enter>
  ) : null;

  // The cached overview stays on screen when a refresh fails (offline): say so instead of hiding it.
  const refreshError = home.isError ? (
    <Notice tone="error" text={errorText(home.error, m.common.errors.generic)} testID="teacher-home-refresh-error" />
  ) : null;

  let body;
  if (!summary) {
    body = homeFailure ? (
      <LoadFailure query={home} testID="teacher-home-error" />
    ) : (
      <LoadingState variant="list" count={4} accessibilityLabel={m.common.a11y.loading} testID="teacher-home-loading" />
    );
  } else if (theme.tablet) {
    const total = summary.stats.totalNumbers;
    body = (
      <>
        {refreshError}
        {lessonCard}
        <Panels testID="teacher-home-panels">
          <Panel
            weight={3}
            header={
              <Text variant="sectionTitle" accessibilityRole="header">
                {mt.attention}
              </Text>
            }
            contentStyle={styles.panelRows}
            testID="teacher-home-attention"
          >
            {attentionRows(0)}
            {later.length > 0 ? (
              <>
                <Text variant="kicker" color="textMuted" accessibilityRole="header" style={styles.subCaption}>
                  {mt.upcoming}
                </Text>
                {later.map((lesson, index) => (
                  <ListRow
                    key={lesson.id}
                    title={lesson.title}
                    subtitle={[formatMsk(lesson.startsAt, 'dayMonthTime', locale), lessonAudience(lesson)].filter(Boolean).join(' · ')}
                    inset={0}
                    divider={index < later.length - 1}
                    onPress={() => openBoard(lesson)}
                    testID={`teacher-home-upcoming-${lesson.id}`}
                  />
                ))}
              </>
            ) : null}
          </Panel>
          <Panel
            weight={2}
            header={
              <View style={styles.panelHead}>
                <Text variant="sectionTitle" accessibilityRole="header" style={styles.panelTitle}>
                  {mt.progress}
                </Text>
                <TextButton label={mt.allStudents} onPress={() => navigation.open({ screen: 'teacher.students' })} testID="teacher-home-all-students" />
              </View>
            }
            contentStyle={styles.panelRows}
            testID="teacher-home-progress"
          >
            {list && list.length > 0 ? (
              list.map((student, index) => {
                const counts = progressCounts(student, total);
                const breakdown = statusBreakdown(counts, m.common.statuses);
                return (
                  <PressableScale
                    key={student.id}
                    accessibilityRole="button"
                    accessibilityLabel={
                      breakdown ? format(mt.progressA11y, { name: student.name, breakdown }) : format(mt.progressEmptyA11y, { name: student.name })
                    }
                    onPress={() => openStudent(student)}
                    scaleTo={1}
                    pressedStyle={styles.pressed}
                    testID={`teacher-home-progress-${student.id}`}
                    style={[styles.progressRow, index < list.length - 1 ? styles.rowDivider : null]}
                  >
                    <Text variant="bodyStrong" numberOfLines={1} style={styles.progressName}>
                      {student.name}
                    </Text>
                    <StatusBar counts={counts} style={styles.progressBar} />
                    <Text variant="small" color="textMuted" tabular align="right" style={styles.progressValue}>
                      {student.solvedCount}
                    </Text>
                  </PressableScale>
                );
              })
            ) : list ? (
              <ListRow title={dict.students.list.empty} inset={0} divider={false} />
            ) : (
              <LoadingState variant="list" count={4} accessibilityLabel={m.common.a11y.loading} />
            )}
          </Panel>
        </Panels>
      </>
    );
  } else {
    body = (
      <>
        {refreshError}
        {lessonCard}
        <Enter index={1} style={styles.block}>
          <SectionCaption>{mt.attention}</SectionCaption>
          <ListCard testID="teacher-home-attention">{attentionRows(undefined)}</ListCard>
        </Enter>
      </>
    );
  }

  return (
    <Screen
      testID="teacher-home-screen"
      header={<ShellAppBar title={m.shell.tabs.overview} />}
      scroll={!theme.tablet}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {body}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  lesson: { gap: t.space.md },
  lessonWide: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg },
  lessonHead: { flex: t.tablet ? 1 : undefined, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.tablet ? t.space.lg : t.space.md },
  lessonTexts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  // The place of an avatar in a row that is not about a person.
  rowIcon: {
    width: t.sizes.avatarSm,
    height: t.sizes.avatarSm,
    borderRadius: t.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.soft2,
  },
  // Rows bring their own height and hairlines: the panel's gap between blocks is not wanted between them.
  panelRows: { gap: 0 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  panelTitle: { flexShrink: 1 },
  subCaption: { paddingTop: t.space.lg, paddingBottom: t.space.xxs },
  progressRow: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  rowDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  pressed: { opacity: 0.6 },
  progressName: { flex: 2, minWidth: 0 },
  progressBar: { flex: 3, alignSelf: 'center' },
  progressValue: { minWidth: t.space.xxl },
}));
