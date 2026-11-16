import { useDeferredValue, useMemo } from 'react';
import { View } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Badge, Card, Text, TextArea } from '@/ui';

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

      <View style={styles.badges}>
        <Badge
          tone="count"
          label={summary.state === 'ok' ? plural(locale, summary.count, dict.topics.widgets.numberForms) : t.empty}
        />
        {summary.state === 'ok' && summary.first !== null && summary.last !== null ? (
          <Badge tone="count" label={format(t.range, { from: summary.first, to: summary.last })} />
        ) : null}
      </View>

      {computing ? (
        <Card variant="soft" padded={14}>
          <Text variant="small" color="textMuted">
            {t.computing}
          </Text>
        </Card>
      ) : summary.state === 'ok' ? (
        <Hint>
          <Card variant="soft" padded={14} testID={`${testID}-summary`}>
            <Text variant="small" color="textMuted">
              {description ?? t.description}
            </Text>
            <Text variant="small" color="label" style={styles.finalList}>
              {format(t.finalList, { list: summary.preview })}
            </Text>
          </Card>
        </Hint>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  finalList: { marginTop: t.space.xxs },
}));
