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
  /** Explanation above the "final list" line; default `dict.topics.numbersField.description`. */
  description?: string;
  /** Visible lines of the field (the site uses 4 in create, 5 in edit). */
  rows?: number;
  disabled?: boolean;
  /** A form-level problem (the field was left blank on save); "nothing parses" still wins. */
  error?: string | null;
  testID?: string;
};

/**
 * Numbers field shared by manual create and topic edit (site: `TopicNumbersField`,
 * docs/spec/07-developer-content.md §1.6): free text parsed live with `parseNumbersInput`, with the
 * count, the range and the list compressed back into ranges shown under it.
 */
export function NumbersField({
  value,
  onChangeText,
  description,
  rows = 4,
  disabled = false,
  error = null,
  testID = 'numbers-field',
}: NumbersFieldProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.topics.numbersField;
  // Parsing a list of hundreds of numbers must not block typing.
  const deferred = useDeferredValue(value);
  const summary = useMemo(() => summarizeNumbersInput(deferred), [deferred]);
  const computing = deferred !== value;
  const unrecognized = summary.state === 'unrecognized' && !computing;

  return (
    <View style={styles.root}>
      <TextArea
        label={t.label}
        value={value}
        onChangeText={onChangeText}
        placeholder={t.placeholder}
        numberOfLines={rows}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect={false}
        // Ranges need a dash and lists a comma: the plain number pad has neither.
        keyboardType="numbers-and-punctuation"
        error={unrecognized ? t.unrecognized : error}
        testID={testID}
      />

      {/* Neutral facts of the parsed list: plain text, not labels. */}
      <Text variant="small" color="textMuted" tabular>
        {summary.state === 'ok'
          ? summary.first !== null && summary.last !== null
            ? `${plural(locale, summary.count, dict.topics.widgets.numberForms)} · ${format(t.range, { from: summary.first, to: summary.last })}`
            : plural(locale, summary.count, dict.topics.widgets.numberForms)
          : t.empty}
      </Text>

      {computing ? (
        <Text variant="small" color="textMuted">
          {t.computing}
        </Text>
      ) : summary.state === 'ok' ? (
        <Hint>
          <View style={styles.summary} testID={`${testID}-summary`}>
            <Text variant="hint">{description ?? t.description}</Text>
            <Text variant="small" color="label">
              {format(t.finalList, { list: summary.preview })}
            </Text>
          </View>
        </Hint>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
  summary: { gap: t.space.xxs },
}));
