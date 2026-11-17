import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText } from '@/api';
import type { LessonBoardItem, LessonBoardParticipant } from '@/api/types';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { planRequestedAtOf, useHandout } from '@/components/lessons';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { ProgressHistorySheet } from '@/components/progress-history';
import { UndoToast } from '@/components/undo-toast';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Dialog, IconButton, LoadingState, Screen } from '@/ui';

import { BoardHeader } from './lessons/board-header';
import { participantLive } from './lessons/board-logic';
import { ManualAddSheet } from './lessons/manual-add-sheet';
import { ParticipantCard } from './lessons/participant-card';
import { useLessonBoard } from './lessons/use-lesson-board';
import { planStateOf } from './shared/plan-state';

/** Route params of `planner.lessonBoard` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerLessonBoardScreenProps = ScreenParams['planner.lessonBoard'];

/**
 * `planner.lessonBoard` (docs/spec/05-teacher-lessons-plans.md §1.3, §1.4): every student's set with the
 * main and extra parts, the AI-plan state, result marks, and — while the lesson runs — who has joined,
 * what was submitted and who is idle. Secondary actions (handout PDF, print version, answers, homework
 * from results, delete) sit behind "⋯" in the app bar.
 */
export function PlannerLessonBoardScreen({ lessonId }: PlannerLessonBoardScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const confirm = dict.topics.widgets.confirm;

  const controller = useLessonBoard(lessonId);
  const { data: lesson, board, now } = controller;
  const handout = useHandout();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<'finish' | 'delete' | null>(null);
  // A group opens collapsed (the headers carry the live chips); a single student opens expanded.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [addFor, setAddFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<{ studentId: string; homeworkNumberId: string } | null>(null);

  // The answer to an action is shown at the top of the board; the row that caused it may be far below.
  const listRef = useRef<FlashListRef<LessonBoardParticipant>>(null);
  const notice = controller.notice;
  const handoutFailure = handout.failure;
  useEffect(() => {
    if (notice || handoutFailure) listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [notice, handoutFailure]);

  const { refreshing, refresh } = usePullRefresh([board]);

  // `404 lessonNotFound`: deleted, or it belongs to another teacher — with the server's own words.
  if (controller.notFound) return <NotFoundScreen description={errorText(board.error, dict.shells.notFoundDescription)} />;

  if (!lesson) {
    return (
      <Screen testID="planner-lesson-board-screen" header={<DetailAppBar title={dict.planner.lessonDetail.fallbackKicker} />}>
        {board.isError || isWaitingForNetwork(board) ? (
          <LoadFailure query={board} testID="lesson-board-error" />
        ) : (
          <LoadingState variant="cards" count={3} cardHeight={120} accessibilityLabel={m.common.a11y.loading} testID="lesson-board-loading" />
        )}
      </Screen>
    );
  }

  // The site's page header is «{group | "Урок"} · {date} · {n} мин» over the lesson title. The app bar has
  // one line, where a title such as «Занятие группы · Логарифмические уравнения» is cut, so — as on the
  // draft board — the bar carries the short label and the kicker, and the board starts with the full title.
  const kicker = [
    lesson.group?.name,
    formatDateTime(lesson.startsAt ?? lesson.createdAt, locale),
    format(dict.planner.common.minutesShort, { n: lesson.durationMinutes }),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const single = lesson.participants.length === 1;
  const isExpanded = (participantId: string) => toggled[participantId] ?? single;
  const addParticipant = lesson.participants.find((participant) => participant.id === addFor) ?? null;

  const openPhotos = (item: LessonBoardItem, index: number) => {
    const photos = item.submission?.photoFileIds ?? [];
    navigation.openFiles(
      photos.map((fileId, position) => ({ id: fileId, originalName: `${format(t.photo, { n: position + 1 })}.jpg`, mimeType: 'image/jpeg' })),
      { initialIndex: index, title: format(dict.planner.common.numberSign, { n: item.number }) },
    );
  };

  const menuActions: SheetAction[] = [
    {
      key: 'handout',
      label: m.planner.lessonBoard.handout,
      icon: 'file',
      disabled: handout.wait.waiting,
      onPress: () => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt }),
    },
    {
      // The HTML handout (the site's «Для печати»): the system prints it or saves it as a PDF.
      key: 'print',
      label: m.planner.lessonBoard.print,
      icon: 'printer',
      disabled: handout.wait.waiting,
      onPress: () => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt, format: 'html' }),
    },
    {
      key: 'answers',
      label: t.answersPdf,
      icon: 'check',
      disabled: handout.wait.waiting,
      onPress: () => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt, answers: true }),
    },
    {
      key: 'homework',
      label: t.issueHomework,
      icon: 'send',
      onPress: () => navigation.open({ screen: 'planner.draftNew', lessonId: lesson.id }),
    },
    {
      key: 'delete',
      label: t.delete,
      icon: 'trash',
      tone: 'danger',
      disabled: controller.waits.lesson.waiting,
      onPress: () => setConfirming('delete'),
    },
  ];

  const renderParticipant = ({ item: participant }: { item: LessonBoardParticipant }) => (
    <View style={styles.item}>
      <ParticipantCard
        participant={participant}
        lessonStatus={lesson.status}
        planState={planStateOf(participant, now, planRequestedAtOf(participant.id))}
        live={participantLive(participant, lesson, now)}
        aiAvailable={lesson.aiAvailable}
        expanded={isExpanded(participant.id)}
        busy={controller.busy[participant.id]}
        planBlocked={controller.waits.plan.waiting}
        itemsBlocked={controller.waits.items.waiting}
        resultsBlocked={controller.waits.result.waiting}
        savingItemIds={controller.savingItemIds}
        itemErrors={controller.itemErrors}
        now={now}
        onToggle={() => setToggled((current) => ({ ...current, [participant.id]: !(current[participant.id] ?? single) }))}
        onRetry={() => controller.regenerate(participant.id)}
        onAdd={() => setAddFor(participant.id)}
        onResult={(target, result) => controller.markResult(participant.id, target.id, result)}
        onRemove={(target) => controller.removeItem(participant, target)}
        onHistory={(target) => setHistoryFor({ studentId: participant.studentId, homeworkNumberId: target.homeworkNumberId })}
        onOpenPhoto={openPhotos}
      />
    </View>
  );

  return (
    <Screen
      testID="planner-lesson-board-screen"
      header={
        <DetailAppBar
          title={dict.planner.lessonDetail.fallbackKicker}
          subtitle={kicker}
          right={<IconButton icon="more" accessibilityLabel={m.planner.lessonBoard.actions} onPress={() => setMenuOpen(true)} testID="lesson-board-menu" />}
          testID="lesson-board-app-bar"
        />
      }
      scroll={false}
      padded={false}
    >
      <FlashList
        ref={listRef}
        data={lesson.participants}
        keyExtractor={(participant) => participant.id}
        renderItem={renderParticipant}
        // Everything a card shows besides its participant: the clock, expansion and the request states.
        extraData={[now, toggled, controller.busy, controller.savingItemIds, controller.itemErrors, controller.waits, lesson.status, lesson.aiAvailable]}
        ListHeaderComponent={<BoardHeader lesson={lesson} controller={controller} handout={handout} onFinish={() => setConfirming('finish')} />}
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
        testID="lesson-board-list"
      />

      {controller.undo ? (
        <UndoToast text={controller.undo.label} undoLabel={dict.planner.common.undo} onUndo={controller.undoRemoval} testID="lesson-undo-toast" />
      ) : null}

      <ActionSheet visible={menuOpen} title={m.planner.lessonBoard.actions} actions={menuActions} onClose={() => setMenuOpen(false)} testID="lesson-board-actions" />

      <ManualAddSheet
        visible={addParticipant !== null}
        studentName={addParticipant?.studentName ?? ''}
        existingIds={addParticipant?.items.map((item) => item.homeworkNumberId) ?? []}
        onClose={() => setAddFor(null)}
        onAdd={(homeworkNumberId, toExtra) => {
          if (addParticipant) controller.addNumber(addParticipant, homeworkNumberId, toExtra);
        }}
      />

      <ProgressHistorySheet
        visible={historyFor !== null}
        studentId={historyFor?.studentId ?? ''}
        homeworkNumberId={historyFor?.homeworkNumberId ?? ''}
        currentLessonId={lesson.id}
        onClose={() => setHistoryFor(null)}
      />

      {/* The site finishes without asking; a stray tap on a phone would close the lesson for everyone. */}
      <Dialog
        visible={confirming === 'finish'}
        tone="default"
        kicker={confirm.kicker}
        title={m.planner.lessonBoard.finishTitle}
        description={m.planner.lessonBoard.finishDescription}
        confirmLabel={m.planner.lessonBoard.finishConfirm}
        pendingLabel={t.finishing}
        cancelLabel={confirm.cancel}
        pending={controller.finish.isPending}
        onConfirm={() => controller.finish.mutate(undefined, { onSettled: () => setConfirming(null) })}
        onCancel={() => setConfirming(null)}
        testID="lesson-finish-dialog"
      />

      <Dialog
        visible={confirming === 'delete'}
        kicker={confirm.kicker}
        title={t.deleteTitle}
        description={t.deleteDescription}
        confirmLabel={confirm.confirm}
        pendingLabel={confirm.pending}
        cancelLabel={confirm.cancel}
        pending={controller.remove.isPending}
        onConfirm={() => controller.remove.mutate(undefined, { onSettled: () => setConfirming(null) })}
        onCancel={() => setConfirming(null)}
        testID="lesson-delete-dialog"
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  item: { paddingBottom: t.space.lg },
}));
