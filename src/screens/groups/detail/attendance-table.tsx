import { useMemo, useRef } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import type { GroupAttendanceLesson, GroupAttendanceResponse } from '@/api/types';
import { formatDateTime, formatMsk } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, PressableScale, Text, useInsideSurface } from '@/ui';

import { attendanceRatioText, attendanceTotalText, lessonCells, memberAttendanceSummary, type AttendanceCell } from '../logic';
import { AttendanceTile, useAttendanceTileLabel } from './attendance-tile';

type Member = GroupAttendanceResponse['members'][number];

export type AttendanceTableProps = {
  members: readonly Member[];
  /** Ordered by start time, oldest first. */
  lessons: readonly GroupAttendanceLesson[];
  /** Participants whose mark is being saved. */
  busy: ReadonlySet<string>;
  /** Marking is switched off (the rate limit is cooling down). */
  disabled: boolean;
  /** Tap: the next mark of the cycle. */
  onToggle: (lesson: GroupAttendanceLesson, member: Member, cell: AttendanceCell) => void;
  /** Long press: choose a mark explicitly. */
  onChoose: (lesson: GroupAttendanceLesson, member: Member, cell: AttendanceCell) => void;
  /** Absent when the role has no lesson board: the dates are then plain text. */
  onOpenLesson?: (lesson: GroupAttendanceLesson) => void;
};

// The name column: a phone keeps room for the tiles (the lessons scroll sideways), a tablet panel has
// the width for a whole name.
const NAME_WIDTH = { phone: 112, tablet: 200 } as const;
const TOTAL_WIDTH = 64;

/**
 * The attendance matrix (06 §1.2 item 6, Q4; mockup `T-groups`): students down, lessons across, every
 * mark a 44 pt tile. The name column is pinned while the lessons scroll sideways; the table opens
 * scrolled to the newest lessons and the row totals. The header row holds the dates only: the names and
 * the «5/6» totals need no column titles (the totals say «Итого» to a screen reader).
 */
export function AttendanceTable({ members, lessons, busy, disabled, onToggle, onChoose, onOpenLesson }: AttendanceTableProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inside = useInsideSurface();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.attendance;
  const labels = dict.planner.attendance.labels;
  const tileLabel = useAttendanceTileLabel();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrolledToEnd = useRef(false);
  const nameWidth = theme.tablet ? NAME_WIDTH.tablet : NAME_WIDTH.phone;

  const columns = useMemo(
    () =>
      lessons.map((lesson) => ({
        lesson,
        cells: lessonCells(lesson),
        date: formatMsk(lesson.startsAt, 'dayMonthNumeric', locale) ?? '',
      })),
    [lessons, locale],
  );

  const table = (
    // The clip lives on an inner box: on iOS `overflow: hidden` on the card itself would clip its own
    // layer shadow (clipsToBounds), and this card would be the only one without one.
    <View style={[styles.clip, inside ? null : styles.clipCard]}>
      <View style={{ width: nameWidth }}>
        <View style={styles.headerRow} />
        {members.map((member) => (
          <View key={member.id} style={[styles.bodyRow, styles.cell, inside ? null : styles.nameCell]}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {member.name}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        // The newest lessons and the totals are what a teacher marks: start at the right edge, once.
        onContentSizeChange={() => {
          if (scrolledToEnd.current) return;
          scrolledToEnd.current = true;
          scrollRef.current?.scrollToEnd({ animated: false });
        }}
        testID="attendance-table-scroll"
      >
        <View>
          <View style={[styles.row, styles.headerRow]}>
            {columns.map(({ lesson, date }) => {
              const label = (
                <Text variant="smallStrong" color={lesson.status === 'ACTIVE' ? 'accentSolid' : 'textMuted'} tabular>
                  {date}
                </Text>
              );
              const title = `${lesson.title} · ${formatDateTime(lesson.startsAt, locale)}`;
              return onOpenLesson ? (
                <PressableScale
                  key={lesson.id}
                  accessibilityRole="link"
                  accessibilityLabel={format(m.groups.attendance.openLessonAria, {
                    title: lesson.title,
                    date: formatDateTime(lesson.startsAt, locale),
                  })}
                  onPress={() => onOpenLesson(lesson)}
                  scaleTo={1}
                  style={[styles.cell, styles.lessonCell]}
                  pressedStyle={styles.pressed}
                  testID={`attendance-lesson-${lesson.id}`}
                >
                  {label}
                </PressableScale>
              ) : (
                <View key={lesson.id} accessible accessibilityLabel={title} style={[styles.cell, styles.lessonCell]}>
                  {label}
                </View>
              );
            })}
            <View style={[styles.totalCell, inside ? null : styles.totalCellCard]} />
          </View>

          {members.map((member) => {
            const total = memberAttendanceSummary(member.id, lessons);
            return (
              <View key={member.id} style={[styles.row, styles.bodyRow]}>
                {columns.map(({ lesson, cells, date }) => {
                  const cell = cells.get(member.id);
                  if (!cell) {
                    return (
                      <View
                        key={lesson.id}
                        accessible
                        accessibilityLabel={`${member.name}, ${date}: ${t.notParticipated}`}
                        style={[styles.cell, styles.lessonCell]}
                      >
                        <Text variant="bodyBold" color="textSoft">
                          ·
                        </Text>
                      </View>
                    );
                  }
                  const saving = busy.has(cell.participantId);
                  return (
                    <PressableScale
                      key={lesson.id}
                      accessibilityRole="button"
                      accessibilityLabel={format(m.groups.attendance.cellAria, {
                        name: member.name,
                        date,
                        mark: labels[cell.attendance].label,
                      })}
                      accessibilityState={{ disabled: disabled || saving, busy: saving }}
                      disabled={disabled || saving}
                      onPress={() => onToggle(lesson, member, cell)}
                      onLongPress={() => onChoose(lesson, member, cell)}
                      style={[styles.cell, styles.lessonCell]}
                      testID={`attendance-cell-${lesson.id}-${member.id}`}
                    >
                      <AttendanceTile value={cell.attendance} label={tileLabel(cell.attendance)} dimmed={saving || disabled} />
                    </PressableScale>
                  );
                })}
                <View
                  accessible
                  // The percent stays for the ear; the eye has the row of tiles.
                  accessibilityLabel={`${t.total}: ${attendanceTotalText(total)}`}
                  style={[styles.cell, styles.totalCell, inside ? null : styles.totalCellCard]}
                  testID={`attendance-total-${member.id}`}
                >
                  <Text variant="bodyBold" tabular numberOfLines={1}>
                    {attendanceRatioText(total, m.common.numbers.doneOf)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  // On the page the table is a card; inside a tablet panel — already a card — it lies flat.
  return inside ? (
    <View testID="attendance-table">{table}</View>
  ) : (
    <Card padded={false} testID="attendance-table">
      {table}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  clip: { flexDirection: 'row' },
  clipCard: { overflow: 'hidden', borderRadius: t.radii.xl },
  scroll: { flex: 1 },
  // The totals sit at the right edge of the card also when a few lessons leave room.
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  // Both columns build their rows from the same two boxes, so the pinned names stay level with the tiles.
  row: { flexDirection: 'row', alignItems: 'stretch' },
  headerRow: { height: t.sizes.control.md },
  bodyRow: { height: t.sizes.row, borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  cell: { justifyContent: 'center' },
  nameCell: { paddingLeft: t.space.card, paddingRight: t.space.xs },
  // A 44 tile and the gap to the next one.
  lessonCell: { width: t.sizes.tile + t.space.xs, alignItems: 'center' },
  totalCell: { width: TOTAL_WIDTH, alignItems: 'flex-end', paddingLeft: t.space.xs },
  totalCellCard: { width: TOTAL_WIDTH + t.space.card, paddingRight: t.space.card },
  pressed: { opacity: 0.6 },
}));
