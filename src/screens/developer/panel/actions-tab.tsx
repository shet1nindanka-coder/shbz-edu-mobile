import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { PanelAction } from '@/api/types';
import { RetryWaitLine } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Chip, Dialog, Icon, ListCard, ListRow, Panel, Panels, Spinner, useStatusAnnouncement } from '@/ui';

import { BudgetsBlock } from './budgets-block';
import { PANEL_ACTION_ROWS, type ActionConfirm, type BudgetRow, type PanelActionRow } from './logic';
import type { PanelResult } from './result-line';
import { useRetryLock } from './use-retry-lock';

/**
 * Actions tab (07 §1.9; layout: docs/design/glass-over-paper.md §7): the five service actions as rows of
 * one card — the name, and one caption that is the hint, then «Действие выполняется…», then the action's
 * message (red when it failed). The whole row runs the action. The panel data is refreshed after every
 * action, as the site refreshes its page. A tablet shows the AI budgets next to the list: two of the
 * actions change them.
 */
export function ActionsTab({ budgets }: { budgets: readonly BudgetRow[] }) {
  const styles = useStyles();
  const theme = useTheme();
  const queryClient = useQueryClient();

  const afterAction = (action: PanelAction) => {
    // «Сбросить кэши платформы» forces fresh data on every page: here that is every cached query.
    if (action === 'flush-caches') void queryClient.invalidateQueries();
    // Stats, figures and budgets; every action also writes a journal row.
    else void queryClient.invalidateQueries({ queryKey: qk('developer') });
  };

  const rows = PANEL_ACTION_ROWS.map((row, index) => (
    <ActionRow key={row.action} row={row} divider={index < PANEL_ACTION_ROWS.length - 1} onSettled={afterAction} />
  ));

  if (theme.tablet) {
    return (
      <Panels testID="panel-actions">
        <Panel weight={3} padded={false} contentStyle={styles.rows}>
          {rows}
        </Panel>
        {budgets.length > 0 ? (
          <Panel weight={2}>
            <BudgetsBlock budgets={budgets} />
          </Panel>
        ) : null}
      </Panels>
    );
  }
  return <ListCard testID="panel-actions">{rows}</ListCard>;
}

function ActionRow({ row, divider, onSettled }: { row: PanelActionRow; divider: boolean; onSettled: (action: PanelAction) => void }) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel;
  const [result, setResult] = useState<PanelResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const lock = useRetryLock();

  const run = useMutation({
    mutationFn: () => api.developer.runAction(row.action),
    // `ok: false` is a normal answer here (a failed ping, AI switched off): it is shown, not thrown.
    onSuccess: (answer) => {
      setResult({ ok: answer.ok, message: answer.message });
      lock.lockFor(null);
    },
    onError: (error) => {
      setResult({ ok: false, message: errorText(error, m.common.errors.generic) });
      lock.lockFor(error);
    },
    onSettled: () => onSettled(row.action),
  });
  // The outcome replaces the caption without moving the focus: it is spoken on both platforms.
  useStatusAnnouncement(run.isPending ? null : result?.message);

  const start = () => {
    setConfirming(false);
    run.mutate();
  };
  const confirm = row.confirm ? confirmTexts(row.confirm, m.developer.actions) : null;
  const title = t.actions[row.label];
  // Not a hideable hint: the site shows this line whatever the "hints" preference is — it is the only
  // description of what the action does.
  const caption = run.isPending ? t.actionRunning : (result?.message ?? t.actions[row.hint]);
  const failed = !run.isPending && result !== null && !result.ok;

  return (
    <View style={[styles.block, divider ? styles.divider : null]}>
      <ListRow
        // The block brings the card's side padding, so its hairline and the wait line share it.
        inset={0}
        title={title}
        // The names are sentences («Разморозить зависшие проверки»): they wrap instead of ending in «…».
        titleLines={2}
        subtitle={caption}
        subtitleLines={4}
        subtitleTone={failed ? 'attention' : 'muted'}
        right={
          run.isPending ? (
            <Spinner />
          ) : failed ? (
            <Chip label={dict.planner.common.error} tone="red" />
          ) : result ? (
            <Icon name="check" size={theme.sizes.icon.md} color="textMuted" />
          ) : undefined
        }
        divider={false}
        disabled={run.isPending || lock.seconds > 0}
        accessibilityLabel={`${title}. ${caption}`}
        // SPEC-GAP: the site runs all five without asking. On a phone a stray tap is likelier, so the two
        // actions the spec names — reset budget and unfreeze — ask first (07 §1.9 phone mapping, §7 item 12).
        // The other three start on tap, as on the site.
        onPress={confirm ? () => setConfirming(true) : start}
        testID={`panel-action-${row.action}`}
      />
      <RetryWaitLine seconds={lock.seconds} style={styles.wait} testID={`panel-action-${row.action}-wait`} />
      {confirm ? (
        <Dialog
          visible={confirming}
          title={confirm.title}
          description={confirm.body}
          confirmLabel={m.developer.actions.run}
          cancelLabel={m.common.actions.cancel}
          onConfirm={start}
          onCancel={() => setConfirming(false)}
          testID={`panel-action-${row.action}-confirm`}
        />
      ) : null}
    </View>
  );
}

type ActionTexts = ReturnType<typeof useI18n>['m']['developer']['actions'];

function confirmTexts(kind: ActionConfirm, t: ActionTexts): { title: string; body: string } {
  switch (kind) {
    case 'resetBudget':
      return { title: t.resetBudgetTitle, body: t.resetBudgetBody };
    case 'unfreeze':
      return { title: t.unfreezeTitle, body: t.unfreezeBody };
  }
}

const useStyles = makeStyles((t) => ({
  block: { marginHorizontal: t.space.card },
  // The hairline sits under the whole block, the wait line included.
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  wait: { paddingBottom: t.space.sm },
  // The tablet panel: rows follow each other without the panel's gap, with the padding of a list card.
  rows: { gap: 0, paddingVertical: t.space.sm },
}));
