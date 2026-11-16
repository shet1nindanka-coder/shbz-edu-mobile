import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Enter } from './enter';
import { Text } from './text';

export type EmptyStateProps = {
  title: string;
  /** One muted sentence that says what to do next. */
  hint?: string;
  /** Node under the texts (a button). */
  action?: ReactNode;
  /**
   * `panel` — dashed soft panel with a 24/600 title (empty section, default).
   * `plain` — centered muted 14px line with 40 vertical padding (empty list inside a sheet).
   */
  variant?: 'panel' | 'plain';
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Empty section. It enters with the 260 ms item animation, as on the site. */
export function EmptyState({ title, hint, action, variant = 'panel', testID, style }: EmptyStateProps) {
  const styles = useStyles();
  if (variant === 'plain') {
    return (
      <View testID={testID} style={[styles.plain, style]}>
        <Text variant="small" color="textMuted" align="center">
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" align="center">
            {hint}
          </Text>
        ) : null}
        {action}
      </View>
    );
  }
  return (
    <Enter duration={260} style={[styles.panel, style]}>
      <View testID={testID} style={styles.content}>
        <Text variant="emptyTitle" align="center">
          {title}
        </Text>
        {hint ? (
          <Text variant="small" color="textMuted" align="center">
            {hint}
          </Text>
        ) : null}
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </Enter>
  );
}

const useStyles = makeStyles((t) => ({
  panel: {
    alignSelf: 'stretch',
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderStyle: 'dashed',
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  content: { alignItems: 'center', gap: 8 },
  action: { marginTop: 12, alignItems: 'center' },
  plain: { alignItems: 'center', gap: 6, paddingVertical: 40, paddingHorizontal: 20 },
}));
