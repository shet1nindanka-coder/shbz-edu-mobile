import { useState } from 'react';
import { View } from 'react-native';

import type { AttendanceStatus, GroupAttendanceLesson, GroupAttendanceResponse } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { PressableScale, Select, Text, TextButton } from '@/ui';

import { defaultAttendanceLessonId, lessonCells, type AttendanceCell } from '../logic';
import { Rows, useRowInset } from '../shared/rows';
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
  onSet: (lesson: GroupAttendanceLesson, cell: AttendanceCell, value: AttendanceStatus) => void;
  onOpenLesson?: (lesson: GroupAttendanceLesson) => void;
};

/**
 * Attendance of one lesson (06 §1.2 "Mobile translation", Q4 b): pick a lesson, then set each
 * participant's mark with an explicit control of four tiles — no cycling, no sideways scrolling.
 */
export function AttendanceLessonList({ members, lessons, busy, disabled, onSet, onOpenLesson }: AttendanceLessonListProps) {
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
      date: formatDateTime(row.startsAt, locale),
      title: row.title,
    }),
  }));

  return (
    <View style={styles.list} testID="attendance-lesson-list">
      <Select
        label={m.groups.attendance.lessonLabel}
        options={options}
        value={lesson.id}
        onChange={setPicked}
        placeholder={m.groups.attendance.lessonLabel}
        closeLabel={m.common.actions.close}
        testID="attendance-lesson-select"
      />
      {onOpenLesson ? (
        <TextButton
          label={dict.students.lessons.openLesson}
          accessibilityLabel={format(m.groups.attendance.openLessonAria, {
            title: lesson.title,
            date: formatDateTime(lesson.startsAt, locale),
          })}
          onPress={() => onOpenLesson(lesson)}
          style={styles.openLesson}
          testID="attendance-lesson-open"
        />
      ) : null}

      <Rows>
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
                <Text variant="small" color="textMuted" numberOfLines={2} style={styles.absent}>
                  {t.notParticipated}
                </Text>
              )}
            </View>
          );
        })}
      </Rows>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: t.space.md },
  openLesson: { alignSelf: 'flex-start' },
  row: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  rowInset: { marginHorizontal: t.space.card },
  rowBorder: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  name: { flex: 1, minWidth: 0 },
  marks: { flexDirection: 'row', gap: t.space.xs },
  absent: { flexShrink: 1, textAlign: 'right' },
}));
