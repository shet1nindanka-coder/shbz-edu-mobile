import { useDeferredValue, useMemo } from 'react';
import { View } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Text, TextArea } from '@/ui';

import { summarizeNumbersInput } from './numbers-summary';

export type NumbersFieldProps = {
  /** Raw text of the field: «1-5, 8, 12-14». The server parses it again. */
  value: string;
  onChangeText: (value: string) => void;
  /** Visible lines of the field (the site uses 4 in create, 5 in edit). */
  rows?: number;
  disabled?: boolean;
  /** A form-level problem (the field was left blank on save); "nothing parses" still wins. */
  error?: string | null;
  testID?: string;
};

/**
 * Numbers field shared by manual create and topic edit (site: `TopicNumbersField`,
 * docs/spec/07-developer-content.md §1.6; text: docs/design/glass-over-paper.md §1a): free text parsed
 * live with `parseNumbersInput`. What the eye gets is the field's name and, next to it, how many numbers
 * the text gives — a bare figure; the count in words and the range are spoken. The format is said by the
 * error when nothing parses; the list compressed back into ranges is the screen's one hint.
 */
export function NumbersField({ value, onChangeText, rows = 4, disabled = false, error = null, testID = 'numbers-field' }: NumbersFieldProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.topics.numbersField;
  // Parsing a list of hundreds of numbers must not block typing.
  const deferred = useDeferredValue(value);
  const summary = useMemo(() => summarizeNumbersInput(deferred), [deferred]);
  const computing = deferred !== value;
  const unrecognized = summary.state === 'unrecognized' && !computing;
  const facts =
    summary.state === 'ok'
      ? summary.first !== null && summary.last !== null
        ? `${plural(locale, summary.count, dict.topics.widgets.numberForms)} · ${format(t.range, { from: summary.first, to: summary.last })}`
        : plural(locale, summary.count, dict.topics.widgets.numberForms)
      : t.empty;

  return (
    <View style={styles.root}>
      <TextArea
        label={dict.topics.edit.numbers}
        labelAside={
          summary.state === 'ok' ? (
            <Text variant="small" color="textMuted" tabular testID={`${testID}-count`}>
              {String(summary.count)}
            </Text>
          ) : undefined
        }
        value={value}
        onChangeText={onChangeText}
        numberOfLines={rows}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect={false}
        // Ranges need a dash and lists a comma: the plain number pad has neither.
        keyboardType="numbers-and-punctuation"
        error={unrecognized ? t.unrecognized : error}
        accessibilityLabel={t.label}
        accessibilityHint={facts}
        testID={testID}
      />
      {summary.state === 'ok' && !computing ? (
        <Hint>
          <Text variant="hint" numberOfLines={1} testID={`${testID}-summary`}>
            {format(t.finalList, { list: summary.preview })}
          </Text>
        </Hint>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
}));
