import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { errorText } from '@/api';
import type { HomeworkPlanParticipant } from '@/api/types';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { planRequestedAtOf, useHandout } from '@/components/lessons';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { RetryWaitLine } from '@/components/retry-wait';
import { formatDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { Hint } from '@/providers';
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
  ListRow,
  LoadingState,
  Notice,
  Panel,
  Panels,
  Screen,
  SectionCaption,
  Text,
  accessibilityLabelOf,
} from '@/ui';

import { DraftAddSheet } from './drafts/draft-add-sheet';
import { DraftBoardNotices } from './drafts/draft-board-notices';
import { DraftParticipantActions } from './drafts/draft-participant-actions';
import { DraftParticipantDetail } from './drafts/draft-participant-detail';
import { DraftParticipantRow } from './drafts/draft-participant-row';
import { draftCreatedAt } from './drafts/drafts-logic';
import { useDraftBoard } from './drafts/use-draft-board';
import { useDraftCaptionText } from './drafts/use-draft-caption';
import { planStateOf } from './shared/plan-state';
import { useLatched } from './shared/use-latched';

/** Route params of `planner.draftBoard` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerDraftBoardScreenProps = ScreenParams['planner.draftBoard'];

/**
 * `planner.draftBoard` (docs/spec/05-teacher-lessons-plans.md §1.7; layout: mockup `T-hwplan`): the
 * students of a homework draft as rows, and one student's set — the numbers the AI selected, edited,
 * rebuilt and assigned — in a sheet on a phone, in the panel next to the list on a tablet (a draft for one
 * student shows it right on the page). «Выдать всем» is the main button of the header; the answer sheet
 * and "delete" sit behind "⋯".
 */
export function PlannerDraftBoardScreen({ planId }: PlannerDraftBoardScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const detail = dict.planner.homeworkPlans.detail;
  const confirm = dict.topics.widgets.confirm;

  const controller = useDraftBoard(planId);
  const { data: plan, board, now } = controller;
  const handout = useHandout();
  const captionOf = useDraftCaptionText();

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The student whose set is shown: the open sheet on a phone, the tapped row on a tablet.
  const [openId, setOpenId] = useState<string | null>(null);
  // The number picked in each student's grid; without a pick the first of the set is shown.
  const [pickedItems, setPickedItems] = useState<Record<string, string>>({});
  const [addFor, setAddFor] = useState<string | null>(null);

  // Two modals must never overlap (iOS refuses the second one): "add a problem" opens when the student's
  // sheet has left, and that sheet comes back when "add a problem" has left in its turn.
  const afterSheet = useRef<(() => void) | null>(null);
  const returnTo = useRef<string | null>(null);

  // The answer to an action is shown at the top of the board; the row that caused it may be far below.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const { notice, issueFailures } = controller;
  const handoutFailure = handout.failure;
  useEffect(() => {
    if (notice || issueFailures.length > 0 || handoutFailure) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [notice, issueFailures, handoutFailure]);

  const { refreshing, refresh } = usePullRefresh([board]);

  // The sheet keeps its student while it slides away: its content must not collapse mid-animation.
  const sheetParticipant = useLatched(plan?.participants.find((participant) => participant.id === openId) ?? null);

  if (controller.notFound) return <NotFoundScreen description={errorText(board.error, dict.shells.notFoundDescription)} />;

  if (!plan) {
    return (
      <Screen
        testID="planner-draft-board-screen"
        header={<DetailAppBar title={dict.planner.homeworkPlans.new.kicker} backTitle={m.shell.tabs.lessons} />}
      >
        {board.isError || isWaitingForNetwork(board) ? (
          <LoadFailure query={board} testID="draft-board-error" />
        ) : (
          <LoadingState variant="list" count={5} accessibilityLabel={m.common.a11y.loading} testID="draft-board-loading" />
        )}
      </Screen>
    );
  }

  const participants = plan.participants;
  const single = participants.length === 1;
  // A phone with several students: rows, and a sheet for the tapped one.
  const sheetMode = !theme.tablet && !single;
  const sourceLesson = plan.sourceLesson;
  const sourceLink = sourceLesson ? ({ screen: 'planner.lessonBoard', lessonId: sourceLesson.id } as const) : null;
  const canOpenSource = sourceLink !== null && navigation.canOpen(sourceLink);

  // The site's kicker (topic · group) and the deadline line, with «выдано 1 из 4» once somebody has it.
  const kicker = accessibilityLabelOf([plan.topicTitle, plan.group?.name], ' · ');
  const deadlineLabel =
    plan.deadlineAt && plan.daysUntilDeadline !== null
      ? format(plural(locale, plan.daysUntilDeadline, detail.deadlineForms), { date: formatDateTime(plan.deadlineAt, locale) })
      : detail.noDeadline;
  const issuedLabel = controller.issuedCount > 0 ? format(t.issuedOf, { issued: controller.issuedCount, total: participants.length }) : null;
  const facts = accessibilityLabelOf([deadlineLabel, issuedLabel], ' · ');

  const views = new Map(
    participants.map((participant) => {
      const planState = planStateOf(participant, now, planRequestedAtOf(participant.id));
      return [participant.id, { planState, caption: captionOf(participant, planState) }] as const;
    }),
  );
  const currentOf = (participant: HomeworkPlanParticipant) =>
    participant.items.find((item) => item.id === pickedItems[participant.id]) ?? participant.items[0] ?? null;

  // Tablet: the tapped student, else the first one whose plan failed, else the first of the list.
  const panelParticipant = theme.tablet
    ? (participants.find((participant) => participant.id === openId) ??
      participants.find((participant) => views.get(participant.id)?.caption.attention) ??
      participants[0] ??
      null)
    : null;

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

  const detailOf = (participant: HomeworkPlanParticipant, top?: ReactNode) => {
    const view = views.get(participant.id);
    if (!view) return null;
    return (
      <DraftParticipantDetail
        participant={participant}
        current={currentOf(participant)}
        planState={view.planState}
        caption={view.caption}
        aiAvailable={plan.aiAvailable}
        busy={controller.busy[participant.id]}
        issuingAll={controller.issuingAll}
        planBlocked={controller.waits.plan.waiting}
        itemsBlocked={controller.waits.items.waiting}
        top={top}
        onSelect={(item) => setPickedItems((picked) => ({ ...picked, [participant.id]: item.id }))}
        onRegenerate={() => controller.regenerate(participant.id)}
        onAdd={() => leaveSheetFor(() => setAddFor(participant.id))}
        onRemove={(item) => controller.removeItem(participant, item)}
      />
    );
  };

  const actionsOf = (participant: HomeworkPlanParticipant) => {
    const view = views.get(participant.id);
    if (!view) return undefined;
    const studentLink = { screen: 'teacher.student.review', studentId: participant.studentId } as const;
    return (
      <DraftParticipantActions
        participant={participant}
        planState={view.planState}
        aiAvailable={plan.aiAvailable}
        busy={controller.busy[participant.id]}
        issuingAll={controller.issuingAll}
        planBlocked={controller.waits.plan.waiting}
        issueBlocked={controller.waits.draft.waiting}
        canOpenStudent={navigation.canOpen(studentLink)}
        primaryIssue={sheetMode}
        onRegenerate={() => controller.regenerate(participant.id)}
        onIssue={() => controller.issueOne(participant.id)}
        onOpenStudent={() => navigation.open(studentLink)}
      />
    );
  };

  const rows = participants.map((participant, index) => {
    const view = views.get(participant.id);
    if (!view) return null;
    return (
      <DraftParticipantRow
        key={participant.id}
        participant={participant}
        caption={view.caption}
        planPending={view.planState.pending}
        selected={panelParticipant?.id === participant.id}
        divider={index < participants.length - 1}
        onPress={() => setOpenId(participant.id)}
      />
    );
  });

  // A transition to the lesson the homework reinforces: a navigation row, not a button.
  const sourceRow =
    sourceLesson && sourceLink && canOpenSource ? (
      <ListRow
        title={format(detail.afterLesson, { title: sourceLesson.title })}
        titleLines={2}
        chevron
        divider={false}
        onPress={() => navigation.open(sourceLink)}
        testID="draft-source-lesson"
      />
    ) : null;

  const issueHint = (
    <Hint>
      <Text variant="small" color="textMuted" style={styles.hint}>
        {m.planner.draftBoard.issueHint}
      </Text>
    </Hint>
  );

  const menuActions: SheetAction[] = [
    {
      key: 'answers',
      label: t.answersPdf,
      icon: 'check',
      disabled: handout.wait.waiting,
      // A draft has no printable handout — only the answer sheet.
      onPress: () => handout.open({ lessonId: plan.id, createdAt: draftCreatedAt(plan), answers: true }),
    },
    {
      key: 'delete',
      label: t.delete,
      icon: 'trash',
      tone: 'danger',
      disabled: controller.waits.draft.waiting,
      onPress: () => setDeleting(true),
    },
  ];

  const addParticipant = participants.find((participant) => participant.id === addFor) ?? null;
  // The sheet covers the board: the answer to an action taken in it (issued, not saved, not restarted),
  // the cool-down and this student's issue failure are repeated inside it.
  const sheetTop = (participant: HomeworkPlanParticipant) => {
    const failure = issueFailures.find((entry) => entry.participantId === participant.id);
    return (
      <>
        {notice ? (
          <Notice tone={notice.tone} text={notice.text} onDismiss={controller.dismissNotice} dismissLabel={m.common.actions.close} testID="draft-sheet-notice" />
        ) : null}
        {failure ? <Notice tone="error" title={t.issueFailures} text={failure.message} testID="draft-sheet-issue-failure" /> : null}
        <RetryWaitLine
          seconds={Math.max(controller.waits.plan.seconds, controller.waits.items.seconds, controller.waits.draft.seconds)}
          testID="draft-sheet-wait"
        />
      </>
    );
  };

  return (
    <Screen
      testID="planner-draft-board-screen"
      header={
        <DetailAppBar
          title={plan.title}
          backTitle={m.shell.tabs.lessons}
          right={<IconButton icon="more" accessibilityLabel={m.planner.draftBoard.actions} onPress={() => setMenuOpen(true)} testID="draft-board-menu" />}
          aside={
            <Button
              label={format(t.issueAll, { n: controller.issuableCount })}
              fullWidth={!theme.tablet}
              loading={controller.issuingAll}
              disabled={controller.issuableCount === 0 || controller.anyBusy || controller.waits.draft.waiting}
              onPress={controller.issueAll}
              testID="draft-issue-all"
            />
          }
          testID="draft-board-app-bar"
        />
      }
      scroll={!theme.tablet}
      scrollRef={scrollRef}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <DraftBoardNotices plan={plan} controller={controller} handout={handout} />

      {theme.tablet ? (
        <Panels testID="draft-board-list">
          <Panel
            weight={3}
            padded={false}
            contentStyle={styles.listPanel}
            header={
              <View style={styles.panelHead}>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {format(dict.planner.groups.membersManager.participants, { n: participants.length })}
                </Text>
                <Text variant="small" color="textMuted" testID="draft-board-kicker">
                  {kicker}
                </Text>
                <Text variant="small" color="textMuted" tabular testID="draft-board-deadline">
                  {facts}
                </Text>
              </View>
            }
            footer={<View style={styles.panelFoot}>{issueHint}</View>}
          >
            {rows}
            {sourceRow ? <View style={styles.sourceInPanel}>{sourceRow}</View> : null}
          </Panel>
          <Panel
            weight={2}
            header={
              panelParticipant ? (
                <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
                  {panelParticipant.studentName}
                </Text>
              ) : undefined
            }
            footer={panelParticipant ? actionsOf(panelParticipant) : undefined}
          >
            {panelParticipant ? detailOf(panelParticipant) : null}
          </Panel>
        </Panels>
      ) : (
        <>
          <View style={styles.section}>
            <View>
              <SectionCaption testID="draft-board-kicker">{kicker}</SectionCaption>
              <Text variant="small" color="textMuted" tabular style={styles.facts} testID="draft-board-deadline">
                {facts}
              </Text>
            </View>
            {single && participants[0] ? (
              // A draft for one student: no list to pick from, the set is right on the page.
              <Card style={styles.singleCard}>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {participants[0].studentName}
                </Text>
                {detailOf(participants[0])}
                {actionsOf(participants[0])}
              </Card>
            ) : (
              <ListCard testID="draft-board-list">{rows}</ListCard>
            )}
          </View>
          {sourceRow ? <ListCard>{sourceRow}</ListCard> : null}
          {issueHint}
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
          footer={sheetParticipant ? actionsOf(sheetParticipant) : undefined}
          testID="draft-participant-sheet"
        >
          {sheetParticipant ? detailOf(sheetParticipant, sheetTop(sheetParticipant)) : null}
        </BottomSheet>
      ) : null}

      <ActionSheet visible={menuOpen} title={m.planner.draftBoard.actions} actions={menuActions} onClose={() => setMenuOpen(false)} testID="draft-board-actions" />

      <DraftAddSheet
        visible={addParticipant !== null}
        studentName={addParticipant?.studentName ?? ''}
        topicTitle={plan.topicTitle}
        topicNumbers={plan.topicNumbers}
        existingIds={addParticipant?.items.map((item) => item.homeworkNumberId) ?? []}
        onClose={() => setAddFor(null)}
        onClosed={() => {
          const id = returnTo.current;
          returnTo.current = null;
          if (id) setOpenId(id);
        }}
        onAdd={(homeworkNumberId) => {
          if (addParticipant) controller.addNumber(addParticipant, homeworkNumberId);
        }}
      />

      <Dialog
        visible={deleting}
        kicker={confirm.kicker}
        title={t.deleteTitle}
        description={t.deleteDescription}
        confirmLabel={confirm.confirm}
        pendingLabel={confirm.pending}
        cancelLabel={confirm.cancel}
        pending={controller.remove.isPending}
        onConfirm={() => controller.remove.mutate(undefined, { onSettled: () => setDeleting(false) })}
        onCancel={() => setDeleting(false)}
        testID="draft-delete-dialog"
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.xs },
  facts: { paddingHorizontal: t.space.xxs },
  hint: { paddingHorizontal: t.space.xxs },
  singleCard: { gap: t.space.md },
  // The rows bring their own padding; the head and the foot of the list panel line up with them.
  panelHead: { gap: t.space.xxs, paddingHorizontal: t.space.card, paddingTop: t.space.card },
  panelFoot: { paddingHorizontal: t.space.card, paddingBottom: t.space.card },
  listPanel: { gap: 0, paddingTop: t.space.xs, paddingBottom: t.space.sm },
  sourceInPanel: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.line },
}));
