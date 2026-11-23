import { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { TopicOption } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Button, EmptyState, Icon, PressableScale, Text, TextField } from '@/ui';

import { filterTopics, toggleId } from './new-lesson-logic';
import { TopicOptionRow } from './topic-option-row';

export type TopicsFieldProps = {
  topics: readonly TopicOption[];
  /** Selected topic ids, in the order they were picked. */
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
};

/**
 * «Темы занятия» (docs/spec/05-teacher-lessons-plans.md §1.2.d): the site's type-ahead combobox as a
 * searchable multi-select sheet; the selected topics stay under the field as removable chips.
 */
export function TopicsField({ topics, value, onChange, disabled = false }: TopicsFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonCreateForm;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => value.flatMap((id) => topics.find((topic) => topic.id === id) ?? []), [topics, value]);
  const matches = useMemo(() => filterTopics(topics, query), [topics, query]);

  return (
    <View style={styles.field}>
      <Text variant="label">{t.topicsLabel}</Text>
      <Button
        label={m.planner.lessonNew.pickTopics}
        variant="outline"
        leftIcon="plus"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={styles.trigger}
        testID="lesson-topics-open"
      />
      {selected.length > 0 ? (
        <View style={styles.chips}>
          {selected.map((topic) => (
            <PressableScale
              key={topic.id}
              accessibilityRole="button"
              accessibilityLabel={format(t.removeTopic, { title: topic.title })}
              disabled={disabled}
              onPress={() => onChange(value.filter((id) => id !== topic.id))}
              hitSlop={{ top: theme.space.xs, bottom: theme.space.xs }}
              testID={`lesson-topic-chip-${topic.id}`}
              style={styles.chip}
            >
              <Text variant="chip" numberOfLines={1} style={styles.chipText}>
                {topic.title}
              </Text>
              <Icon name="close" size={theme.sizes.icon.sm} color="textMuted" />
            </PressableScale>
          ))}
        </View>
      ) : null}
      {selected.length > 0 ? (
        <Text variant="hint" tabular>
          {format(t.topicsSelected, { n: selected.length })}
        </Text>
      ) : (
        <Hint>
          <Text variant="hint">{t.topicsHint}</Text>
        </Hint>
      )}

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={() => setQuery('')}
        closeLabel={m.common.actions.close}
        title={t.topicsLabel}
        footer={<Button label={m.common.actions.done} fullWidth onPress={() => setOpen(false)} testID="lesson-topics-done" />}
        testID="lesson-topics-sheet"
      >
        <View style={styles.sheet}>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={t.topicsPlaceholder}
            accessibilityLabel={t.topicsSearchAria}
            autoCorrect={false}
            returnKeyType="search"
            left={<Icon name="search" size={theme.sizes.icon.md} color="textMuted" />}
            testID="lesson-topics-search"
          />
          {matches.length === 0 ? (
            <EmptyState variant="plain" title={dict.planner.common.nothingFound} testID="lesson-topics-empty" />
          ) : (
            <View style={styles.options}>
              {matches.map((topic) => (
                <TopicOptionRow
                  key={topic.id}
                  title={topic.title}
                  checked={value.includes(topic.id)}
                  onChange={() => onChange(toggleId(value, topic.id))}
                  testID={`lesson-topic-option-${topic.id}`}
                />
              ))}
            </View>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  field: { gap: t.space.xs },
  trigger: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  // A picked topic is a neutral label with a "remove" cross: green is for number statuses.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xxs,
    maxWidth: '100%',
    minHeight: t.sizes.control.xs,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radii.sm,
    backgroundColor: t.colors.soft2,
  },
  chipText: { color: t.colors.label, flexShrink: 1 },
  sheet: { gap: t.space.md },
  options: { gap: t.space.xs },
}));
