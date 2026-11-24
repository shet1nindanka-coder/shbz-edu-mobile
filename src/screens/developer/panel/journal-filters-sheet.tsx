import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { AuditCategory, JournalPage } from '@/api/types';
import { plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Select, Switch, TextButton, TextField } from '@/ui';

import {
  JOURNAL_ACTION_DEBOUNCE_MS,
  JOURNAL_ACTION_MAX_LENGTH,
  JOURNAL_CATEGORIES,
  JOURNAL_PERIODS,
  activeFilterCount,
  actorOptionLabel,
  categoryFilterLabel,
  initialJournalFilters,
  periodLabel,
  type JournalFilters,
} from './journal-logic';

/** Value of the «Все» option: the selects need a non-empty string. */
const ALL = 'all';

export type JournalFiltersSheetProps = {
  visible: boolean;
  filters: JournalFilters;
  /** Users that have at least one journal row. */
  actors: JournalPage['actors'];
  onChange: (filters: JournalFilters) => void;
  onClose: () => void;
};

/**
 * Filters of the journal (07 §1.10) in a bottom sheet. As on the site there is no "apply": every change
 * takes effect at once and restarts the list from its first page; the "action" text is debounced 450 ms.
 */
export function JournalFiltersSheet({ visible, filters, actors, onChange, onClose }: JournalFiltersSheetProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.journal;
  const f = t.filters;

  // The text the user is typing; it reaches the filters 450 ms after the last keystroke.
  const [actionText, setActionText] = useState(filters.action);
  const [appliedAction, setAppliedAction] = useState(filters.action);
  if (appliedAction !== filters.action) {
    // Changed from outside (reset, a new arrival): the field follows.
    setAppliedAction(filters.action);
    setActionText(filters.action);
  }
  const latest = useRef({ filters, onChange });
  useEffect(() => {
    latest.current = { filters, onChange };
  });
  useEffect(() => {
    if (actionText === latest.current.filters.action) return;
    const timer = setTimeout(() => {
      latest.current.onChange({ ...latest.current.filters, action: actionText });
    }, JOURNAL_ACTION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [actionText]);

  const categoryOptions = [
    { value: ALL, label: f.all },
    ...JOURNAL_CATEGORIES.map((category) => ({ value: category as string, label: categoryFilterLabel(category, f) })),
  ];
  const actorOptions = [{ value: ALL, label: f.all }, ...actors.map((actor) => ({ value: actor.id, label: actorOptionLabel(actor, t.roles) }))];
  const periodOptions = JOURNAL_PERIODS.map((days) => ({ value: days as number, label: periodLabel(days, f) ?? String(days) }));
  const knownPeriod = periodLabel(filters.days, f) !== null;
  // A picked actor whose rows fell out of the journal is no longer offered: the select then shows «Все».
  const actorValue = filters.actor && actors.some((actor) => actor.id === filters.actor) ? filters.actor : ALL;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel={m.common.actions.close}
      title={m.developer.journal.filters}
      footer={
        <View style={styles.footer}>
          <TextButton
            label={m.developer.short.reset}
            accessibilityLabel={m.developer.journal.resetFilters}
            tone="muted"
            disabled={activeFilterCount(filters) === 0 && actionText === ''}
            onPress={() => {
              setActionText('');
              onChange(initialJournalFilters({}));
            }}
            style={styles.reset}
            testID="journal-filters-reset"
          />
          <Button label={m.common.actions.done} onPress={onClose} testID="journal-filters-done" />
        </View>
      }
      testID="journal-filters-sheet"
    >
      <View style={styles.content}>
        <Select<string>
          label={f.category}
          options={categoryOptions}
          value={filters.category ?? ALL}
          onChange={(value) => onChange({ ...filters, category: value === ALL ? null : (value as AuditCategory) })}
          placeholder={f.all}
          closeLabel={m.common.actions.close}
          size="sm"
          testID="journal-filter-category"
        />
        <Select<string>
          label={f.who}
          options={actorOptions}
          value={actorValue}
          onChange={(value) => onChange({ ...filters, actor: value === ALL ? null : value })}
          placeholder={f.all}
          closeLabel={m.common.actions.close}
          size="sm"
          testID="journal-filter-actor"
        />
        <TextField
          label={f.action}
          value={actionText}
          onChangeText={setActionText}
          maxLength={JOURNAL_ACTION_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          testID="journal-filter-action"
        />
        <Select<number>
          label={f.period}
          options={periodOptions}
          value={knownPeriod ? filters.days : null}
          onChange={(days) => onChange({ ...filters, days })}
          placeholder={plural(locale, filters.days, m.developer.journal.periodForms)}
          closeLabel={m.common.actions.close}
          size="sm"
          testID="journal-filter-period"
        />
        <Switch
          label={f.onlyFailed}
          value={filters.onlyFailed}
          onValueChange={(onlyFailed) => onChange({ ...filters, onlyFailed })}
          trailing
          testID="journal-filter-failed"
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.field, paddingTop: t.space.xs },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  reset: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
