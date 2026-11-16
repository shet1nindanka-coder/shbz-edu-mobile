import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import type { HomeworkPlanParticipant } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { Hint } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { Button, Dialog, ErrorState, IconButton, LoadingState, Screen, Text } from '@/ui';

import { DraftAddSheet } from './drafts/draft-add-sheet';
import { DraftBoardHeader } from './drafts/draft-board-header';
import { DraftParticipantCard } from './drafts/draft-participant-card';
import { draftCreatedAt } from './drafts/drafts-logic';
import { useDraftBoard } from './drafts/use-draft-board';
import { ActionSheet, type SheetAction } from './shared/action-sheet';
import { errorText } from './shared/error-text';
import { planRequestedAtOf } from './shared/plan-anchors';
import { planStateOf } from './shared/plan-state';
import { isWaitingForNetwork } from './shared/query-state';
import { useHandout } from './shared/use-handout';

/** Route params of `planner.draftBoard` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerDraftBoardScreenProps = ScreenParams['planner.draftBoard'];

/**
 * `planner.draftBoard` (docs/spec/05-teacher-lessons-plans.md §1.7): the set the AI selected for every
 * student of a homework draft — edit it, rebuild it, and assign the homework to one student or to all.
 * «Выдать всем» is the sticky primary action; the answer sheet and "delete" sit behind "⋯" in the app bar.
 */
export function PlannerDraftBoardScreen({ planId }: PlannerDraftBoardScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const confirm = dict.topics.widgets.confirm;

  const controller = useDraftBoard(planId);
  const { data: plan, board, now } = controller;
  const handout = useHandout();

  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // A group opens collapsed (a card per student, the chips tell its state); a single student opens expanded.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [addFor, setAddFor] = useState<string | null>(null);

  // The answer to an action is shown at the top of the board; the card that caused it may be far below.
  const listRef = useRef<FlashListRef<HomeworkPlanParticipant>>(null);
  const { notice, issueFailures } = controller;
  useEffect(() => {
    if (notice || issueFailures.length > 0) listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [notice, issueFailures]);

  if (controller.notFound) return <NotFoundScreen description={errorText(board.error, dict.shells.notFoundDescription)} />;

  if (!plan) {
    return (
      <Screen testID="planner-draft-board-screen" header={<DetailAppBar title={dict.planner.homeworkPlans.new.kicker} />}>
        {board.isError || isWaitingForNetwork(board) ? (
          <ErrorState
            title={dict.shells.errorTitle}
            description={board.isError ? errorText(board.error, dict.shells.errorDescription) : m.common.errors.network}
            retryLabel={dict.common.retry}
            onRetry={() => void board.refetch()}
            retrying={board.isFetching}
            testID="draft-board-error"
          />
        ) : (
          <LoadingState variant="cards" count={3} cardHeight={120} accessibilityLabel={m.common.a11y.loading} testID="draft-board-loading" />
        )}
      </Screen>
    );
  }

  const single = plan.participants.length === 1;
  const isExpanded = (participantId: string) => toggled[participantId] ?? single;
  const addParticipant = plan.participants.find((participant) => participant.id === addFor) ?? null;
  const sourceLesson = plan.sourceLesson;
  const sourceLink = sourceLesson ? ({ screen: 'planner.lessonBoard', lessonId: sourceLesson.id } as const) : null;

  const refresh = () => {
    setRefreshing(true);
    void board.refetch().finally(() => setRefreshing(false));
  };

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

  const renderParticipant = ({ item: participant }: { item: HomeworkPlanParticipant }) => {
    const studentLink = { screen: 'teacher.student.review', studentId: participant.studentId } as const;
    return (
      <View style={styles.item}>
        <DraftParticipantCard
          participant={participant}
          planState={planStateOf(participant, now, planRequestedAtOf(participant.id))}
          aiAvailable={plan.aiAvailable}
          expanded={isExpanded(participant.id)}
          busy={controller.busy[participant.id]}
          issuingAll={controller.issuingAll}
          planBlocked={controller.waits.plan.waiting}
          itemsBlocked={controller.waits.items.waiting}
          issueBlocked={controller.waits.draft.waiting}
          canOpenStudent={navigation.canOpen(studentLink)}
          onToggle={() => setToggled((current) => ({ ...current, [participant.id]: !(current[participant.id] ?? single) }))}
          onRegenerate={() => controller.regenerate(participant.id)}
          onIssue={() => controller.issueOne(participant.id)}
          onAdd={() => setAddFor(participant.id)}
          onRemove={(target) => controller.removeItem(participant, target)}
          onOpenStudent={() => navigation.open(studentLink)}
        />
      </View>
    );
  };

  return (
    <Screen
      testID="planner-draft-board-screen"
      header={
        <DetailAppBar
          // The bar has one line; the draft's own title (often a long auto title) opens the board below.
          title={dict.planner.homeworkPlans.new.kicker}
          subtitle={plan.group ? `${plan.topicTitle} · ${plan.group.name}` : plan.topicTitle}
          right={<IconButton icon="more" accessibilityLabel={m.planner.draftBoard.actions} onPress={() => setMenuOpen(true)} testID="draft-board-menu" />}
          testID="draft-board-app-bar"
        />
      }
      scroll={false}
      padded={false}
      footer={
        <View style={styles.footer}>
          <Button
            label={format(t.issueAll, { n: controller.issuableCount })}
            size="lg"
            fullWidth
            loading={controller.issuingAll}
            disabled={controller.issuableCount === 0 || controller.anyBusy || controller.waits.draft.waiting}
            onPress={controller.issueAll}
            testID="draft-issue-all"
          />
          <Hint>
            <Text variant="caption" color="textMuted" align="center">
              {m.planner.draftBoard.issueHint}
            </Text>
          </Hint>
        </View>
      }
    >
      <FlashList
        ref={listRef}
        data={plan.participants}
        keyExtractor={(participant) => participant.id}
        renderItem={renderParticipant}
        // Everything a card shows besides its participant: the clock, expansion and the request states.
        extraData={[now, toggled, controller.busy, controller.issuingAll, controller.waits, plan.aiAvailable]}
        ListHeaderComponent={
          <DraftBoardHeader
            plan={plan}
            controller={controller}
            handout={handout}
            onOpenSourceLesson={sourceLink && navigation.canOpen(sourceLink) ? () => navigation.open(sourceLink) : undefined}
          />
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
        testID="draft-board-list"
      />

      <ActionSheet visible={menuOpen} title={m.planner.draftBoard.actions} actions={menuActions} onClose={() => setMenuOpen(false)} testID="draft-board-actions" />

      <DraftAddSheet
        visible={addParticipant !== null}
        studentName={addParticipant?.studentName ?? ''}
        topicTitle={plan.topicTitle}
        topicNumbers={plan.topicNumbers}
        existingIds={addParticipant?.items.map((item) => item.homeworkNumberId) ?? []}
        onClose={() => setAddFor(null)}
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
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  item: { paddingBottom: t.space.lg },
  footer: { gap: t.space.xs },
}));
