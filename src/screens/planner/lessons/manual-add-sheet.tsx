import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, LoadingState, Notice, Select, Text } from '@/ui';

import { availableNumbers } from './board-logic';

export type ManualAddSheetProps = {
  visible: boolean;
  /** Whose set gets the number (shown under the title). */
  studentName: string;
  /** Numbers already in the participant's set: they are not offered. */
  existingIds: readonly string[];
  onClose: () => void;
  onAdd: (homeworkNumberId: string, toExtra: boolean) => void;
};

/** The shared number bank changes rarely: one read serves every board of the session. */
const BANK_STALE_MS = 10 * 60 * 1000;

/**
 * "Add a problem" (`LessonManualAdd`, docs/spec/05-teacher-lessons-plans.md §1.3 item 8): topic → number
 * (only numbers that are not in the set yet) → to the main or to the extra part.
 */
export function ManualAddSheet({ visible, studentName, existingIds, onClose, onAdd }: ManualAddSheetProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonManualAdd;
  const common = dict.planner.common;

  const bank = useQuery({
    queryKey: qk('planner', 'getNumberBank'),
    queryFn: () => api.planner.getNumberBank(),
    enabled: visible,
    staleTime: BANK_STALE_MS,
  });
  const topics = bank.data?.topics;

  const [pickedTopicId, setPickedTopicId] = useState<string | null>(null);
  const [numberId, setNumberId] = useState<string | null>(null);
  // The first topic is the default, as on the site.
  const topicId = pickedTopicId ?? topics?.[0]?.topicId ?? null;
  const topic = topics?.find((entry) => entry.topicId === topicId);
  const free = useMemo(() => availableNumbers(topic, existingIds), [topic, existingIds]);
  const picked = numberId !== null && free.some((number) => number.id === numberId) ? numberId : null;

  const reset = () => {
    setPickedTopicId(null);
    setNumberId(null);
  };
  const add = (toExtra: boolean) => {
    if (!picked) return;
    onAdd(picked, toExtra);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={reset}
      closeLabel={m.common.actions.close}
      title={t.label}
      footer={
        <View style={styles.footer}>
          <Button label={t.toMain} disabled={!picked} onPress={() => add(false)} testID="lesson-add-to-main" style={styles.footerButton} />
          <Button label={t.toExtra} variant="outline" disabled={!picked} onPress={() => add(true)} testID="lesson-add-to-extra" style={styles.footerButton} />
        </View>
      }
      testID="lesson-add-sheet"
    >
      <View style={styles.content}>
        <Text variant="small" color="textMuted">
          {studentName}
        </Text>
        {topics ? (
          <>
            <Select
              label={common.topic}
              options={topics.map((entry) => ({ value: entry.topicId, label: entry.topicTitle }))}
              value={topicId}
              onChange={(next) => {
                setPickedTopicId(next);
                setNumberId(null);
              }}
              placeholder={dict.topics.widgets.selectPlaceholder}
              closeLabel={m.common.actions.close}
              testID="lesson-add-topic"
            />
            <Select
              label={common.number}
              options={free.map((number) => ({ value: number.id, label: format(common.numberSign, { n: number.number }) }))}
              value={picked}
              onChange={setNumberId}
              placeholder={topic ? common.pickNumber : m.planner.lessonBoard.numberPlaceholder}
              closeLabel={m.common.actions.close}
              disabled={free.length === 0}
              helper={
                !topic || free.length > 0
                  ? undefined
                  : // An empty topic is not "all of it already in the set" (the set may well be empty).
                    topic.numbers.length === 0
                    ? m.planner.lessonBoard.noNumbers
                    : m.planner.lessonBoard.noFreeNumbers
              }
              testID="lesson-add-number"
            />
          </>
        ) : bank.isError || bank.fetchStatus === 'paused' ? (
          // A paused read = no connection and no cached bank.
          <Notice
            tone="error"
            text={bank.isError ? errorText(bank.error, m.planner.lessonBoard.bankFailed) : m.common.errors.network}
            action={<Button label={common.retry} size="sm" variant="outline" loading={bank.isFetching} onPress={() => void bank.refetch()} testID="lesson-add-retry" />}
            testID="lesson-add-error"
          />
        ) : (
          <LoadingState variant="spinner" accessibilityLabel={m.planner.lessonBoard.bankLoading} testID="lesson-add-loading" />
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.field },
  footer: { flexDirection: 'row', gap: t.space.md },
  footerButton: { flex: 1 },
}));
