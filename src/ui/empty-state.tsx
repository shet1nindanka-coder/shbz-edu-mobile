import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Card, useInsideSurface } from './card';
import { Enter } from './enter';
import { Text } from './text';

export type EmptyStateProps = {
  title: string;
  /** One muted sentence that says what to do next. */
  hint?: string;
  /** Node under the texts (a button). */
  action?: ReactNode;
  /**
   * `panel` — a card with a title (17 / 700; a dashed soft panel when it sits inside a card); the default.
   * `plain` — a centred muted line (empty list inside a sheet).
   */
  variant?: 'panel' | 'plain';
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Empty section. It enters with the 260 ms item animation, as on the site. */
export function EmptyState({ title, hint, action, variant = 'panel', testID, style }: EmptyStateProps) {
  const styles = useStyles();
  const nested = useInsideSurface();
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
    <Enter duration={260} style={style}>
      <Card dashed={nested} padded={false} style={styles.panel}>
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
      </Card>
    </Enter>
  );
}

const useStyles = makeStyles((t) => ({
  panel: { alignSelf: 'stretch', paddingVertical: t.space.xxl, paddingHorizontal: t.space.xl },
  content: { alignItems: 'center', gap: t.space.sm },
  action: { marginTop: t.space.md, alignItems: 'center' },
  plain: { alignItems: 'center', gap: t.space.sm, paddingVertical: t.space.xxl, paddingHorizontal: t.space.xl },
}));
