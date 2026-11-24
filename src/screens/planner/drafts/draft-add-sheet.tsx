import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Button, PressableScale, Text } from '@/ui';

import { freeTopicNumbers, numberGridColumns } from './drafts-logic';

export type DraftAddSheetProps = {
  visible: boolean;
  /** Every number of the draft's topic, in the topic's order. */
  topicNumbers: readonly { id: string; number: string }[];
  /** Numbers already in the participant's set: they are not offered. */
  existingIds: readonly string[];
  onClose: () => void;
  /** The sheet has left the screen: the place to bring back the sheet it was opened from. */
  onClosed?: () => void;
  onAdd: (homeworkNumberId: string) => void;
};

/** Narrowest tile: «051001» in the tabular bold face with its padding. */
const TILE_MIN_WIDTH = 84;
/** Share of the window the grid may take; the title and the footer need the rest. */
const GRID_MAX_SHARE = 0.5;

type FreeNumber = { id: string; number: string };

/**
 * "Add a problem" of a draft (docs/spec/05-teacher-lessons-plans.md §1.7 "Manual add"): only numbers of the
 * draft's single topic that are not in the set yet. The site's select + «Добавить» become a grid of number
 * tiles in one sheet: pick a tile (it turns ink, like the current number everywhere else), then add. The
 * sheet says nothing but its title — the grid is the instruction. The student's status is not checked here
 * — a solved number surfaces as a conflict when the homework is assigned.
 *
 * A topic may hold up to 2000 numbers (the `parseNumbersInput` limit), so the grid is virtualised
 * (FlashList in a box of bounded height): mounting every tile at once froze the sheet for seconds.
 */
export function DraftAddSheet({ visible, topicNumbers, existingIds, onClose, onClosed, onAdd }: DraftAddSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const window = useWindowDimensions();
  const { dict, m } = useI18n();
  const common = dict.planner.common;

  const free = useMemo(() => freeTopicNumbers(topicNumbers, existingIds), [topicNumbers, existingIds]);
  const [numberId, setNumberId] = useState<string | null>(null);
  const picked = numberId !== null && free.some((number) => number.id === numberId) ? numberId : null;
  // The measured grid box (it reaches half a gap past the content on each side); until then the
  // sheet's content is the window less its gutters.
  const [gridWidth, setGridWidth] = useState(0);

  const gap = theme.space.sm;
  const width = gridWidth > 0 ? gridWidth - gap : window.width - 2 * theme.space.gutter;
  const columns = numberGridColumns(width, TILE_MIN_WIDTH, gap);
  const rowStride = theme.sizes.tile + gap;
  const rows = Math.ceil(free.length / columns);
  // A short topic is as tall as its rows; a long one scrolls inside the cap.
  const gridHeight = Math.min(rows * rowStride, Math.round(window.height * GRID_MAX_SHARE));
  // The height is only the preferred size: in a short window (split screen, a large font scale) the sheet's
  // cap is lower than title + grid + footer, and the grid gives way — down to one row — so its viewport ends
  // above the pinned footer and the last tiles can still be scrolled to and picked.
  const gridMinHeight = Math.min(gridHeight, rowStride);

  const add = () => {
    if (!picked) return;
    onAdd(picked);
    onClose();
  };

  const renderTile = ({ item: number }: { item: FreeNumber }) => {
    const selected = number.id === picked;
    return (
      <View style={[styles.cell, { paddingHorizontal: gap / 2, paddingBottom: gap }]}>
        <PressableScale
          accessibilityRole="radio"
          accessibilityLabel={format(common.numberSign, { n: number.number })}
          accessibilityState={{ selected, checked: selected }}
          onPress={() => setNumberId(number.id)}
          testID={`draft-add-number-${number.id}`}
          style={[styles.tile, selected ? styles.tileSelected : null]}
        >
          <Text variant="tile" tabular color={selected ? 'tabActiveText' : 'label'}>
            {number.number}
          </Text>
        </PressableScale>
      </View>
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        setNumberId(null);
        onClosed?.();
      }}
      closeLabel={m.common.actions.close}
      title={dict.planner.lessonManualAdd.label}
      footer={<Button label={common.add} fullWidth disabled={!picked} onPress={add} testID="draft-add-submit" />}
      // The grid scrolls by itself (FlashList), not the sheet.
      scroll={false}
      // Without a ScrollView the body must shrink itself, or it overflows under the footer.
      contentStyle={styles.shrink}
      testID="draft-add-sheet"
    >
      <View style={styles.content}>
        {free.length > 0 ? (
          <>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={m.planner.draftBoard.numbersAria}
              onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
              style={[styles.shrink, { height: gridHeight, minHeight: gridMinHeight, marginHorizontal: -gap / 2 }]}
            >
              <FlashList
                // A new column count is a new layout: remount instead of reflowing the recycled cells.
                key={columns}
                data={free}
                numColumns={columns}
                keyExtractor={(number) => number.id}
                renderItem={renderTile}
                // The selection lives outside the rows.
                extraData={picked}
                showsVerticalScrollIndicator={false}
                testID="draft-add-numbers"
              />
            </View>
          </>
        ) : (
          <Text variant="small" color="textMuted" testID="draft-add-none">
            {/* An empty topic is not "every number already in the set": the set may well be empty. */}
            {topicNumbers.length === 0 ? m.planner.lessonBoard.noNumbers : m.planner.lessonBoard.noFreeNumbers}
          </Text>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { flexShrink: 1, minHeight: 0, gap: t.space.md, paddingBottom: t.space.sm },
  shrink: { flexShrink: 1, minHeight: 0 },
  cell: { flex: 1 },
  // The kit's number tile without a status; the picked one is the ink "current" tile.
  tile: {
    height: t.sizes.tile,
    paddingHorizontal: t.space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.md,
    backgroundColor: t.colors.soft2,
  },
  tileSelected: { backgroundColor: t.colors.tabActiveBg },
}));
