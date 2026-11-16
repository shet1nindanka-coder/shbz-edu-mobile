import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { hasErrorCode, qk, useApi } from '@/api';
import type { IssueHomeworkRequest } from '@/api/types';
import { mskToday } from '@/domain/moscow-time';
import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import {
  BottomSheet,
  Button,
  Chip,
  DateTimeField,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  Select,
  Text,
  TextButton,
  TextField,
} from '@/ui';

import { useRefetchOnFocus } from '../home/use-refetch-on-focus';
import { errorText } from '../students/error-text';
import { RateLimitLine } from '../students/rate-limit-line';
import {
  ASSIGN_TITLE_MAX,
  buildIssueRequest,
  canAssign,
  liveSelection,
  pickTopic,
  toggleSelection,
  withConditions,
  type AssignNumber,
} from './assign-logic';
import { AssignNumberCard } from './assign-number-card';
import { CardScreen, type CardChrome } from './card-screen';
import { invalidateStudentData } from './invalidate';
import { useDateTimeLabels } from './use-date-time-labels';
import { useRetryWait } from './use-retry-wait';
import { useStudentGone } from './use-student-gone';

export type AssignTabProps = { studentId: string; chrome: CardChrome };

type ListNotice = { tone: 'success' | 'error'; text: string };

const NO_NUMBERS: readonly AssignNumber[] = [];

/**
 * `teacher.student.assign` (docs/spec/04-teacher-students.md S5): one homework = numbers of one topic +
 * a deadline + an optional title. The topic is picked in a sheet, the numbers are a list of selectable
 * cards with their statements, and "selected · deadline · assign" stay in a bar under the list.
 */
export function AssignTab({ studentId, chrome }: AssignTabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const t = dict.students.assign;
  const dateTimeLabels = useDateTimeLabels();
  const listRef = useRef<FlashListRef<AssignNumber>>(null);

  const board = useQuery({
    queryKey: qk('teacherStudents', 'getAssignBoard', studentId),
    queryFn: () => api.teacherStudents.getAssignBoard(studentId),
  });
  useStudentGone(studentId, board.error);
  useRefetchOnFocus([board]);

  const [topicId, setTopicId] = useState<string | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [title, setTitle] = useState('');
  const [titleOpen, setTitleOpen] = useState(false);
  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Issue and cancel share one bucket: 120 / 60 s.
  const wait = useRetryWait();

  const data = board.data;
  const enabled = data?.deadlinesEnabled ?? false;
  const topics = data?.topics;
  const topic = topics && enabled ? pickTopic(topics, topicId) : null;

  // Statements come with the first topic only; any other topic fetches its own once (04 S5 "Data").
  // The board works without them when the read fails.
  const needsConditions = topic !== null && !topic.conditionsLoaded;
  const conditions = useQuery({
    queryKey: qk('content', 'getTopicConditions', topic?.id ?? ''),
    queryFn: () => api.content.getTopicConditions(topic?.id ?? ''),
    enabled: needsConditions,
    staleTime: Infinity,
  });
  const numbers = topic ? withConditions(topic, conditions.data) : NO_NUMBERS;
  const picked = liveSelection(topic, selected);

  const announce = (next: ListNotice) => {
    setNotice(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const issue = useMutation({
    mutationFn: (request: IssueHomeworkRequest) => api.teacherStudents.issueHomework(request),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      setSelected([]);
      setDeadline('');
      setTitle('');
      announce({ tone: 'success', text: t.assigned });
      invalidateStudentData(queryClient);
    },
    onError: (error) => {
      // invalidData, studentOrNumberNotFound, solvedConflict (the message names the solved numbers),
      // migrationMissing, rateLimited, no connection: the selection, the deadline and the title are kept.
      wait.note(error);
      announce({ tone: 'error', text: errorText(error, t.assignFailed) });
      // A number that is gone, or one the student solved meanwhile: show the board as it is now.
      if (hasErrorCode(error, 'studentOrNumberNotFound', 'solvedConflict')) invalidateStudentData(queryClient);
    },
  });

  const submit = () => {
    const request = topic ? buildIssueRequest({ studentId, topicId: topic.id, selected: picked, deadline, title }) : null;
    if (!request) {
      announce({ tone: 'error', text: t.selectNumbersAndDeadline });
      return;
    }
    issue.mutate(request);
  };

  const changeTopic = (next: string) => {
    if (next === topic?.id) return;
    setTopicId(next);
    // Changing the topic clears the selection and both banners.
    setSelected([]);
    setNotice(null);
  };

  const refresh = () => {
    setRefreshing(true);
    void board.refetch().finally(() => setRefreshing(false));
  };

  const header = (
    <View style={styles.header}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {t.title}
      </Text>
      {notice ? (
        <View style={styles.noticeBlock}>
          <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="assign-notice" />
          {notice.tone === 'error' ? <RateLimitLine seconds={wait.seconds} testID="assign-wait" /> : null}
        </View>
      ) : null}
      {board.isError && data ? <Notice tone="error" text={errorText(board.error, m.common.errors.generic)} testID="assign-refresh-error" /> : null}
      {data && !data.deadlinesEnabled ? <Notice tone="warning" text={t.dbOutdated} testID="assign-db-outdated" /> : null}
      {topic && topics ? (
        <>
          <Select
            label={t.topic}
            options={topics.map((entry) => ({
              value: entry.id,
              label: format(t.topicOption, { title: entry.title, count: plural(locale, entry.totalNumbers, t.numberForms) }),
            }))}
            value={topic.id}
            onChange={changeTopic}
            placeholder={dict.topics.widgets.selectPlaceholder}
            closeLabel={m.common.actions.close}
            disabled={issue.isPending}
            testID="assign-topic"
          />
          <View style={styles.links}>
            <TextButton label={t.pickWithAi} onPress={() => navigation.open({ screen: 'planner.draftNew', studentId })} testID="assign-pick-ai" />
            {picked.length > 0 ? (
              <TextButton label={t.clearSelection} tone="danger" disabled={issue.isPending} onPress={() => setSelected([])} testID="assign-clear" />
            ) : null}
          </View>
          <Hint>
            <Text variant="caption" color="textMuted">
              {`${m.teacher.assign.steps} ${m.common.dateTime.moscowTime}.`}
            </Text>
          </Hint>
          {needsConditions && conditions.isError ? (
            <Notice
              tone="warning"
              text={m.teacher.assign.conditionsFailed}
              action={
                <Button
                  label={m.common.actions.retry}
                  size="sm"
                  variant="outline"
                  loading={conditions.isFetching}
                  onPress={() => void conditions.refetch()}
                  testID="assign-conditions-retry"
                />
              }
              testID="assign-conditions-error"
            />
          ) : null}
        </>
      ) : null}
    </View>
  );

  const body = data ? (
    !data.deadlinesEnabled ? null : topic ? (
      <Text variant="small" color="textMuted" testID="assign-no-numbers">
        {m.teacher.assign.noNumbers}
      </Text>
    ) : (
      <EmptyState title={t.noTopics} testID="assign-no-topics" />
    )
  ) : board.isError ? (
    <ErrorState
      title={dict.shells.errorTitle}
      description={errorText(board.error, dict.shells.errorDescription)}
      retryLabel={dict.common.retry}
      onRetry={() => void board.refetch()}
      retrying={board.isFetching}
      testID="assign-error"
    />
  ) : (
    <LoadingState variant="cards" count={4} cardHeight={120} accessibilityLabel={m.common.a11y.loading} testID="assign-loading" />
  );

  const footer = topic ? (
    <View style={styles.bar} testID="assign-bar">
      <View style={styles.barRow}>
        <Chip size="row" tone={picked.length > 0 ? 'green' : 'muted'} label={format(t.selected, { n: picked.length })} />
        <DateTimeField
          value={deadline}
          today={mskToday()}
          onChange={setDeadline}
          placeholder={t.deadlinePlaceholder}
          labels={dateTimeLabels}
          locale={locale}
          accessibilityLabel={t.deadlinePlaceholder}
          disabled={issue.isPending}
          testID="assign-deadline"
          style={styles.grow}
        />
      </View>
      <View style={styles.barRow}>
        <Button
          label={title.trim() || m.teacher.assign.titleAction}
          accessibilityLabel={m.teacher.assign.titleSheet}
          variant="outline"
          size="lg"
          leftIcon="edit"
          disabled={issue.isPending}
          onPress={() => setTitleOpen(true)}
          testID="assign-title-open"
          style={styles.titleButton}
        />
        <Button
          label={issue.isPending ? t.assigning : t.assign}
          size="lg"
          loading={issue.isPending}
          disabled={!canAssign(picked.length, deadline) || wait.waiting}
          onPress={submit}
          testID="assign-submit"
          style={styles.grow}
        />
      </View>
    </View>
  ) : undefined;

  return (
    <CardScreen chrome={chrome} footer={footer}>
      <FlashList
        ref={listRef}
        data={numbers}
        keyExtractor={(number) => number.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <AssignNumberCard
              number={item.number}
              status={item.status}
              selected={picked.includes(item.id)}
              conditionLatex={item.conditionLatex}
              alreadyAssigned={item.deadlineAt !== null}
              disabled={issue.isPending}
              onToggle={() => setSelected((current) => toggleSelection(current, item.id))}
              testID={`assign-number-${item.number}`}
            />
          </View>
        )}
        extraData={[picked, issue.isPending]}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accentSolid}
            colors={[theme.colors.accentSolid]}
            progressBackgroundColor={theme.colors.cardBg}
          />
        }
        testID="assign-list"
      />

      <BottomSheet
        visible={titleOpen}
        onClose={() => setTitleOpen(false)}
        closeLabel={m.common.actions.close}
        title={m.teacher.assign.titleSheet}
        footer={<Button label={m.common.actions.done} size="lg" onPress={() => setTitleOpen(false)} testID="assign-title-done" />}
        testID="assign-title-sheet"
      >
        <View style={styles.sheet}>
          <TextField
            value={title}
            onChangeText={setTitle}
            placeholder={t.titlePlaceholder}
            accessibilityLabel={m.teacher.assign.titleSheet}
            maxLength={ASSIGN_TITLE_MAX}
            returnKeyType="done"
            onSubmitEditing={() => setTitleOpen(false)}
            testID="assign-title-input"
          />
          <Hint>
            <Text variant="caption" color="textMuted">
              {m.teacher.assign.titleHint}
            </Text>
          </Hint>
        </View>
      </BottomSheet>
    </CardScreen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.md, paddingBottom: t.space.lg },
  header: { gap: t.space.md, paddingBottom: t.space.md },
  noticeBlock: { gap: t.space.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, minHeight: 28 },
  item: { paddingBottom: t.space.md },
  bar: { gap: t.space.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  grow: { flex: 1, minWidth: 0 },
  titleButton: { maxWidth: '45%' },
  sheet: { gap: t.space.sm },
}));
