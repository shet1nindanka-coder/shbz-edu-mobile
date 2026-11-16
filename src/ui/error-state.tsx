import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Button } from './button';
import { Card } from './card';
import { Enter } from './enter';
import { Text } from './text';

export type ErrorStateProps = {
  title: string;
  description?: string;
  /** Primary action, e.g. `dict.common.retry`. Shown only with `onRetry`. */
  retryLabel?: string;
  onRetry?: () => void;
  /** Disables the retry button and shows its spinner. */
  retrying?: boolean;
  /** Outline action, e.g. `dict.common.home`. Shown only with `onSecondary`. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Large muted numeral instead of the "!" tile — `"404"` for the not-found shell. */
  numeral?: string;
  /** `card` — the site's centered surface card (default); `plain` — no card, for use inside a card. */
  variant?: 'card' | 'plain';
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Route error / not-found shell (`RouteErrorState`): tile, title, explanation, retry + home. */
export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  retrying = false,
  secondaryLabel,
  onSecondary,
  numeral,
  variant = 'card',
  testID,
  style,
}: ErrorStateProps) {
  const styles = useStyles();
  const hasRetry = Boolean(retryLabel && onRetry);
  const hasSecondary = Boolean(secondaryLabel && onSecondary);
  const body = (
    <View style={styles.body} accessibilityRole="alert" testID={testID}>
      {numeral ? (
        <Text variant="display" color="textMuted" tabular style={styles.numeral}>
          {numeral}
        </Text>
      ) : (
        <View style={styles.tile}>
          <Text variant="numberTitle" color="redText">
            !
          </Text>
        </View>
      )}
      <Text variant="errorTitle" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="small" color="textMuted" align="center" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {hasRetry || hasSecondary ? (
        <View style={styles.actions}>
          {hasRetry && retryLabel ? (
            <Button label={retryLabel} onPress={onRetry} loading={retrying} style={styles.actionButton} />
          ) : null}
          {hasSecondary && secondaryLabel ? (
            <Button label={secondaryLabel} variant="outline" onPress={onSecondary} style={styles.actionButton} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (variant === 'plain') return <View style={style}>{body}</View>;
  return (
    <Enter duration={180} offset={8} style={style}>
      <Card variant="surface" padded={24}>
        {body}
      </Card>
    </Enter>
  );
}

const useStyles = makeStyles((t) => ({
  body: { alignItems: 'center', gap: 12 },
  tile: {
    width: 56,
    height: 56,
    borderRadius: t.radii.sm,
    backgroundColor: t.colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  numeral: { fontFamily: t.fonts.bold, fontSize: 64, lineHeight: 72, letterSpacing: 0 },
  description: { lineHeight: 22 },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: t.space.md,
    marginTop: 8,
  },
  actionButton: { flexGrow: 1 },
}));
