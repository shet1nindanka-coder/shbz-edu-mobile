import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { Text } from '@/ui';

/** «Ключевой вывод» / «Сейчас»: a kicker over one bold sentence. */
export function InsightBox({ kicker, text, testID }: { kicker: string; text: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.box} testID={testID}>
      <Text variant="kickerSm">{kicker}</Text>
      <Text variant="bodyBold" accessibilityLiveRegion="polite">
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  box: {
    gap: t.space.xs,
    paddingVertical: t.space.gutter,
    paddingHorizontal: t.space.field,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
}));
