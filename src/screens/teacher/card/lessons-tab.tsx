import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import type { TeacherStudentLesson } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Hint } from '@/providers';
import { useHandout } from '@/screens/planner/shared/use-handout';
import { makeStyles, useTheme } from '@/theme';
import { Dialog, ErrorState, LoadingState, Notice, Text } from '@/ui';

import { errorText } from '../students/error-text';
import { CardScreen, type CardChrome } from './card-screen';
import { LessonAddSheet } from './lesson-add-sheet';
import { LessonCard } from './lesson-card';
import { LessonComposeCard } from './lesson-compose-card';
import type { LessonItem } from './lessons-logic';
import { useStudentGone } from './use-student-gone';
import { useStudentLessons } from './use-student-lessons';

export type LessonsTabProps = { studentId: string; chrome: CardChrome };

const NO_LESSONS: readonly TeacherStudentLesson[] = [];

/**
 * `teacher.student.lessons` (docs/spec/04-teacher-students.md S6): the student's lessons, newest first,
 * as collapsible cards under the "compose a lesson" card — results per problem, set editing, "Retry" of
 * the AI selection, and the ways out to the lesson board, the handout and a homework from the results.
 */
export function LessonsTab({ studentId, chrome }: LessonsTabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.students.lessons;

  const controller = useStudentLessons(studentId);
  const { list, lessons } = controller;
  useStudentGone(studentId, list.error);
  const handout = useHandout();

  // Every lesson starts collapsed; local view state is reset when the screen is opened again.
  const [expandedIds, setExpandedIds] = useState<readonly string[]>([]);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ lesson: TeacherStudentLesson; item: LessonItem } | null>(null);
  const [shownRemoving, setShownRemoving] = useState(removing);
  if (removing !== null && removing !== shownRemoving) setShownRemoving(removing);
  const [refreshing, setRefreshing] = useState(false);

  const addLesson = lessons?.find((lesson) => lesson.id === addFor) ?? null;
  const waitSeconds = Math.max(controller.waits.result.seconds, controller.waits.items.seconds, controller.waits.plan.seconds);

  const refresh = () => {
    setRefreshing(true);
    void list.refetch().finally(() => setRefreshing(false));
  };

  const toggle = (id: string) => setExpandedIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const header = (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {t.title}
        </Text>
        <Hint>
          <Text variant="small" color="textMuted">
            {t.description}
          </Text>
        </Hint>
      </View>
      {/* Cached lessons stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {list.isError && lessons ? <Notice tone="error" text={errorText(list.error, m.common.errors.generic)} testID="student-lessons-refresh-error" /> : null}
      {lessons ? (
        <LessonComposeCard
          hint={lessons.length === 0 ? t.composeHintEmpty : t.composeHint}
          onPress={() => navigation.open({ screen: 'planner.lessonNew', studentId })}
          testID="student-lessons-compose"
        />
      ) : null}
    </View>
  );

  const body = lessons ? null : list.isError ? (
    <ErrorState
      title={dict.shells.errorTitle}
      description={errorText(list.error, dict.shells.errorDescription)}
      retryLabel={dict.common.retry}
      onRetry={() => void list.refetch()}
      retrying={list.isFetching}
      testID="student-lessons-error"
    />
  ) : (
    <LoadingState variant="cards" count={3} cardHeight={110} accessibilityLabel={m.common.a11y.loading} testID="student-lessons-loading" />
  );

  return (
    <CardScreen chrome={chrome}>
      <FlashList
        data={lessons ?? NO_LESSONS}
        keyExtractor={(lesson) => lesson.id}
        renderItem={({ item: lesson }) => (
          <View style={styles.item}>
            <LessonCard
              lesson={lesson}
              planState={controller.planStateOf(lesson)}
              expanded={expandedIds.includes(lesson.id)}
              busy={controller.busy[lesson.id]}
              savingItemIds={controller.savingItemIds}
              error={controller.errors[lesson.id]}
              waitSeconds={waitSeconds}
              itemsBlocked={controller.waits.items.waiting}
              resultsBlocked={controller.waits.result.waiting}
              planBlocked={controller.waits.plan.waiting}
              handout={handout}
              onToggle={() => toggle(lesson.id)}
              onDismissError={() => controller.dismissError(lesson.id)}
              onOpen={() => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id })}
              onRetry={() => controller.regenerate(lesson)}
              onResult={(item, result) => controller.markResult(lesson, item, result)}
              onRemove={(item) => setRemoving({ lesson, item })}
              onAdd={() => setAddFor(lesson.id)}
              onAssignFromResults={() => navigation.open({ screen: 'planner.draftNew', lessonId: lesson.id, studentId })}
              // Opened from a student's card, the handout holds this student's set only (90-addendum-2 A.2.6).
              onDownloadPdf={() => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt, studentId })}
            />
          </View>
        )}
        // Everything a card shows besides its lesson: expansion, the clock and the request states.
        extraData={[expandedIds, controller.now, controller.busy, controller.savingItemIds, controller.errors, waitSeconds, handout.failure, handout.wait.waiting]}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
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

      <LessonAddSheet
        visible={addLesson !== null}
        lessonTitle={addLesson?.title ?? ''}
        existingIds={addLesson?.items.map((item) => item.homeworkNumberId) ?? []}
        onClose={() => setAddFor(null)}
        onAdd={(homeworkNumberId, toExtra) => {
          if (addLesson) controller.addNumber(addLesson, homeworkNumberId, toExtra);
        }}
      />

      {/* The site removes at once; a stray tap on a phone would drop the problem together with its result. */}
      <Dialog
        visible={removing !== null}
        kicker={dict.topics.widgets.confirm.kicker}
        title={format(m.teacher.lessons.removeConfirmTitle, { n: shownRemoving?.item.number ?? '' })}
        description={m.teacher.lessons.removeConfirmDescription}
        confirmLabel={m.teacher.lessons.removeConfirm}
        cancelLabel={dict.topics.widgets.confirm.cancel}
        onConfirm={() => {
          if (removing) controller.removeItem(removing.lesson, removing.item);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
        testID="student-lesson-remove-dialog"
      />
    </CardScreen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.md, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md, paddingBottom: t.space.md },
  titles: { gap: t.space.xs },
  item: { paddingBottom: t.space.md },
}));
