import { useMemo, useRef } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import type { GroupAttendanceLesson, GroupAttendanceResponse } from '@/api/types';
import { formatDateTime, formatMsk } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, PressableScale, Text } from '@/ui';

import { attendanceTotalText, lessonCells, memberAttendanceSummary, type AttendanceCell } from '../logic';
import { AttendancePill } from './attendance-pill';

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

// 108 + 2.5 × 62 + 96 ≈ a 390pt screen: the half-visible third lesson shows that the lessons scroll.
const NAME_WIDTH = 108;
const CELL_WIDTH = 62;
const TOTAL_WIDTH = 96;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 52;

/**
 * The attendance matrix (06 §1.2 item 6, Q4): students down, lessons across, the name column pinned
 * while the lessons scroll sideways. It opens scrolled to the newest lessons and the row totals.
 */
export function AttendanceTable({ members, lessons, busy, disabled, onToggle, onChoose, onOpenLesson }: AttendanceTableProps) {
  const styles = useStyles();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.attendance;
  const labels = dict.planner.attendance.labels;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrolledToEnd = useRef(false);

  const columns = useMemo(
    () =>
      lessons.map((lesson) => ({
        lesson,
        cells: lessonCells(lesson),
        date: formatMsk(lesson.startsAt, 'dayMonthNumeric', locale) ?? '',
      })),
    [lessons, locale],
  );

  return (
    <Card padded={false} style={styles.card} testID="attendance-table">
      <View style={styles.names}>
        <View style={[styles.headerRow, styles.headerCell, styles.nameCell]}>
          <Text variant="kickerSm" numberOfLines={1}>
            {t.student}
          </Text>
        </View>
        {members.map((member) => (
          <View key={member.id} style={[styles.bodyRow, styles.rowCell, styles.nameCell]}>
            <Text variant="captionStrong" color="textStrong" numberOfLines={2}>
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
                <Text variant="captionBold" color={lesson.status === 'ACTIVE' ? 'accentSolid' : 'kicker'} tabular>
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
                  style={[styles.headerCell, styles.lessonCell]}
                  pressedStyle={styles.pressed}
                  testID={`attendance-lesson-${lesson.id}`}
                >
                  {label}
                </PressableScale>
              ) : (
                <View key={lesson.id} accessible accessibilityLabel={title} style={[styles.headerCell, styles.lessonCell]}>
                  {label}
                </View>
              );
            })}
            <View style={[styles.headerCell, styles.totalCell]}>
              <Text variant="kickerSm" numberOfLines={1}>
                {t.total}
              </Text>
            </View>
          </View>

          {members.map((member) => (
            <View key={member.id} style={[styles.row, styles.bodyRow]}>
              {columns.map(({ lesson, cells, date }) => {
                const cell = cells.get(member.id);
                if (!cell) {
                  return (
                    <View
                      key={lesson.id}
                      accessible
                      accessibilityLabel={`${member.name}, ${date}: ${t.notParticipated}`}
                      style={[styles.rowCell, styles.lessonCell]}
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
                    style={[styles.rowCell, styles.lessonCell]}
                    testID={`attendance-cell-${lesson.id}-${member.id}`}
                  >
                    <AttendancePill value={cell.attendance} label={labels[cell.attendance].short} busy={saving || disabled} />
                  </PressableScale>
                );
              })}
              <View style={[styles.rowCell, styles.totalCell]} testID={`attendance-total-${member.id}`}>
                <Text variant="caption" color="textMuted" tabular numberOfLines={1}>
                  {attendanceTotalText(memberAttendanceSummary(member.id, lessons))}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flexDirection: 'row', overflow: 'hidden' },
  names: { width: NAME_WIDTH, borderRightWidth: t.borders.hairline, borderRightColor: t.colors.rowBorder },
  scroll: { flex: 1 },
  // Both columns build their rows from the same two boxes, so the pinned names stay level with the cells.
  row: { flexDirection: 'row', alignItems: 'stretch' },
  headerRow: { height: HEADER_HEIGHT },
  bodyRow: { height: ROW_HEIGHT, borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  headerCell: { justifyContent: 'center' },
  rowCell: { justifyContent: 'center' },
  nameCell: { paddingLeft: t.space.md, paddingRight: t.space.xs },
  lessonCell: { width: CELL_WIDTH, alignItems: 'center' },
  totalCell: { width: TOTAL_WIDTH, alignItems: 'flex-end', paddingRight: t.space.md, paddingLeft: t.space.xxs },
  pressed: { opacity: 0.6 },
}));
