import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Skeleton } from '@/ui';

export type HomeSkeletonProps = {
  /** Which parts to draw: the deadline blocks, the streak block, or both. */
  parts?: 'all' | 'deadlines' | 'streak';
};

/** Placeholders with the geometry of the real overview: the hero card, the streak block, the list. */
export function HomeSkeleton({ parts = 'all' }: HomeSkeletonProps) {
  const styles = useStyles();
  const { m } = useI18n();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={m.common.a11y.loading}
      accessibilityState={{ busy: true }}
      style={styles.root}
      testID="student-home-skeleton"
    >
      {parts !== 'streak' ? (
        <View style={styles.section}>
          <Skeleton width={128} height={20} />
          <Skeleton height={132} radius="md" index={1} />
        </View>
      ) : null}
      {parts !== 'deadlines' ? (
        <View style={styles.section}>
          <Skeleton width={164} height={20} />
          <Skeleton height={116} radius="lg" index={1} />
          <View style={styles.row}>
            <Skeleton height={84} radius="lg" index={2} style={styles.half} />
            <Skeleton height={84} radius="lg" index={2} style={styles.half} />
          </View>
          <Skeleton height={176} radius="lg" index={2} />
        </View>
      ) : null}
      {parts !== 'streak' ? (
        <View style={styles.section}>
          <Skeleton width={148} height={20} />
          <Skeleton height={140} radius="lg" index={1} />
          <Skeleton height={140} radius="lg" index={2} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.pageTop },
  section: { gap: t.space.md },
  row: { flexDirection: 'row', gap: t.space.md },
  half: { flex: 1 },
}));
