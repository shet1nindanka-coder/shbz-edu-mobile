import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, PressableScale, Text } from '@/ui';

import { freeTopicNumbers } from './drafts-logic';

export type DraftAddSheetProps = {
  visible: boolean;
  /** Whose set gets the number (shown under the title). */
  studentName: string;
  topicTitle: string;
  /** Every number of the draft's topic, in the topic's order. */
  topicNumbers: readonly { id: string; number: string }[];
  /** Numbers already in the participant's set: they are not offered. */
  existingIds: readonly string[];
  onClose: () => void;
  onAdd: (homeworkNumberId: string) => void;
};

/**
 * "Add a problem" of a draft (docs/spec/05-teacher-lessons-plans.md §1.7 "Manual add"): only numbers of the
 * draft's single topic that are not in the set yet. The site's select + «Добавить» become a grid of number
 * tiles in one sheet: pick a tile, then add. The student's status is not checked here — a solved number
 * surfaces as a conflict when the homework is assigned.
 */
export function DraftAddSheet({ visible, studentName, topicTitle, topicNumbers, existingIds, onClose, onAdd }: DraftAddSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const common = dict.planner.common;

  const free = useMemo(() => freeTopicNumbers(topicNumbers, existingIds), [topicNumbers, existingIds]);
  const [numberId, setNumberId] = useState<string | null>(null);
  const picked = numberId !== null && free.some((number) => number.id === numberId) ? numberId : null;

  const add = () => {
    if (!picked) return;
    onAdd(picked);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => setNumberId(null)}
      closeLabel={m.common.actions.close}
      title={format(dict.planner.homeworkPlans.board.addNumber, { topic: topicTitle })}
      footer={<Button label={common.add} fullWidth disabled={!picked} onPress={add} testID="draft-add-submit" />}
      testID="draft-add-sheet"
    >
      <View style={styles.content}>
        <Text variant="small" color="textMuted">
          {studentName}
        </Text>
        {free.length > 0 ? (
          <>
            <Text variant="label">{common.pickNumber}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={m.planner.draftBoard.numbersAria} style={styles.grid}>
              {free.map((number) => {
                const selected = number.id === picked;
                return (
                  <PressableScale
                    key={number.id}
                    accessibilityRole="radio"
                    accessibilityLabel={format(common.numberSign, { n: number.number })}
                    accessibilityState={{ selected, checked: selected }}
                    onPress={() => setNumberId(number.id)}
                    testID={`draft-add-number-${number.id}`}
                    style={[styles.tile, selected ? styles.tileSelected : null]}
                  >
                    <Text variant="smallBold" tabular color={selected ? 'greenText' : 'textStrong'}>
                      {format(common.numberSign, { n: number.number })}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </>
        ) : (
          <Text variant="small" color="textMuted" testID="draft-add-none">
            {m.planner.lessonBoard.noFreeNumbers}
          </Text>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  tile: {
    minWidth: 84,
    minHeight: t.sizes.minTouch,
    paddingHorizontal: t.space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  tileSelected: { borderColor: t.colors.accentSolid, backgroundColor: t.colors.accentSoft },
}));
