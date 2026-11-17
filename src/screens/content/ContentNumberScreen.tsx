import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { NumberDetail } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { MathContent } from '@/components/math';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, type ScreenParams } from '@/navigation';
import { Hint, useCurrentUser } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { Badge, Card, LoadingState, Notice, Screen, Text, TextButton, type BadgeTone } from '@/ui';

import { LatexEditorBlock } from './browse/latex-editor-block';
import { clearOpenedFromEditor, peekOpenedFromEditor, requestEditorFocus } from './shared/editor-links';
import { hasLatex, numberFillStatus, type NumberFillStatus } from './shared/number-fill-status';
import { isTopicLeaving } from './shared/topics-flash';

/** Route params of `content.number` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentNumberScreenProps = ScreenParams['content.number'];

// SPEC-GAP: the site paints «Частично заполнено» with the accent badge; the kit has no accent badge, so
// the neutral outline stands in (the status tones stay reserved for the traffic light).
const FILL_TONE: Record<NumberFillStatus, BadgeTone> = { full: 'GREEN', partial: 'neutral', empty: 'none' };

/**
 * `content.number` (docs/spec/07-developer-content.md §1.4b): one number of a topic, the destination of
 * the staff number search. A TEACHER reads the statement and the answer (shown at once); a DEVELOPER
 * edits both as LaTeX with a live preview and can save or delete each.
 */
export function ContentNumberScreen({ topicId, number }: ContentNumberScreenProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.topics.singleNumber;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const isDeveloper = user.role === 'DEVELOPER';
  const [refreshing, setRefreshing] = useState(false);
  // Pushed from the editor's statements-and-answers list: that editor is the screen right below this one.
  const [fromEditor] = useState(() => peekOpenedFromEditor(topicId, number));
  useEffect(() => clearOpenedFromEditor(), []);

  const key = qk('content', 'getNumber', topicId, number);
  const detail = useQuery({ queryKey: key, queryFn: () => api.content.getNumber(topicId, number) });
  const data = detail.data;
  const failure = loadFailureOf(detail);

  // Realtime first; a stale number is asked again when the screen is returned to (00 §2.3).
  useRefetchOnFocus([detail]);

  // The number or its topic is gone: the not-found state, cached copy or not (90-addendum-1 A.3 rule 6).
  // (A topic deleted from its editor a moment ago is closing its screens: no "not found" flash on the way.)
  if (!isTopicLeaving(topicId) && isNotFoundError(detail.error)) return <NotFoundScreen />;

  const refresh = () => {
    setRefreshing(true);
    void detail.refetch().finally(() => setRefreshing(false));
  };

  // The stored value is shown at once; everything else that renders statements is refetched.
  const applyChange = (patch: Partial<Pick<NumberDetail['number'], 'conditionLatex' | 'answerLatex'>>) => {
    queryClient.setQueryData<NumberDetail>(key, (current) => (current ? { ...current, number: { ...current.number, ...patch } } : current));
    void queryClient.invalidateQueries({ queryKey: qk('content') });
  };

  // The recorded spelling («010203») comes from the server; the route may carry another spelling of it.
  const recorded = data?.number.number ?? number;
  const fill = data ? numberFillStatus(data.number.conditionLatex, data.number.answerLatex) : 'empty';
  // The site's back link (07 §1.4b): a teacher returns to the topic, a developer to the statements-and-answers
  // section of its editor, on the page of this number. Opened from that very list, the editor is one step
  // back with its section and page intact — pushing another editor on top would lose both.
  const openTopic = () => {
    if (!isDeveloper) {
      navigation.open({ screen: 'content.topic', topicId });
    } else if (fromEditor) {
      navigation.back();
    } else {
      requestEditorFocus(topicId, recorded);
      navigation.open({ screen: 'content.topicEdit', topicId });
    }
  };

  return (
    <Screen
      testID="content-number-screen"
      header={<DetailAppBar title={format(t.title, { number: recorded })} subtitle={data?.topic.title} />}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {data ? (
        <View style={styles.root}>
          {detail.isError ? <Notice tone="error" text={errorText(detail.error, m.common.errors.generic)} testID="number-refresh-error" /> : null}

          <TextButton label={t.back} tone="muted" onPress={openTopic} style={styles.back} testID="number-open-topic" />

          <View style={styles.head}>
            <Text variant="sectionTitle" accessibilityRole="header">
              {t.sectionTitle}
            </Text>
            {isDeveloper ? (
              <Hint>
                <Text variant="hint">{t.sectionDescription}</Text>
              </Hint>
            ) : null}
          </View>

          {isDeveloper ? (
            <>
              <View style={styles.numberRow}>
                <Text variant="numberTitle" style={styles.grow} testID="number-label">
                  {format(dict.topics.widgets.numberLabel, { number: recorded })}
                </Text>
                <Badge tone={FILL_TONE[fill]} label={dict.topics.answerManager.status[fill]} />
              </View>
              <LatexEditorBlock
                // A new number (another route) must not inherit the previous draft.
                key={`condition-${data.number.id}`}
                kind="condition"
                homeworkNumberId={data.number.id}
                number={recorded}
                saved={data.number.conditionLatex}
                onChanged={(value) => applyChange({ conditionLatex: value })}
              />
              <LatexEditorBlock
                key={`answer-${data.number.id}`}
                kind="answer"
                homeworkNumberId={data.number.id}
                number={recorded}
                saved={data.number.answerLatex}
                onChanged={(value) => applyChange({ answerLatex: value })}
              />
            </>
          ) : (
            <Card style={styles.readCard} testID="number-read">
              <Text variant="numberTitle" testID="number-label">
                {format(dict.topics.widgets.numberLabel, { number: recorded })}
              </Text>
              <View style={styles.block}>
                <Text variant="kickerSm">{dict.topics.viewNumbers.condition}</Text>
                {hasLatex(data.number.conditionLatex) ? (
                  <MathContent value={data.number.conditionLatex ?? ''} testID="number-condition" />
                ) : (
                  <Text variant="small" color="textMuted">
                    {dict.topics.viewNumbers.noCondition}
                  </Text>
                )}
              </View>
              <View style={styles.block}>
                <Text variant="kickerSm">{dict.topics.viewNumbers.answer}</Text>
                {hasLatex(data.number.answerLatex) ? (
                  <MathContent value={data.number.answerLatex ?? ''} testID="number-answer" />
                ) : (
                  <Text variant="small" color="textMuted">
                    {dict.topics.viewNumbers.noAnswer}
                  </Text>
                )}
              </View>
            </Card>
          )}
        </View>
      ) : failure ? (
        <LoadFailure query={detail} testID="number-error" />
      ) : (
        <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="number-loading" />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
  back: { alignSelf: 'flex-start', minHeight: t.sizes.minTouch, justifyContent: 'center' },
  head: { gap: t.space.xxs },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1 },
  readCard: { gap: t.space.lg },
  block: { gap: t.space.xs },
}));
