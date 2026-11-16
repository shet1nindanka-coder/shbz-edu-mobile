import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Skeleton } from '@/ui';

/** Placeholder of the number card: title row, statement block, note field. */
export function NumberSkeleton() {
  const styles = useStyles();
  const { m } = useI18n();
  return (
    <Card testID="number-skeleton">
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={m.common.a11y.loading}
        accessibilityState={{ busy: true }}
        style={styles.body}
      >
        <View style={styles.row}>
          <Skeleton width={120} height={26} />
          <Skeleton width={96} height={24} radius="md" index={1} />
        </View>
        <Skeleton width="78%" height={12} index={1} />
        <Skeleton width={84} height={12} index={2} />
        <Skeleton height={132} radius="lg" index={2} />
        <Skeleton width={84} height={12} index={2} />
        <Skeleton height={58} radius="md" index={2} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
}));
