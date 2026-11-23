import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

import type { PanelFigure } from './logic';

/**
 * The strip above the panel tabs that are not «Статус» (07 §1.9 layout item 2): queue, AI runs in 24 h and
 * storage as three plain figures of one card. Only a value that signals a problem is coloured.
 */
export function StatusChips({ figures }: { figures: readonly PanelFigure[] }) {
  const styles = useStyles();
  return (
    <Card testID="panel-chips">
      <View style={styles.row}>
        {figures.map((figure) => (
          <View
            key={figure.key}
            accessible
            accessibilityLabel={`${figure.caption}: ${figure.value}`}
            style={styles.figure}
            testID={`panel-chip-${figure.key}`}
          >
            <Text variant="cardTitle" color={figure.attention ? 'redText' : 'textStrong'} tabular numberOfLines={1}>
              {figure.value}
            </Text>
            <Text variant="small" color="textMuted" numberOfLines={2}>
              {figure.caption}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md },
  figure: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
