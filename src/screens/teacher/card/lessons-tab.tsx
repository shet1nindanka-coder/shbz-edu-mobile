import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText } from '@/api';
import type { LessonItemResult, TeacherStudentLesson } from '@/api/types';
import { useHandout } from '@/components/lessons';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { formatMsk } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Hint } from '@/providers';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { ListRow, LoadingState, Notice, Panel, Panels, Text } from '@/ui';

import { usePanelRow } from '../students/use-panel-row';
import { CardScreen, type CardChrome } from './card-screen';
import { LessonAddSheet } from './lesson-add-sheet';
import { LessonCard } from './lesson-card';
import { LessonComposeCard } from './lesson-compose-card';
import { LessonDetail } from './lesson-detail';
import type { LessonItem } from './lessons-logic';
import { useStudentGone } from './use-student-gone';
import { useStudentLessons } from './use-student-lessons';

export type LessonsTabProps = { studentId: string; chrome: CardChrome };

const NO_LESSONS: readonly TeacherStudentLesson[] = [];

/**
 * `teacher.student.lessons` (docs/spec/04-teacher-students.md S6): the student's lessons, newest first,
 * under the "compose a lesson" invitation — results per problem, set editing, "Retry" of the AI selection,
 * and the ways out to the lesson board, the handout and a homework from the results. A phone lists the
 * lessons as cards that unfold; a tablet lists them on the left and shows the selected one on the right.
 */
export function LessonsTab({ studentId, chrome }: LessonsTabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const t = dict.students.lessons;
  const panelRow = usePanelRow();

  const controller = useStudentLessons(studentId);
  const { list, lessons } = controller;
  useStudentGone(studentId, list.error);
  const listFailure = loadFailureOf(list);
  const handout = useHandout();

  // Every lesson starts collapsed; local view state is reset when the screen is opened again.
  const [expandedIds, setExpandedIds] = useState<readonly string[]>([]);
  const [addFor, setAddFor] = useState<string | null>(null);
  // The lesson the tablet's second panel shows; null = the first of the list.
  const [pickedId, setPickedId] = useState<string | null>(null);

  const addLesson = lessons?.find((lesson) => lesson.id === addFor) ?? null;
  const waitSeconds = Math.max(controller.waits.result.seconds, controller.waits.items.seconds, controller.waits.plan.seconds);

  const { refreshing, refresh } = usePullRefresh([list]);

  const toggle = (id: string) => setExpandedIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  /** The one caption of a lesson: when, the group, the duration and the status. */
  const metaOf = (lesson: TeacherStudentLesson) =>
    [formatMsk(lesson.startsAt ?? lesson.createdAt, 'dateTime', locale), lesson.groupName, format(t.minutes, { n: lesson.durationMinutes }), t.status[lesson.status]]
      .filter(Boolean)
      .join(' · ');

  /** What every view of a lesson needs besides the lesson itself. */
  const detailProps = (lesson: TeacherStudentLesson) => ({
    lesson,
    meta: metaOf(lesson),
    planState: controller.planStateOf(lesson),
    busy: controller.busy[lesson.id],
    savingItemIds: controller.savingItemIds,
    error: controller.errors[lesson.id],
    waitSeconds,
    itemsBlocked: controller.waits.items.waiting,
    resultsBlocked: controller.waits.result.waiting,
    planBlocked: controller.waits.plan.waiting,
    handout,
    onDismissError: () => controller.dismissError(lesson.id),
    onOpen: () => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id }),
    onRetry: () => controller.regenerate(lesson),
    onResult: (item: LessonItem, result: LessonItemResult | null) => controller.markResult(lesson, item, result),
    // As on the site: the set minus this problem is saved at once (a `409 blockedNumbers` shows in the card).
    onRemove: (item: LessonItem) => controller.removeItem(lesson, item),
    onAdd: () => setAddFor(lesson.id),
    onAssignFromResults: () => navigation.open({ screen: 'planner.draftNew', lessonId: lesson.id, studentId }),
    // Opened from a student's card, the handout holds this student's set only (90-addendum-2 A.2.6).
    onDownloadPdf: () => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt, studentId }),
  });

  const intro = (
    <>
      <Hint>
        <Text variant="hint" color="textMuted">
          {t.description}
        </Text>
      </Hint>
      {/* Cached lessons stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {list.isError && lessons ? <Notice tone="error" text={errorText(list.error, m.common.errors.generic)} testID="student-lessons-refresh-error" /> : null}
    </>
  );

  const compose = lessons ? (
    <LessonComposeCard
      hint={lessons.length === 0 ? t.composeHintEmpty : t.composeHint}
      onPress={() => navigation.open({ screen: 'planner.lessonNew', studentId })}
      testID="student-lessons-compose"
    />
  ) : null;

  const placeholder = lessons ? null : listFailure ? (
    <LoadFailure query={list} testID="student-lessons-error" />
  ) : (
    <LoadingState variant="list" count={3} accessibilityLabel={m.common.a11y.loading} testID="student-lessons-loading" />
  );

  let content;
  if (!theme.tablet) {
    content = (
      <FlashList
        data={lessons ?? NO_LESSONS}
        keyExtractor={(lesson) => lesson.id}
        renderItem={({ item: lesson }) => (
          <View style={styles.item}>
            <LessonCard {...detailProps(lesson)} expanded={expandedIds.includes(lesson.id)} onToggle={() => toggle(lesson.id)} />
          </View>
        )}
        // Everything a card shows besides its lesson: expansion, the clock and the request states.
        extraData={[expandedIds, controller.now, controller.busy, controller.savingItemIds, controller.errors, waitSeconds, handout.failure, handout.wait.waiting]}
        ListHeaderComponent={
          <View style={styles.header}>
            {intro}
            {compose}
          </View>
        }
        ListEmptyComponent={placeholder}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accentSolid}
            colors={[theme.colors.accentSolid]}
            progressBackgroundColor={theme.colors.cardBg}
          />
        }
        testID="student-lessons-list"
      />
    );
  } else {
    const selected = lessons ? (lessons.find((lesson) => lesson.id === pickedId) ?? lessons[0] ?? null) : null;
    content = (
      <>
        {intro}
        {lessons ? (
          <Panels testID="student-lessons-panels">
            <Panel weight={2} padded={false} header={<View style={styles.panelCompose}>{compose}</View>} contentStyle={styles.listPanel} testID="student-lessons-list">
              {lessons.map((lesson, index) => (
                <ListRow
                  key={lesson.id}
                  title={lesson.title}
                  titleLines={2}
                  subtitle={metaOf(lesson)}
                  subtitleLines={2}
                  selected={lesson.id === selected?.id}
                  {...panelRow(lesson.id === selected?.id, index < lessons.length - 1)}
                  onPress={() => setPickedId(lesson.id)}
                  testID={`student-lesson-toggle-${lesson.id}`}
                />
              ))}
            </Panel>
            <Panel weight={3} testID="student-lessons-detail">
              {selected ? (
                <View style={styles.detail} testID={`student-lesson-${selected.id}`}>
                  <View style={styles.detailHead}>
                    <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
                      {selected.title}
                    </Text>
                    <Text variant="small" color="textMuted" tabular>
                      {metaOf(selected)}
                    </Text>
                  </View>
                  <LessonDetail {...detailProps(selected)} />
                </View>
              ) : null}
            </Panel>
          </Panels>
        ) : (
          placeholder
        )}
      </>
    );
  }

  return (
    <CardScreen chrome={chrome} panels={theme.tablet}>
      {content}

      <LessonAddSheet
        visible={addLesson !== null}
        lessonTitle={addLesson?.title ?? ''}
        existingIds={addLesson?.items.map((item) => item.homeworkNumberId) ?? []}
        onClose={() => setAddFor(null)}
        onAdd={(homeworkNumberId, toExtra) => {
          if (addLesson) controller.addNumber(addLesson, homeworkNumberId, toExtra);
        }}
      />
    </CardScreen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md, paddingBottom: t.space.block },
  item: { paddingBottom: t.space.block },
  // The invitation stays above the rows of the tablet's list panel; the rows bring their own padding.
  panelCompose: { padding: t.space.lg, paddingBottom: 0 },
  listPanel: { gap: 0, paddingTop: t.space.sm, paddingBottom: t.space.sm },
  detail: { gap: t.space.lg },
  detailHead: { gap: t.space.xxxs },
}));
