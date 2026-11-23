import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { IssueHomeworkRequest } from '@/api/types';
import { useDateTimeLabels } from '@/components/date-time';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { NumberSelectCard } from '@/components/number-select-card';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { mskToday } from '@/domain/moscow-time';
import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { Hint } from '@/providers';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import {
  BottomSheet,
  Button,
  DateTimeField,
  EmptyState,
  LoadingState,
  Notice,
  Select,
  Text,
  TextButton,
  TextField,
} from '@/ui';

import { useNoticeScroll } from '../students/use-notice-scroll';
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
import { CardScreen, type CardChrome } from './card-screen';
import { invalidateStudentData } from './invalidate';
import { useStudentGone } from './use-student-gone';

export type AssignTabProps = { studentId: string; chrome: CardChrome };

type ListNotice = { tone: 'success' | 'error'; text: string };

const NO_NUMBERS: readonly AssignNumber[] = [];

/**
 * `teacher.student.assign` (docs/spec/04-teacher-students.md S5): one homework = numbers of one topic +
 * a deadline + an optional title. The topic is picked in a sheet, the numbers are a list of selectable
 * cards with their statements (two columns on a tablet), and "selected · deadline · assign" stay in a bar
 * under the list.
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
  const columns = theme.tablet ? 2 : 1;

  const board = useQuery({
    queryKey: qk('teacherStudents', 'getAssignBoard', studentId),
    queryFn: () => api.teacherStudents.getAssignBoard(studentId),
  });
  useStudentGone(studentId, board.error);
  const boardFailure = loadFailureOf(board);
  useRefetchOnFocus([board]);

  const [topicId, setTopicId] = useState<string | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [title, setTitle] = useState('');
  const [titleOpen, setTitleOpen] = useState(false);
  const [notice, setNotice] = useState<ListNotice | null>(null);
  // Issue and cancel share one bucket: 120 / 60 s.
  const wait = useRetryWait();

  const data = board.data;
  const enabled = data?.deadlinesEnabled ?? false;
  const topics = data?.topics;
  // The first topic is pinned as soon as the board arrives (the site's `useState(topics[0]?.id)`): a refetch
  // that reorders the topics (the developer moved one, pull-to-refresh) must not switch the topic under the
  // teacher and drop the numbers they picked. `pickTopic` falls back to the first one only when the pinned
  // topic has left the list — and that fallback is pinned in its turn, so a later reordering refetch does not
  // switch the topic again (#413).
  const shownTopic = topics ? pickTopic(topics, topicId) : null;
  if (shownTopic && shownTopic.id !== topicId) setTopicId(shownTopic.id);
  const topic = enabled ? shownTopic : null;

  // Statements come with the first topic only; any other topic fetches its own once (04 S5 "Data").
  // The board works without them when the read fails.
  const needsConditions = topic !== null && !topic.conditionsLoaded;
  const conditions = useQuery({
    queryKey: qk('content', 'getTopicConditions', topic?.id ?? ''),
    queryFn: () => api.content.getTopicConditions(topic?.id ?? ''),
    enabled: needsConditions,
    // The default (15 s) staleness: statements change on the server, and a restored cache must not keep an
    // outdated one for days. Pull-to-refresh reads them again too.
  });
  const { refreshing, refresh } = usePullRefresh([board, needsConditions && conditions]);
  const numbers = topic ? withConditions(topic, conditions.data) : NO_NUMBERS;
  const picked = liveSelection(topic, selected);

  const announce = (next: ListNotice) => setNotice(next);
  useNoticeScroll(listRef, notice);

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

  const header = (
    <View style={styles.header}>
      {notice ? (
        <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="assign-notice" />
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
            <Text variant="hint" color="textMuted">
              {m.teacher.assign.steps}
            </Text>
          </Hint>
          {needsConditions && conditions.isError ? (
            <Notice
              tone="warning"
              // A retry over statements read earlier waits offline instead of failing: say why nothing happens.
              text={conditions.fetchStatus === 'paused' ? m.common.errors.network : m.teacher.assign.conditionsFailed}
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
  ) : boardFailure ? (
    <LoadFailure query={board} testID="assign-error" />
  ) : (
    <LoadingState variant="cards" count={4} cardHeight={120} accessibilityLabel={m.common.a11y.loading} testID="assign-loading" />
  );

  const footer = topic ? (
    <View style={styles.bar} testID="assign-bar">
      <View style={[styles.barRow, styles.barRowTop]}>
        {/* A neutral fact: plain text, not a chip. It lines up with the field, not with field + helper. */}
        <View style={styles.selected}>
          <Text variant="bodyStrong" color={picked.length > 0 ? 'textStrong' : 'textMuted'} tabular testID="assign-selected">
            {format(t.selected, { n: picked.length })}
          </Text>
        </View>
        <DateTimeField
          value={deadline}
          today={mskToday()}
          onChange={setDeadline}
          placeholder={t.deadlinePlaceholder}
          labels={dateTimeLabels}
          locale={locale}
          accessibilityLabel={t.deadlinePlaceholder}
          // Which zone the deadline is in is not a hint: it stays when hints are off (as on the draft form).
          helper={m.common.dateTime.moscowTime}
          disabled={issue.isPending}
          testID="assign-deadline"
          style={styles.grow}
        />
      </View>
      <View style={styles.barRow}>
        <Button
          label={title.trim() || m.teacher.assign.titleAction}
          accessibilityLabel={title.trim() ? format(m.teacher.assign.titleSheetOf, { title: title.trim() }) : m.teacher.assign.titleSheet}
          variant="outline"
          size="lg"
          leftIcon="edit"
          disabled={issue.isPending}
          onPress={() => setTitleOpen(true)}
          testID="assign-title-open"
          // The cap keeps a long typed title from squeezing «Выдать»; the short default label never needs it,
          // and capped it was cut to «Назван…» from text size 1.15.
          style={title.trim() ? styles.titleButton : null}
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
      {/* Under the locked button, not in the notice: closing the notice or changing the topic keeps the lock. */}
      <RetryWaitLine wait={wait} testID="assign-wait" />
    </View>
  ) : undefined;

  return (
    <CardScreen chrome={chrome} footer={footer}>
      <FlashList
        ref={listRef}
        data={numbers}
        keyExtractor={(number) => number.id}
        // A tablet has the room for two columns of statements.
        numColumns={columns}
        renderItem={({ item, index }) => (
          <View style={[styles.item, columns > 1 ? (index % columns === 0 ? styles.itemLeft : styles.itemRight) : null]}>
            <NumberSelectCard
              number={item.number}
              status={item.status}
              selected={picked.includes(item.id)}
              conditionLatex={item.conditionLatex}
              // The number already sits in a homework with a deadline.
              footnote={item.deadlineAt !== null ? t.alreadyAssigned : null}
              disabled={issue.isPending}
              onToggle={() => setSelected((current) => toggleSelection(current, item.id))}
              testID={`assign-number-${item.number}`}
            />
          </View>
        )}
        extraData={[picked, issue.isPending, columns]}
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
            <Text variant="hint" color="textMuted">
              {m.teacher.assign.titleHint}
            </Text>
          </Hint>
        </View>
      </BottomSheet>
    </CardScreen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.lg },
  header: { gap: t.space.md, paddingBottom: t.space.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, minHeight: t.sizes.control.xs },
  item: { flex: 1, paddingBottom: t.space.block },
  itemLeft: { paddingRight: t.space.xs },
  itemRight: { paddingLeft: t.space.xs },
  bar: { gap: t.space.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  // The deadline field carries a helper line: the counter lines up with the field, not with field + helper.
  barRowTop: { alignItems: 'flex-start' },
  selected: { minHeight: t.sizes.field, justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  titleButton: { maxWidth: '45%' },
  sheet: { gap: t.space.sm },
}));
