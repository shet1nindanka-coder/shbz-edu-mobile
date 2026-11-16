import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { hasErrorCode, qk, useApi } from '@/api';
import type { TopicImpact } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Dialog, Notice, Spinner, Text, TextButton } from '@/ui';

import { errorText } from './error-text';
import { loadFailureOf } from './load-failure';

export type DeleteTopicDialogProps = {
  /** The topic to delete; `null` keeps the dialog closed. */
  topic: { id: string; title: string } | null;
  onClose: () => void;
  /** Called after the topic is gone (the caller shows the notice and leaves the topic's screens). */
  onDeleted: (topicId: string) => void;
  testID?: string;
};

function isTopicImpact(value: unknown): value is TopicImpact {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { summary?: unknown; lines?: unknown };
  return typeof candidate.summary === 'object' && candidate.summary !== null && Array.isArray(candidate.lines);
}

/**
 * "Delete topic" confirmation with the real impact (docs/spec/07-developer-content.md §1.8 variant B,
 * §4.4, §7 Q5): every entry point first reads `GET /topics/{id}/impact`, shows what is destroyed and
 * sends the `numbersWithWork` the user saw. A `409 deleteChanged` carries the fresh impact — the dialog
 * stays open with the new numbers.
 */
export function DeleteTopicDialog({ topic, onClose, onDeleted, testID }: DeleteTopicDialogProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m, locale } = useI18n();
  const t = dict.topics.deleteTopic;
  const topicId = topic?.id ?? '';
  const [error, setError] = useState<string | null>(null);
  // The sheet slides away after `topic` is cleared: keep the last title on it meanwhile.
  const [lastTitle, setLastTitle] = useState(topic?.title ?? '');
  if (topic && topic.title !== lastTitle) setLastTitle(topic.title);

  const impact = useQuery({
    queryKey: qk('content', 'getTopicImpact', topicId),
    queryFn: () => api.content.getTopicImpact(topicId),
    enabled: topic !== null,
    // The acknowledgement must match the server's current count: never confirm against a stale impact.
    staleTime: 0,
    gcTime: 0,
  });

  const remove = useMutation({
    mutationFn: (acknowledged: number) => api.content.deleteTopic(topicId, acknowledged),
    onSuccess: () => {
      setError(null);
      // The caller leaves the topic's screens first; then every list that showed the topic refetches.
      onDeleted(topicId);
      void queryClient.invalidateQueries({ queryKey: qk('content') });
    },
    onError: (failure) => {
      if (hasErrorCode(failure, 'deleteChanged') && isTopicImpact(failure.details)) {
        queryClient.setQueryData(qk('content', 'getTopicImpact', topicId), failure.details);
      } else if (hasErrorCode(failure, 'topicNotFound')) {
        void queryClient.invalidateQueries({ queryKey: qk('content') });
      }
      setError(errorText(failure, dict.topics.list.notices.delete));
    },
  });

  const close = () => {
    if (remove.isPending) return;
    setError(null);
    onClose();
  };

  const data = impact.data;
  const summary = data?.summary;
  // Offline the read is parked, not failed: without this the dialog would spin until the connection returns.
  const impactFailure = data ? undefined : loadFailureOf(impact);

  return (
    <Dialog
      visible={topic !== null}
      kicker={dict.topics.widgets.confirm.kicker}
      title={t.title}
      confirmLabel={dict.topics.widgets.confirm.confirm}
      pendingLabel={dict.topics.widgets.confirm.pending}
      cancelLabel={dict.topics.widgets.confirm.cancel}
      pending={remove.isPending}
      confirmDisabled={!summary || impact.isFetching}
      onConfirm={() => {
        if (!summary) return;
        setError(null);
        remove.mutate(summary.numbersWithWork);
      }}
      onCancel={close}
      testID={testID ?? 'delete-topic-dialog'}
    >
      <Text variant="small" color="label" style={styles.paragraph}>
        {t.before}
        <Text variant="smallBold" color="textStrong">
          {format(t.quoted, { title: topic?.title ?? lastTitle })}
        </Text>
        {summary ? format(t.afterWithTotal, { total: summary.totalNumbers }) : t.after}
      </Text>

      {impact.isPending && !impactFailure && topic !== null ? (
        <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={m.content.deleteTopic.loadingImpact}>
          <Spinner />
          <Text variant="small" color="textMuted">
            {m.content.deleteTopic.loadingImpact}
          </Text>
        </View>
      ) : null}

      {impactFailure && topic !== null ? (
        <Notice
          tone="error"
          text={errorText(impactFailure.error, m.content.deleteTopic.impactFailed)}
          action={<TextButton label={m.common.actions.retry} onPress={() => void impact.refetch()} testID="delete-topic-impact-retry" />}
          testID="delete-topic-impact-error"
        />
      ) : null}

      {data && summary ? (
        data.lines.length > 0 ? (
          <View style={styles.impact} testID="delete-topic-impact">
            <Text variant="small" color="label" style={styles.paragraph}>
              {t.workBefore}
              <Text variant="smallBold" color="textStrong">
                {String(summary.numbersWithWork)}
              </Text>
              {plural(locale, summary.numbersWithWork, t.workAfterForms)}
            </Text>
            {data.lines.map((line) => (
              <Text key={line} variant="small" color="label" style={styles.paragraph}>
                {`— ${line}`}
              </Text>
            ))}
          </View>
        ) : (
          <Text variant="small" color="textMuted" style={styles.paragraph} testID="delete-topic-no-work">
            {t.noWork}
          </Text>
        )
      ) : null}

      {error ? <Notice tone="error" text={error} testID="delete-topic-error" /> : null}
    </Dialog>
  );
}

const useStyles = makeStyles((t) => ({
  paragraph: { lineHeight: 22 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minHeight: t.sizes.minTouch },
  impact: { gap: t.space.xxs },
}));
