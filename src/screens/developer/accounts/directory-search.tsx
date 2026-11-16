import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Icon, IconButton, TextField } from '@/ui';

import type { DirectoryTab } from './accounts-logic';

export type DirectorySearchProps = {
  tab: DirectoryTab;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The one search field shared by both tabs (docs/spec/04-teacher-students.md S9b): it filters the list as
 * it is typed, by name or login, so there is nothing to submit — the trailing button only clears it.
 */
export function DirectorySearch({ tab, value, onChange }: DirectorySearchProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.directory;

  return (
    <TextField
      value={value}
      onChangeText={onChange}
      placeholder={tab === 'teachers' ? t.searchTeachers : t.searchStudents}
      accessibilityLabel={t.searchAria}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      returnKeyType="search"
      enterKeyHint="search"
      left={
        <View style={styles.icon}>
          <Icon name="search" size={18} color="kicker" />
        </View>
      }
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
  icon: { paddingLeft: t.space.lg - t.space.xxs },
  clear: { marginRight: t.space.xxs },
}));
