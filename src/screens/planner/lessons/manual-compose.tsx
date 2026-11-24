import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { ComposeBoardTopic } from '@/api/types';
import { META_LIMITS } from '@/api/types/limits';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { mskToday } from '@/domain/moscow-time';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, DateTimeField, EmptyState, IconButton, Notice, Screen, Select, Spinner, accessibilityLabelOf } from '@/ui';

import { useDateTimeLabels } from '@/components/date-time';
import { DurationStepper } from './duration-stepper';
import { buildManualLessonInput, composeStatement, toggleId, type ComposeNumber } from './new-lesson-logic';
import { NumberSelectCard } from './number-select-card';
import { useCreateLesson } from './use-create-lesson';

export type ManualComposeProps = {
  studentId: string;
  topics: readonly ComposeBoardTopic[];
  /** Builds the header of the screen. */
  header: (aside?: ReactNode) => ReactNode;
  /** Banners shown above the grid. */
  top?: ReactNode;
};

/**
 * Manual composition of an individual lesson (`TeacherLessonComposeBoard`,
 * docs/spec/05-teacher-lessons-plans.md §1.2.e): numbers of one topic are ticked in the order they will
 * have in the lesson; duration, start and the one main button — «Составить · 3», the count of ticked
 * numbers on it, with a cross that clears the ticks next to it — stay in the bottom bar. A tablet lays the
 * numbers out in two columns.
 */
export function ManualCompose({ studentId, topics, header, top }: ManualComposeProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.lessonCompose;
  const dateTimeLabels = useDateTimeLabels();

  const [topicId, setTopicId] = useState<string | null>(topics[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<number>(META_LIMITS.lessonDurationMinutes.default);
  const [startsAt, setStartsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateLesson();
  const wait = useRetryWait();
  const topic = topics.find((entry) => entry.id === topicId) ?? null;

  // Statements arrive with the first topic only; the others are read once, when the topic is chosen.
  // A failed read is not an error state: the numbers stay selectable without their statements.
  const needsStatements = topic !== null && !topic.conditionsLoaded;
  const statements = useQuery({
    queryKey: qk('content', 'getTopicConditions', topic?.id ?? ''),
    queryFn: () => api.content.getTopicConditions(topic?.id ?? ''),
    enabled: needsStatements,
    // The default staleness: a statement edited on the site meanwhile (or a cache restored after a cold
    // start) is read again instead of being trusted forever.
    retry: false,
  });

  // The topic's name only: how many numbers it has is the list under the select.
  const topicOptions = useMemo(() => topics.map((entry) => ({ value: entry.id, label: entry.title })), [topics]);

  const submit = () => {
    if (selectedIds.length === 0) {
      setError(t.pickNumbers);
      return;
    }
    setError(null);
    create.mutate(buildManualLessonInput({ studentId, durationMinutes, startsAt, numberIds: selectedIds }), {
      onError: (failure) => {
        wait.note(failure);
        setError(errorText(failure, t.composeFailed));
      },
    });
  };

  const listHeader = (
    <View style={styles.header}>
      {top}
      <Card style={styles.topicCard}>
        <Select
          accessibilityLabel={dict.planner.common.topic}
          sheetTitle={dict.planner.common.topic}
          options={topicOptions}
          value={topicId}
          onChange={(next) => {
            setTopicId(next);
            // A manually composed lesson starts with the numbers of one topic; more are added on the board.
            setSelectedIds([]);
            setError(null);
          }}
          placeholder={dict.planner.common.topic}
          closeLabel={m.common.actions.close}
          testID="lesson-compose-topic"
        />
        {needsStatements && statements.isFetching ? (
          <View accessible accessibilityRole="progressbar" accessibilityLabel={m.planner.lessonNew.statementsLoading} style={styles.loading}>
            <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
          </View>
        ) : null}
      </Card>
    </View>
  );

  const renderNumber = ({ item }: { item: ComposeNumber }) => (
    <View style={styles.item}>
      <NumberSelectCard
        number={item.number}
        status={item.status}
        selected={selectedIds.includes(item.id)}
        conditionLatex={topic ? composeStatement(topic, item, statements.data) : null}
        footnote={item.inLesson ? t.alreadyInLesson : undefined}
        onToggle={() => {
          setSelectedIds((current) => toggleId(current, item.id));
          setError(null);
        }}
        testID={`lesson-compose-number-${item.number}`}
      />
    </View>
  );

  const columns = theme.tablet ? 2 : 1;

  return (
    <Screen
      testID="lesson-new-manual"
      header={header()}
      scroll={false}
      padded={false}
      maxWidth="full"
      footer={
        <View style={styles.footer}>
          {error ? <Notice tone="error" text={error} onDismiss={() => setError(null)} dismissLabel={m.common.actions.close} testID="lesson-compose-error" /> : null}
          <RetryWaitLine seconds={wait.seconds} />
          <View style={styles.footerRows}>
            <View style={styles.footerRow}>
              <DurationStepper value={durationMinutes} onChange={setDurationMinutes} accessibilityLabel={t.durationAria} testID="lesson-compose-duration" />
              <DateTimeField
                variant="compact"
                value={startsAt}
                onChange={setStartsAt}
                today={mskToday()}
                // The compact trigger shares its row with the stepper: «Lesson date and time» does not fit
                // there at 390 pt, so the trigger shows the short site label — with the zone, said where a
                // time is entered — and is announced by the full one.
                placeholder={`${dict.planner.homeworkPlans.createForm.dateTimePlaceholder}, ${m.common.dateTime.msk}`}
                accessibilityLabel={`${t.dateTimePlaceholder}, ${m.common.dateTime.msk}`}
                labels={dateTimeLabels}
                locale={locale}
                testID="lesson-compose-starts-at"
                style={styles.footerDate}
              />
            </View>
            <View style={styles.footerRow}>
              {selectedIds.length > 0 ? (
                <IconButton icon="close" accessibilityLabel={t.clearSelection} onPress={() => setSelectedIds([])} testID="lesson-compose-clear" />
              ) : null}
              <Button
                // How many numbers the lesson will have is on its button.
                label={
                  create.isPending
                    ? t.composing
                    : selectedIds.length > 0
                      ? format(m.planner.lessonNew.composeCount, { n: selectedIds.length })
                      : m.planner.lessonsList.compose
                }
                accessibilityLabel={create.isPending ? t.composing : accessibilityLabelOf([t.compose, format(t.selected, { n: selectedIds.length })])}
                loading={create.isPending}
                disabled={selectedIds.length === 0 || wait.waiting}
                onPress={submit}
                testID="lesson-compose-submit"
                style={styles.footerSubmit}
              />
            </View>
          </View>
        </View>
      }
    >
      <FlashList
        // A new column count is a new layout: remount instead of reflowing the recycled cells.
        key={columns}
        data={topic?.numbers ?? []}
        numColumns={columns}
        keyExtractor={(number) => number.id}
        renderItem={renderNumber}
        // Selection and lazily loaded statements live outside the rows.
        extraData={[selectedIds, statements.data, topic?.id]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyState title={dict.topics.viewNumbers.emptyTitle} testID="lesson-compose-empty" />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="lesson-compose-list"
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // Half of the gap between two columns sits on each side of a cell, so the list is inset by the rest.
  listContent: { paddingHorizontal: t.space.gutter - t.space.xxs, paddingBottom: t.space.lg },
  header: { gap: t.space.block, paddingBottom: t.space.block, paddingHorizontal: t.space.xxs },
  topicCard: { gap: t.space.md },
  loading: { alignSelf: 'flex-start' },
  item: { flex: 1, paddingBottom: t.space.block, paddingHorizontal: t.space.xxs },
  footer: { gap: t.space.xs },
  // Phone: the controls in two rows; tablet: all four in one.
  footerRows: t.tablet ? { flexDirection: 'row', alignItems: 'center', gap: t.space.lg } : { gap: t.space.xs },
  footerRow: { flex: t.tablet ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  footerDate: { flex: 1, minWidth: 0 },
  footerSubmit: { flex: 1 },
}));
