import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import { loadFailureOf } from '@/components/load-failure';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, LoadingState, Notice, Select } from '@/ui';

import { bankNumbersGap, freeBankNumbers } from './lessons-logic';

export type LessonAddSheetProps = {
  visible: boolean;
  /** Numbers already in the set: they are not offered. */
  existingIds: readonly string[];
  onClose: () => void;
  onAdd: (homeworkNumberId: string, toExtra: boolean) => void;
};

/** The shared number bank changes rarely: one read serves every sheet of the session. */
const BANK_STALE_MS = 10 * 60 * 1000;

/**
 * "Add a problem" of the lessons segment (`LessonManualAdd`, docs/spec/04-teacher-students.md S6): topic
 * → number (only the topic's numbers that are not in the set yet) → to the main or to the extra part. The
 * two selects are named by what they hold (a topic's title, «Выберите номер»), without captions.
 */
export function LessonAddSheet({ visible, existingIds, onClose, onAdd }: LessonAddSheetProps) {
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
  const bankFailure = loadFailureOf(bank);

  const [pickedTopicId, setPickedTopicId] = useState<string | null>(null);
  const [numberId, setNumberId] = useState<string | null>(null);
  // The first topic is the default, as on the site; changing the topic resets the number. It is pinned as
  // soon as the bank arrives, so a refetch that reorders the topics does not switch the topic (and drop the
  // picked number) under the teacher; the first topic takes over only when the pinned one is gone, and is
  // pinned in its turn (#413). Only while the sheet is open: closing resets the pin to null.
  const topic = topics?.find((entry) => entry.topicId === pickedTopicId) ?? topics?.[0];
  if (visible && topic && topic.topicId !== pickedTopicId) setPickedTopicId(topic.topicId);
  const topicId = topic?.topicId ?? null;
  const free = useMemo(() => freeBankNumbers(topic, existingIds), [topic, existingIds]);
  const gap = bankNumbersGap(topic, free.length);
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
          <Button label={t.toMain} size="lg" disabled={!picked} onPress={() => add(false)} testID="student-lesson-add-main" style={styles.footerButton} />
          <Button label={t.toExtra} size="lg" variant="outline" disabled={!picked} onPress={() => add(true)} testID="student-lesson-add-extra" style={styles.footerButton} />
        </View>
      }
      testID="student-lesson-add-sheet"
    >
      <View style={styles.content}>
        {topics ? (
          <>
            <Select
              accessibilityLabel={common.topic}
              sheetTitle={common.topic}
              options={topics.map((entry) => ({ value: entry.topicId, label: entry.topicTitle }))}
              value={topicId}
              onChange={(next) => {
                setPickedTopicId(next);
                setNumberId(null);
              }}
              placeholder={dict.topics.widgets.selectPlaceholder}
              closeLabel={m.common.actions.close}
              testID="student-lesson-add-topic"
            />
            <Select
              accessibilityLabel={common.number}
              sheetTitle={common.number}
              options={free.map((number) => ({ value: number.id, label: format(common.numberSign, { n: number.number }) }))}
              value={picked}
              onChange={setNumberId}
              placeholder={topic ? common.pickNumber : m.teacher.lessons.pickTopicFirst}
              closeLabel={m.common.actions.close}
              disabled={free.length === 0}
              helper={gap === 'topicEmpty' ? m.teacher.assign.noNumbers : gap === 'allInSet' ? m.teacher.lessons.noFreeNumbers : undefined}
              testID="student-lesson-add-number"
            />
          </>
        ) : bankFailure ? (
          <Notice
            tone="error"
            text={errorText(bankFailure.error, m.teacher.lessons.bankFailed)}
            action={
              <Button label={m.common.actions.retry} size="sm" variant="outline" loading={bank.isFetching} onPress={() => void bank.refetch()} testID="student-lesson-add-retry" />
            }
            testID="student-lesson-add-error"
          />
        ) : (
          <LoadingState variant="spinner" accessibilityLabel={m.teacher.lessons.bankLoading} testID="student-lesson-add-loading" />
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
