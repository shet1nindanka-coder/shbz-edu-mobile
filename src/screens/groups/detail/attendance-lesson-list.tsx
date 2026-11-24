import { useState } from 'react';
import { View } from 'react-native';

import type { AttendanceStatus, GroupAttendanceLesson, GroupAttendanceResponse } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { IconButton, ListCard, PressableScale, Select, Text, useRowInset } from '@/ui';

import { defaultAttendanceLessonId, lessonCells, shortDateTime, type AttendanceCell } from '../logic';
import { AttendanceTile, useAttendanceTileLabel } from './attendance-tile';

type Member = GroupAttendanceResponse['members'][number];

/** The marks a teacher sets by hand, in the order of the tap cycle. */
export const MANUAL_MARKS: readonly AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

export type AttendanceLessonListProps = {
  members: readonly Member[];
  /** Ordered by start time, oldest first. */
  lessons: readonly GroupAttendanceLesson[];
  busy: ReadonlySet<string>;
  disabled: boolean;
  /** The current instant (a coarse tick): a lesson of another year shows its year. */
  now: number;
  onSet: (lesson: GroupAttendanceLesson, cell: AttendanceCell, value: AttendanceStatus) => void;
  onOpenLesson?: (lesson: GroupAttendanceLesson) => void;
};

/**
 * Attendance of one lesson (06 §1.2 "Mobile translation", Q4 b): pick a lesson — the select names itself
 * by its value, the arrow next to it opens the lesson — then set each participant's mark with an explicit
 * control of four tiles: no cycling, no sideways scrolling.
 */
export function AttendanceLessonList({ members, lessons, busy, disabled, now, onSet, onOpenLesson }: AttendanceLessonListProps) {
  const styles = useStyles();
  const inset = useRowInset();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.attendance;
  const labels = dict.planner.attendance.labels;
  const tileLabel = useAttendanceTileLabel();
  const [picked, setPicked] = useState<string | null>(null);

  // A picked lesson can leave the period; then the default one takes over.
  const lesson =
    lessons.find((row) => row.id === picked) ?? lessons.find((row) => row.id === defaultAttendanceLessonId(lessons)) ?? null;
  if (!lesson) return null;
  const cells = lessonCells(lesson);

  const options = [...lessons].reverse().map((row) => ({
    value: row.id,
    label: format(row.status === 'ACTIVE' ? m.groups.attendance.lessonLive : m.groups.attendance.lessonOption, {
      date: shortDateTime(row.startsAt, now, locale),
      title: row.title,
    }),
  }));

  return (
    <View style={styles.list} testID="attendance-lesson-list">
      <View style={styles.head}>
        <Select
          accessibilityLabel={m.groups.attendance.lessonLabel}
          sheetTitle={m.groups.attendance.lessonLabel}
          options={options}
          value={lesson.id}
          onChange={setPicked}
          placeholder={m.groups.attendance.lessonLabel}
          closeLabel={m.common.actions.close}
          style={styles.select}
          testID="attendance-lesson-select"
        />
        {onOpenLesson ? (
          <IconButton
            icon="forward"
            accessibilityLabel={format(m.groups.attendance.openLessonAria, {
              title: lesson.title,
              date: formatDateTime(lesson.startsAt, locale),
            })}
            onPress={() => onOpenLesson(lesson)}
            testID="attendance-lesson-open"
          />
        ) : null}
      </View>

      <ListCard>
        {members.map((member, index) => {
          const cell = cells.get(member.id);
          const saving = cell ? busy.has(cell.participantId) : false;
          return (
            <View
              key={member.id}
              style={[styles.row, inset === undefined ? styles.rowInset : null, index > 0 ? styles.rowBorder : null]}
            >
              <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
                {member.name}
              </Text>
              {cell ? (
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={format(m.groups.attendance.markAria, {
                    name: member.name,
                    mark: labels[cell.attendance].label,
                  })}
                  style={styles.marks}
                >
                  {MANUAL_MARKS.map((value) => {
                    const selected = cell.attendance === value;
                    return (
                      <PressableScale
                        key={value}
                        accessibilityRole="radio"
                        accessibilityLabel={format(m.groups.attendance.markAria, { name: member.name, mark: labels[value].label })}
                        accessibilityState={{ selected, disabled: disabled || saving, busy: saving }}
                        disabled={disabled || saving}
                        onPress={() => {
                          if (!selected) onSet(lesson, cell, value);
                        }}
                        testID={`attendance-mark-${member.id}-${value}`}
                      >
                        <AttendanceTile value={value} label={tileLabel(value)} idle={!selected} dimmed={disabled || saving} />
                      </PressableScale>
                    );
                  })}
                </View>
              ) : (
                // The same dot as in the table; the words are spoken.
                <View accessible accessibilityLabel={`${member.name}: ${t.notParticipated}`} style={styles.absent}>
                  <Text variant="bodyBold" color="textSoft">
                    ·
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ListCard>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: t.space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  select: { flex: 1, minWidth: 0 },
  row: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  rowInset: { marginHorizontal: t.space.card },
  rowBorder: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  name: { flex: 1, minWidth: 0 },
  marks: { flexDirection: 'row', gap: t.space.xs },
  absent: { width: t.sizes.tile, height: t.sizes.tile, alignItems: 'center', justifyContent: 'center' },
}));
