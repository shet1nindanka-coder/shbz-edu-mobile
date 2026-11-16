import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { ProgressBar, Text } from '@/ui';

import type { ProgressRowModel } from '../logic';

/** Label, «12 / 40» and a bar (`DevProgressRow` on the site). */
export function ProgressRow({ row, size }: { row: Omit<ProgressRowModel, 'key'>; size?: 'sm' | 'md' }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text variant="label" color="textMuted" style={styles.label}>
          {row.label}
        </Text>
        <Text variant="smallExtra" tabular>
          {row.value}
        </Text>
      </View>
      <ProgressBar value={row.percent} size={size} accessibilityLabel={`${row.label}: ${row.value}`} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { gap: t.space.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.md },
  label: { flex: 1, minWidth: 0 },
}));
