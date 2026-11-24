import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, IconButton, TextField } from '@/ui';

import type { DirectoryTab } from './accounts-logic';

export type DirectorySearchProps = {
  tab: DirectoryTab;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The one search field of the directory (docs/spec/04-teacher-students.md S9b): it filters the list as it
 * is typed, by name or login, so there is nothing to submit — the trailing button only clears it.
 */
export function DirectorySearch({ tab, value, onChange }: DirectorySearchProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.students.directory;

  return (
    <TextField
      value={value}
      onChangeText={onChange}
      // One word in the field; what is searched («Имя или логин учителя») is its accessible name.
      placeholder={m.accounts.search.placeholder}
      accessibilityLabel={tab === 'teachers' ? t.searchTeachers : tab === 'students' ? t.searchStudents : t.searchAria}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      returnKeyType="search"
      enterKeyHint="search"
      left={<Icon name="search" size={theme.sizes.icon.md} color="textMuted" />}
      right={
        value.length > 0 ? (
          <IconButton
            icon="close"
            variant="ghost"
            accessibilityLabel={m.accounts.search.clear}
            onPress={() => onChange('')}
            style={styles.clear}
            testID="accounts-search-clear"
          />
        ) : undefined
      }
      testID="accounts-search"
    />
  );
}

const useStyles = makeStyles((t) => ({
  clear: { marginRight: t.space.xxs },
}));
