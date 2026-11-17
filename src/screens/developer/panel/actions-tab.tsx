import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { PanelAction } from '@/api/types';
import { RetryWaitLine } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Card, Dialog, Text } from '@/ui';

import { PANEL_ACTION_ROWS, type ActionConfirm, type PanelActionRow } from './logic';
import { ResultLine, type PanelResult } from './result-line';
import { useRetryLock } from './use-retry-lock';

/**
 * Actions tab (07 §1.9): the five service buttons. Under each one a line shows the hint, then «Действие
 * выполняется…», then the action's message in green (`ok`) or red. The panel data is refreshed after
 * every action, as the site refreshes its page.
 */
export function ActionsTab() {
  const styles = useStyles();
  const queryClient = useQueryClient();

  const afterAction = (action: PanelAction) => {
    // «Сбросить кэши платформы» forces fresh data on every page: here that is every cached query.
    if (action === 'flush-caches') void queryClient.invalidateQueries();
    // Stats, chips and budgets; every action also writes a journal row.
    else void queryClient.invalidateQueries({ queryKey: qk('developer') });
  };

  return (
    <Card testID="panel-actions">
      <View style={styles.list}>
        {PANEL_ACTION_ROWS.map((row) => (
          <ActionRow key={row.action} row={row} onSettled={afterAction} />
        ))}
      </View>
    </Card>
  );
}

function ActionRow({ row, onSettled }: { row: PanelActionRow; onSettled: (action: PanelAction) => void }) {
  const styles = useStyles();
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

  const start = () => {
    setConfirming(false);
    run.mutate();
  };
  const confirm = row.confirm ? confirmTexts(row.confirm, m.developer.actions) : null;

  return (
    <View style={styles.row}>
      <Button
        label={run.isPending ? t.running : t.actions[row.label]}
        variant="outline"
        loading={run.isPending}
        disabled={lock.seconds > 0}
        // SPEC-GAP: the site runs all five without asking. On a phone a stray tap is likelier, so the two
        // actions the spec names — reset budget and unfreeze — ask first (07 §1.9 phone mapping, §7 item 12).
        // The other three start on tap, as on the site.
        onPress={confirm ? () => setConfirming(true) : start}
        fullWidth
        // The names are sentences («Разморозить зависшие проверки»): on a narrow phone or with a large OS
        // font they take a second line instead of ending in «…».
        wrapLabel
        testID={`panel-action-${row.action}`}
      />
      <RetryWaitLine seconds={lock.seconds} testID={`panel-action-${row.action}-wait`} />
      {run.isPending || result ? (
        <ResultLine
          pendingText={run.isPending ? t.actionRunning : null}
          result={result}
          testID={`panel-action-${row.action}-result`}
        />
      ) : (
        // Not a hideable hint: the site shows this line whatever the "hints" preference is — it is the
        // only description of what the button does.
        <Text variant="caption">{t.actions[row.hint]}</Text>
      )}
      {confirm ? (
        <Dialog
          visible={confirming}
          kicker={dict.topics.widgets.confirm.kicker}
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
  list: { gap: t.space.lg },
  row: { gap: t.space.xs },
}));
