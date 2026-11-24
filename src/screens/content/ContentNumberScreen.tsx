import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { NumberDetail } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { MathContent } from '@/components/math';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, type ScreenParams } from '@/navigation';
import { Hint, useCurrentUser } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { LoadingState, Notice, Panel, Panels, Screen, Segmented, Text, TextButton } from '@/ui';

import { LatexEditorBlock } from './browse/latex-editor-block';
import { clearOpenedFromEditor, peekOpenedFromEditor, requestEditorFocus } from './shared/editor-links';
import { hasLatex } from './shared/number-fill-status';
import { isTopicLeaving } from './shared/topics-flash';

/** Route params of `content.number` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentNumberScreenProps = ScreenParams['content.number'];

/** The two values of a number; a developer's phone shows one editor at a time. */
type NumberPart = 'condition' | 'answer';

/**
 * `content.number` (docs/spec/07-developer-content.md §1.4b; layout: docs/design/glass-over-paper.md §7):
 * one number of a topic — opened from the topic's tiles and from the staff number search. The number is
 * the title; a TEACHER reads the statement and the answer (shown at once); a DEVELOPER edits both as
 * LaTeX with a live preview and can save or delete each. A tablet puts the two side by side.
 */
export function ContentNumberScreen({ topicId, number }: ContentNumberScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.topics.singleNumber;
  const v = dict.topics.viewNumbers;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const isDeveloper = user.role === 'DEVELOPER';
  // Pushed from the editor's statements-and-answers list: that editor is the screen right below this one.
  const [fromEditor] = useState(() => peekOpenedFromEditor(topicId, number));
  useEffect(() => clearOpenedFromEditor(), []);
  const [part, setPart] = useState<NumberPart>('condition');

  const key = qk('content', 'getNumber', topicId, number);
  const detail = useQuery({ queryKey: key, queryFn: () => api.content.getNumber(topicId, number) });
  const data = detail.data;
  const failure = loadFailureOf(detail);

  // Realtime first; a stale number is asked again when the screen is returned to (00 §2.3).
  useRefetchOnFocus([detail]);
  const { refreshing, refresh } = usePullRefresh([detail]);

  // The number or its topic is gone: the not-found state, cached copy or not (90-addendum-1 A.3 rule 6).
  // (A topic deleted from its editor a moment ago is closing its screens: no "not found" flash on the way.)
  if (!isTopicLeaving(topicId) && isNotFoundError(detail.error)) return <NotFoundScreen />;

  // The stored value is shown at once; everything else that renders statements is refetched.
  const applyChange = (patch: Partial<Pick<NumberDetail['number'], 'conditionLatex' | 'answerLatex'>>) => {
    queryClient.setQueryData<NumberDetail>(key, (current) => (current ? { ...current, number: { ...current.number, ...patch } } : current));
    void queryClient.invalidateQueries({ queryKey: qk('content') });
  };

  // The recorded spelling («010203») comes from the server; the route may carry another spelling of it.
  const recorded = data?.number.number ?? number;
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

  // Under the title: the topic the number belongs to. How much of it is filled shows in the editors.
  const subtitle = data?.topic.title;
  const toTopic = <TextButton label={t.back} onPress={openTopic} style={styles.toTopic} testID="number-open-topic" />;
  // A phone has room for one editor: the switch sits in the header; a tablet shows both panels.
  const parts =
    isDeveloper && data && !theme.tablet ? (
      <Segmented<NumberPart>
        options={[
          { value: 'condition', label: v.condition },
          { value: 'answer', label: v.answer },
        ]}
        value={part}
        onChange={setPart}
        accessibilityLabel={t.sectionTitle}
        role="tab"
        fill
        testID="number-parts"
      />
    ) : undefined;

  return (
    <Screen
      testID="content-number-screen"
      header={
        <DetailAppBar
          title={format(t.title, { number: recorded })}
          subtitle={subtitle}
          backTitle={m.shell.tabs.topics}
          aside={theme.tablet ? (data ? toTopic : undefined) : parts}
        />
      }
      // A tablet page does not scroll: each panel scrolls its own content down to the dock.
      scroll={!theme.tablet}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {data ? (
        <>
          {detail.isError ? <Notice tone="error" text={errorText(detail.error, m.common.errors.generic)} testID="number-refresh-error" /> : null}

          {isDeveloper ? (
            <>
              {/* The screen's one hint: how formulas are written. */}
              <Hint>
                <Text variant="hint">{m.content.number.latexHint}</Text>
              </Hint>
              <Panels>
                {/* Both editors stay mounted: a draft typed in one survives a look at the other. */}
                <Panel style={!theme.tablet && part !== 'condition' ? styles.hidden : undefined} testID="latex-condition">
                  <LatexEditorBlock
                    // A new number (another route) must not inherit the previous draft.
                    key={`condition-${data.number.id}`}
                    kind="condition"
                    homeworkNumberId={data.number.id}
                    number={recorded}
                    saved={data.number.conditionLatex}
                    onChanged={(value) => applyChange({ conditionLatex: value })}
                    named={theme.tablet}
                  />
                </Panel>
                <Panel style={!theme.tablet && part !== 'answer' ? styles.hidden : undefined} testID="latex-answer">
                  <LatexEditorBlock
                    key={`answer-${data.number.id}`}
                    kind="answer"
                    homeworkNumberId={data.number.id}
                    number={recorded}
                    saved={data.number.answerLatex}
                    onChanged={(value) => applyChange({ answerLatex: value })}
                    secondary={theme.tablet}
                    named={theme.tablet}
                  />
                </Panel>
              </Panels>
            </>
          ) : (
            <Panels testID="number-read">
              <Panel>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {v.condition}
                </Text>
                {hasLatex(data.number.conditionLatex) ? (
                  <MathContent value={data.number.conditionLatex ?? ''} testID="number-condition" />
                ) : (
                  <Text variant="small" color="textMuted">
                    {v.noCondition}
                  </Text>
                )}
              </Panel>
              <Panel>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {v.answer}
                </Text>
                {hasLatex(data.number.answerLatex) ? (
                  <MathContent value={data.number.answerLatex ?? ''} testID="number-answer" />
                ) : (
                  <Text variant="small" color="textMuted">
                    {v.noAnswer}
                  </Text>
                )}
              </Panel>
            </Panels>
          )}

          {theme.tablet ? null : toTopic}
        </>
      ) : failure ? (
        <LoadFailure query={detail} testID="number-error" />
      ) : (
        <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="number-loading" />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  hidden: { display: 'none' },
  toTopic: { alignSelf: 'flex-start', minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
