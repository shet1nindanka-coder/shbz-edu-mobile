import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

/** «Ключевой вывод» / «Сейчас»: a caption over one sentence, in a soft panel of its card. */
export function InsightBox({ kicker, text, testID }: { kicker: string; text: string; testID?: string }) {
  const styles = useStyles();
  return (
    <Card style={styles.box} testID={testID}>
      <Text variant="small" color="textMuted">
        {kicker}
      </Text>
      <Text variant="bodyStrong" accessibilityLiveRegion="polite">
        {text}
      </Text>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  box: { gap: t.space.xxs },
}));
