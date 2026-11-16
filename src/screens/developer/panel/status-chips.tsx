import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { Chip } from '@/ui';

import type { PanelChip } from './logic';

/** The compact strip under the panel tabs: queue, AI runs in 24 h, storage (07 §1.9 layout item 2). */
export function StatusChips({ chips }: { chips: readonly PanelChip[] }) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID="panel-chips">
      {chips.map((chip) => (
        <View key={chip.key} testID={`panel-chip-${chip.key}`}>
          <Chip label={chip.label} tone={chip.tone} />
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
