import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { errorText } from '@/api';
import type { LessonBoardItem, LessonBoardParticipant } from '@/api/types';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { planRequestedAtOf, useHandout } from '@/components/lessons';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { ProgressHistorySheet } from '@/components/progress-history';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import {
  BottomSheet,
  Button,
  Card,
  Dialog,
  IconButton,
  ListCard,
  LoadingState,
  Notice,
  Panel,
  Panels,
  Screen,
  SectionCaption,
  Text,
  TextButton,
  accessibilityLabelOf,
  useNavigationFocused,
} from '@/ui';

import { BoardNotices } from './lessons/board-notices';
import { minutesLeft, participantCaption, participantLive, pickBoardItemId } from './lessons/board-logic';
import { ItemResultBar } from './lessons/item-result-bar';
import { ManualAddSheet } from './lessons/manual-add-sheet';
import { ParticipantDetail } from './lessons/participant-detail';
import { ParticipantRow } from './lessons/participant-row';
import { useLessonBoard } from './lessons/use-lesson-board';
import { useParticipantCaptionText } from './lessons/use-participant-caption';
import { planStateOf } from './shared/plan-state';
import { rowDateTime } from './shared/row-date';
import { useLatched } from './shared/use-latched';

/** Route params of `planner.lessonBoard` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerLessonBoardScreenProps = ScreenParams['planner.lessonBoard'];

/** After a sheet this screen does not own has been told to close: its exit animation plus a margin. */
const REOPEN_MARGIN_MS = 140;

/**
 * `planner.lessonBoard` (docs/spec/05-teacher-lessons-plans.md §1.3, §1.4; layout: mockups `PT-board`,
 * `T-board`): the class as rows — a name, «2/7», and a caption only for who needs the teacher — and one
 * student's numbers with the result buttons: a sheet on a phone, the panel next to the class on a tablet (a
 * lesson for one student shows them right on the page). «Завершить урок» is the dark button; the secondary
 * actions (handout, print version, answers, homework from results, delete) sit behind "⋯" in the header.
 * The board explains nothing in sentences (docs/design/glass-over-paper.md §1a).
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
  const captionText = useParticipantCaptionText();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<'finish' | 'delete' | null>(null);
  // The student whose numbers are shown: in the sheet of a phone (`openId`), in the panel of a tablet
  // (`panelId`). Two states, so a window that becomes narrow does not pop a sheet up by itself.
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  // The number picked in each student's grid; without a pick the board chooses (`pickBoardItemId`).
  const [pickedItems, setPickedItems] = useState<Record<string, string>>({});
  const [addFor, setAddFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<{ studentId: string; homeworkNumberId: string } | null>(null);

  // Two modals must never overlap (iOS refuses the second one): what the student's sheet asked for runs
  // when the sheet has left, and the sheet comes back when the next one — "add a problem", the status
  // history — has left in its turn.
  const afterSheet = useRef<(() => void) | null>(null);
  const returnTo = useRef<string | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useNavigationFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  useEffect(
    () => () => {
      if (returnTimer.current) clearTimeout(returnTimer.current);
    },
    [],
  );

  // The answer to an action is shown at the top of the board; the row that caused it may be far below.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const notice = controller.notice;
  const handoutFailure = handout.failure;
  useEffect(() => {
    if (notice || handoutFailure) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [notice, handoutFailure]);

  const { refreshing, refresh } = usePullRefresh([board]);

  // The sheet keeps its student while it slides away: its content must not collapse mid-animation.
  const sheetParticipant = useLatched(lesson?.participants.find((participant) => participant.id === openId) ?? null);

  // `404 lessonNotFound`: deleted, or it belongs to another teacher — with the server's own words.
  if (controller.notFound) return <NotFoundScreen description={errorText(board.error, dict.shells.notFoundDescription)} />;

  if (!lesson) {
    return (
      <Screen
        testID="planner-lesson-board-screen"
        header={<DetailAppBar title={dict.planner.lessonDetail.fallbackKicker} backTitle={m.shell.tabs.lessons} />}
      >
        {board.isError || isWaitingForNetwork(board) ? (
          <LoadFailure query={board} testID="lesson-board-error" />
        ) : (
          <LoadingState variant="list" count={5} accessibilityLabel={m.common.a11y.loading} testID="lesson-board-loading" />
        )}
      </Screen>
    );
  }

  const isLive = lesson.status === 'ACTIVE';
  const participants = lesson.participants;
  const single = participants.length === 1;
  // A phone with a class: rows, and a sheet for the tapped student.
  const sheetMode = !theme.tablet && !single;

  // The one caption of the board (the site's page kicker): whose lesson it is and when — or, while it
  // runs, how long it still lasts. The status is not spelled out: a running lesson counts down and has its
  // «Завершить урок», an unscheduled one starts with the date field.
  const left = minutesLeft(lesson, now);
  // On a tablet the group is the title of the class panel, right above this line.
  const groupName = theme.tablet ? null : lesson.group?.name;
  const when = isLive
    ? left !== null
      ? format(m.planner.lessonBoard.timeLeft, { n: left })
      : dict.planner.lessonStatus.ACTIVE
    : lesson.startsAt
      ? rowDateTime(lesson.startsAt, now, locale)
      : null;
  const kicker = accessibilityLabelOf([groupName, when], ' · ');

  const views = new Map(
    participants.map((participant) => {
      const planState = planStateOf(participant, now, planRequestedAtOf(participant.id));
      const live = participantLive(participant, lesson, now);
      return [participant.id, { planState, live, caption: captionText(participantCaption(participant, planState, live, lesson.status)) }] as const;
    }),
  );
  const currentOf = (participant: LessonBoardParticipant) => {
    const id = pickBoardItemId(participant.items, pickedItems[participant.id]);
    return participant.items.find((item) => item.id === id) ?? null;
  };

  // Tablet: the tapped student, else the first one who needs the teacher, else the first of the class.
  const panelParticipant = theme.tablet
    ? (participants.find((participant) => participant.id === panelId) ??
      participants.find((participant) => views.get(participant.id)?.caption.attention) ??
      participants[0] ??
      null)
    : null;
  // The board's own choices are pinned as soon as they are shown: the next re-read (a check that ended, a
  // result that was marked) must not move the panel to another student, or the card to another number,
  // under the teacher's hands.
  if (panelParticipant && panelParticipant.id !== panelId) setPanelId(panelParticipant.id);
  const pinned = panelParticipant ?? (single && !theme.tablet ? (participants[0] ?? null) : null);
  if (pinned) {
    const picked = pickedItems[pinned.id];
    const auto = pickBoardItemId(pinned.items);
    if (auto !== null && !pinned.items.some((item) => item.id === picked)) setPickedItems((current) => ({ ...current, [pinned.id]: auto }));
  }
  /** A tap on a student's row. The sheet opens on the number that needs the teacher now. */
  const showParticipant = (participant: LessonBoardParticipant) => {
    if (theme.tablet) {
      setPanelId(participant.id);
      return;
    }
    const auto = pickBoardItemId(participant.items);
    if (auto !== null) setPickedItems((current) => ({ ...current, [participant.id]: auto }));
    setOpenId(participant.id);
  };

  const openPhotos = (item: LessonBoardItem, index: number) => {
    const photos = item.submission?.photoFileIds ?? [];
    navigation.openFiles(
      photos.map((fileId, position) => ({ id: fileId, originalName: `${format(t.photo, { n: position + 1 })}.jpg`, mimeType: 'image/jpeg' })),
      { initialIndex: index, title: format(dict.planner.common.numberSign, { n: item.number }) },
    );
  };

  /** Runs `action` once the student's sheet has left (at once where there is no sheet). */
  const leaveSheetFor = (action: () => void) => {
    if (!sheetMode || openId === null) {
      action();
      return;
    }
    afterSheet.current = action;
    returnTo.current = openId;
    setOpenId(null);
  };
  const reopenSheet = () => {
    const id = returnTo.current;
    returnTo.current = null;
    // Only on the board itself: a teacher who has left it meanwhile (a link of the history) is not followed.
    if (id && focusedRef.current) setOpenId(id);
  };

  const detailOf = (participant: LessonBoardParticipant, slots: { top?: ReactNode; results?: ReactNode } = {}) => {
    const view = views.get(participant.id);
    if (!view) return null;
    const undo = controller.undo && controller.undo.participantId === participant.id ? controller.undo : null;
    return (
      <ParticipantDetail
        participant={participant}
        current={currentOf(participant)}
        lessonStatus={lesson.status}
        planState={view.planState}
        live={view.live}
        caption={view.caption}
        aiAvailable={lesson.aiAvailable}
        busy={controller.busy[participant.id]}
        planBlocked={controller.waits.plan.waiting}
        itemsBlocked={controller.waits.items.waiting}
        itemErrors={controller.itemErrors}
        now={now}
        undoText={undo ? undo.label : null}
        top={slots.top}
        results={slots.results}
        onUndo={controller.undoRemoval}
        onSelect={(item) => setPickedItems((picked) => ({ ...picked, [participant.id]: item.id }))}
        onRetry={() => controller.regenerate(participant.id)}
        onAdd={() => leaveSheetFor(() => setAddFor(participant.id))}
        onRemove={(item) => controller.removeItem(participant, item)}
        onHistory={(item) => leaveSheetFor(() => setHistoryFor({ studentId: participant.studentId, homeworkNumberId: item.homeworkNumberId }))}
        onOpenPhoto={openPhotos}
      />
    );
  };

  const resultBarOf = (participant: LessonBoardParticipant) => {
    const current = currentOf(participant);
    if (!current) return undefined;
    const resultWait = controller.waits.result.seconds;
    return (
      <ItemResultBar
        item={current}
        participantId={participant.id}
        disabled={
          controller.busy[participant.id] !== undefined ||
          controller.waits.items.waiting ||
          controller.savingItemIds.includes(current.id) ||
          resultWait > 0
        }
        waitSeconds={resultWait}
        onResult={(result) => {
          // The marked number stays the shown one: without a pick the board would jump to the next number
          // that waits for the teacher, and the mark just made could not be seen or corrected.
          setPickedItems((picked) => ({ ...picked, [participant.id]: current.id }));
          controller.markResult(participant.id, current.id, result);
        }}
      />
    );
  };

  const rows = participants.map((participant, index) => {
    const view = views.get(participant.id);
    if (!view) return null;
    return (
      <ParticipantRow
        key={participant.id}
        participant={participant}
        caption={view.caption}
        planPending={view.planState.pending}
        selected={panelParticipant?.id === participant.id}
        divider={index < participants.length - 1}
        onPress={() => showParticipant(participant)}
      />
    );
  });

  const finishButton = isLive ? (
    <Button
      label={controller.finish.isPending ? t.finishing : t.finish}
      variant="dark"
      fullWidth={!theme.tablet}
      loading={controller.finish.isPending}
      disabled={controller.waits.lesson.waiting}
      onPress={() => setConfirming('finish')}
      testID="lesson-finish"
    />
  ) : null;

  const menuActions: SheetAction[] = [
    {
      key: 'handout',
      label: m.planner.handout.title,
      icon: 'file',
      disabled: handout.wait.waiting,
      onPress: () => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt }),
    },
    {
      // The HTML handout (the site's «Для печати»): the system prints it or saves it as a PDF.
      key: 'print',
      label: t.print,
      icon: 'printer',
      disabled: handout.wait.waiting,
      onPress: () => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt, format: 'html' }),
    },
    {
      key: 'answers',
      label: m.planner.handout.answersTitle,
      icon: 'check',
      disabled: handout.wait.waiting,
      onPress: () => handout.open({ lessonId: lesson.id, createdAt: lesson.createdAt, answers: true }),
    },
    {
      key: 'homework',
      label: dict.students.detail.tabAssign,
      icon: 'send',
      onPress: () => navigation.open({ screen: 'planner.draftNew', lessonId: lesson.id }),
    },
    {
      key: 'delete',
      label: dict.planner.lessonDelete.label,
      icon: 'trash',
      tone: 'danger',
      disabled: controller.waits.lesson.waiting,
      onPress: () => setConfirming('delete'),
    },
  ];

  const addParticipant = participants.find((participant) => participant.id === addFor) ?? null;
  // The sheet covers the board: the answer to an action taken in it (a set that was not saved, a plan
  // that was not restarted) and the cool-down are repeated inside it.
  const sheetTop = (
    <>
      {notice ? (
        <Notice tone={notice.tone} text={notice.text} onDismiss={controller.dismissNotice} dismissLabel={m.common.actions.close} testID="lesson-sheet-notice" />
      ) : null}
      <RetryWaitLine seconds={Math.max(controller.waits.plan.seconds, controller.waits.items.seconds)} testID="lesson-sheet-wait" />
    </>
  );

  return (
    <Screen
      testID="planner-lesson-board-screen"
      header={
        <DetailAppBar
          title={lesson.title}
          backTitle={m.shell.tabs.lessons}
          right={<IconButton icon="more" accessibilityLabel={m.planner.lessonBoard.actions} onPress={() => setMenuOpen(true)} testID="lesson-board-menu" />}
          // A tablet has the room for the lesson's main action in its header; a phone puts it under the class.
          aside={theme.tablet ? (finishButton ?? undefined) : undefined}
          testID="lesson-board-app-bar"
        />
      }
      scroll={!theme.tablet}
      scrollRef={scrollRef}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <BoardNotices lesson={lesson} controller={controller} handout={handout} />

      {/* A number removed in a student's sheet can be put back there; once the sheet is closed, here. */}
      {controller.undo && sheetMode && openId === null ? (
        <Notice
          tone="success"
          text={controller.undo.label}
          action={<TextButton label={dict.planner.common.undo} onPress={controller.undoRemoval} testID="lesson-undo-toast-undo" />}
          testID="lesson-undo-toast"
        />
      ) : null}

      {theme.tablet ? (
        <Panels testID="lesson-board-list">
          <Panel
            padded={false}
            contentStyle={styles.classPanel}
            header={
              <View style={styles.panelHead}>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {lesson.group?.name ?? dict.planner.groups.detail.participants}
                </Text>
                {kicker ? (
                  <Text variant="small" color="textMuted" tabular testID="lesson-board-kicker">
                    {kicker}
                  </Text>
                ) : null}
              </View>
            }
          >
            {rows}
          </Panel>
          {/* Equal panels: the student's numbers, statement, photos and result buttons need the width. */}
          <Panel
            header={
              panelParticipant ? (
                <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
                  {panelParticipant.studentName}
                </Text>
              ) : undefined
            }
            footer={panelParticipant ? resultBarOf(panelParticipant) : undefined}
          >
            {panelParticipant ? detailOf(panelParticipant) : null}
          </Panel>
        </Panels>
      ) : (
        <>
          <View style={styles.section}>
            {kicker ? <SectionCaption testID="lesson-board-kicker">{kicker}</SectionCaption> : null}
            {single && participants[0] ? (
              // A lesson for one student: no list to pick from, the numbers are right on the page.
              <Card style={styles.singleCard}>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {participants[0].studentName}
                </Text>
                {detailOf(participants[0], { results: resultBarOf(participants[0]) })}
              </Card>
            ) : (
              <ListCard testID="lesson-board-list">{rows}</ListCard>
            )}
          </View>
          {finishButton}
        </>
      )}

      {sheetMode ? (
        <BottomSheet
          visible={openId !== null}
          onClose={() => setOpenId(null)}
          onClosed={() => {
            const next = afterSheet.current;
            afterSheet.current = null;
            next?.();
          }}
          closeLabel={m.common.actions.close}
          title={sheetParticipant?.studentName}
          footer={sheetParticipant ? resultBarOf(sheetParticipant) : undefined}
          testID="lesson-participant-sheet"
        >
          {sheetParticipant ? detailOf(sheetParticipant, { top: sheetTop }) : null}
        </BottomSheet>
      ) : null}

      <ActionSheet visible={menuOpen} title={m.planner.lessonBoard.actions} actions={menuActions} onClose={() => setMenuOpen(false)} testID="lesson-board-actions" />

      <ManualAddSheet
        visible={addParticipant !== null}
        existingIds={addParticipant?.items.map((item) => item.homeworkNumberId) ?? []}
        onClose={() => setAddFor(null)}
        onClosed={reopenSheet}
        onAdd={(homeworkNumberId, toExtra) => {
          if (addParticipant) controller.addNumber(addParticipant, homeworkNumberId, toExtra);
        }}
      />

      <ProgressHistorySheet
        visible={historyFor !== null}
        studentId={historyFor?.studentId ?? ''}
        homeworkNumberId={historyFor?.homeworkNumberId ?? ''}
        currentLessonId={lesson.id}
        onClose={() => {
          setHistoryFor(null);
          // The history sheet reports no "closed": the student's sheet returns once its exit has played.
          if (returnTo.current) {
            if (returnTimer.current) clearTimeout(returnTimer.current);
            returnTimer.current = setTimeout(reopenSheet, theme.motion.duration.sheetOut + REOPEN_MARGIN_MS);
          }
        }}
      />

      {/* The site finishes without asking; a stray tap on a phone would close the lesson for everyone. */}
      <Dialog
        visible={confirming === 'finish'}
        tone="default"
        title={m.planner.lessonBoard.finishTitle}
        description={m.planner.lessonBoard.finishDescription}
        confirmLabel={t.finish}
        pendingLabel={t.finishing}
        cancelLabel={confirm.cancel}
        pending={controller.finish.isPending}
        onConfirm={() => controller.finish.mutate(undefined, { onSettled: () => setConfirming(null) })}
        onCancel={() => setConfirming(null)}
        testID="lesson-finish-dialog"
      />

      <Dialog
        visible={confirming === 'delete'}
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
  section: { gap: t.space.xs },
  singleCard: { gap: t.space.md },
  // The rows bring their own padding; the head of the class panel lines up with them.
  panelHead: { gap: t.space.xxs, paddingHorizontal: t.space.card, paddingTop: t.space.card },
  classPanel: { gap: 0, paddingTop: t.space.xs, paddingBottom: t.space.sm },
}));
