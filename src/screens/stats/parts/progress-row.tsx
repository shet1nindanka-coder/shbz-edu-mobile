import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { ProgressBar, Text } from '@/ui';

import type { ProgressRowModel } from '../logic';

/** A share of a whole (`DevProgressRow` on the site): the label, «12/40» as a plain figure and a bar. */
export function ProgressRow({ row }: { row: Omit<ProgressRowModel, 'key'> }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.label}>
          {row.label}
        </Text>
        <Text variant="small" color="textMuted" tabular>
          {row.value}
        </Text>
      </View>
      <ProgressBar value={row.percent} accessibilityLabel={`${row.label}: ${row.value}`} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { gap: t.space.xs },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.md },
  label: { flex: 1, minWidth: 0 },
}));
