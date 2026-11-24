import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { TopicListItem } from '@/api/types';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, IconButton, Notice, Text } from '@/ui';

import { applyOrder, isSameOrder, moveInOrder, reconcileOrder } from './topic-order';

export type ReorderSheetProps = {
  visible: boolean;
  /** The list as the server has it. */
  topics: readonly TopicListItem[];
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Topic order (docs/spec/07-developer-content.md §1.1, §3.5, §7 Q9) — DEVELOPER only. The site's HTML5
 * drag & drop does not exist on touch, so the order is arranged with up / down buttons and saved once:
 * the full id list goes to `PUT /topics/order`, applied optimistically and rolled back to the server
 * order on any failure.
 */
export function ReorderSheet({ visible, topics, onClose, onSaved }: ReorderSheetProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const serverOrder = topics.map((topic) => topic.id);
  const [draft, setDraft] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wait = useRetryWait();
  // The user's arrangement follows the server list: deleted topics drop out, new ones are appended.
  const order = draft === null ? serverOrder : reconcileOrder(draft, serverOrder);
  const titles = new Map(topics.map((topic) => [topic.id, topic.title]));
  const changed = !isSameOrder(order, serverOrder);
  const listKey = qk('content', 'listTopics');

  const save = useMutation({
    mutationFn: (ids: string[]) => api.content.reorderTopics(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const before = queryClient.getQueryData<TopicListItem[]>(listKey);
      if (before) queryClient.setQueryData<TopicListItem[]>(listKey, applyOrder(before, ids));
      return { before };
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: qk('content') });
      onSaved();
    },
    onError: (failure, _ids, context) => {
      if (context?.before) queryClient.setQueryData(listKey, context.before);
      wait.note(failure);
      // The set of topics changed under the user: drop the arrangement and show the fresh list.
      if (hasErrorCode(failure, 'listChanged')) setDraft(null);
      void queryClient.invalidateQueries({ queryKey: listKey });
      setError(errorText(failure, dict.topics.reorder.saveFailed));
    },
  });

  const close = () => {
    if (save.isPending) return;
    setDraft(null);
    setError(null);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      closeLabel={m.common.actions.close}
      title={m.content.reorder.title}
      dismissible={!save.isPending}
      footer={
        <View style={styles.footer}>
          {error ? <Notice tone="error" text={error} testID="reorder-error" /> : null}
          <RetryWaitLine seconds={wait.seconds} testID="reorder-wait" />
          <Button
            label={save.isPending ? m.common.states.saving : dict.common.save}
            loading={save.isPending}
            disabled={!changed || wait.waiting}
            onPress={() => {
              setError(null);
              save.mutate([...order]);
            }}
            testID="reorder-save"
          />
        </View>
      }
      testID="reorder-sheet"
    >
      <View style={styles.root}>
        {order.map((id, index) => {
          const title = titles.get(id) ?? '';
          return (
            <View key={id} style={styles.row} testID={`reorder-row-${id}`}>
              <Text variant="small" color="textMuted" tabular style={styles.position}>
                {String(index + 1)}
              </Text>
              <Text variant="bodyStrong" numberOfLines={2} style={styles.title}>
                {title}
              </Text>
              <IconButton
                icon="arrowUp"
                accessibilityLabel={format(m.content.reorder.moveUp, { title })}
                disabled={index === 0 || save.isPending}
                onPress={() => setDraft(moveInOrder(order, id, 'up'))}
                testID={`reorder-up-${id}`}
              />
              <IconButton
                icon="arrowDown"
                accessibilityLabel={format(m.content.reorder.moveDown, { title })}
                disabled={index === order.length - 1 || save.isPending}
                onPress={() => setDraft(moveInOrder(order, id, 'down'))}
                testID={`reorder-down-${id}`}
              />
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    minHeight: t.sizes.row,
    paddingVertical: t.space.xs,
    borderBottomWidth: t.borders.hairline,
    borderBottomColor: t.colors.rowBorder,
  },
  position: { width: t.sizes.icon.lg, textAlign: 'center' },
  title: { flex: 1, minWidth: 0 },
  footer: { gap: t.space.sm },
}));
