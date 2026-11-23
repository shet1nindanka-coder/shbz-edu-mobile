import { View } from 'react-native';

import type { LessonBoardParticipant } from '@/api/types';
import { countByStatus } from '@/domain/number-focus';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, ListRow, Spinner, StatusBar, Text, accessibilityLabelOf } from '@/ui';

import { boardTileStatus, solvedCount } from './board-logic';
import type { CaptionText } from './use-participant-caption';

export type ParticipantRowProps = {
  participant: LessonBoardParticipant;
  /** The one caption of the row: what the student is at. */
  caption: CaptionText;
  /** The AI plan of this student is being built: the set is not there yet. */
  planPending: boolean;
  /** The student whose numbers the panel next to the list shows (tablet). */
  selected?: boolean;
  divider?: boolean;
  onPress: () => void;
};

/**
 * One student of the lesson board (layout: mockups `PT-board`, `T-board`): avatar, name, ONE caption — red
 * when the student needs the teacher — and «2/7», the solved numbers of the set, on the right. A tablet has
 * the room for the bar by result before it. The whole row opens the student's numbers.
 */
export function ParticipantRow({ participant, caption, planPending, selected = false, divider, onPress }: ParticipantRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  const total = participant.items.length;
  const done = solvedCount(participant.items);

  const right = planPending ? (
    <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
  ) : total > 0 ? (
    <View style={styles.right}>
      {theme.tablet ? <StatusBar counts={countByStatus(participant.items.map((item) => ({ status: boardTileStatus(item) })))} style={styles.bar} /> : null}
      <Text variant="smallBold" tabular numberOfLines={1} style={styles.count}>
        {`${done}/${total}`}
      </Text>
    </View>
  ) : undefined;

  return (
    <ListRow
      left={<Avatar name={participant.studentName} tone="neutral" />}
      title={participant.studentName}
      subtitle={caption.text}
      subtitleTone={caption.attention ? 'attention' : 'muted'}
      right={right}
      selected={selected}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={accessibilityLabelOf([
        participant.studentName,
        caption.text,
        total > 0 && !planPending ? format(m.common.numbers.doneOf, { done, total }) : null,
      ])}
      testID={`lesson-participant-toggle-${participant.id}`}
    />
  );
}

const useStyles = makeStyles((t) => ({
  right: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, flexShrink: 0 },
  // Two rows high is as wide as the mockup's bar; it must not stretch with the row.
  bar: { alignSelf: 'center', width: t.sizes.row * 2 },
  count: { minWidth: t.space.xxl, textAlign: 'right' },
}));
