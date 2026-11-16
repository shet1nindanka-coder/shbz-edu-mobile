import { useState } from 'react';
import { View } from 'react-native';

import type { AttendanceStatus, GroupAttendanceLesson, GroupAttendanceResponse } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, PressableScale, Select, Text, TextButton } from '@/ui';

import { defaultAttendanceLessonId, lessonCells, type AttendanceCell } from '../logic';
import { selectedMarkColors } from './attendance-pill';

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
 * participant's mark with an explicit four-option control — no cycling, no sideways scrolling.
 */
export function AttendanceLessonList({ members, lessons, busy, disabled, onSet, onOpenLesson }: AttendanceLessonListProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.attendance;
  const labels = dict.planner.attendance.labels;
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
        size="sm"
        testID="attendance-lesson-select"
      />
      {onOpenLesson ? (
        <TextButton
          label={m.groups.attendance.openLesson}
          accessibilityLabel={format(m.groups.attendance.openLessonAria, {
            title: lesson.title,
            date: formatDateTime(lesson.startsAt, locale),
          })}
          onPress={() => onOpenLesson(lesson)}
          style={styles.openLesson}
          testID="attendance-lesson-open"
        />
      ) : null}

      <Card padded={false}>
        {/* Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings. */}
        <View style={styles.card}>
          {members.map((member, index) => {
            const cell = cells.get(member.id);
            const saving = cell ? busy.has(cell.participantId) : false;
            return (
              <View key={member.id} style={[styles.row, index > 0 ? styles.rowBorder : null]}>
                <Text variant="smallBold" numberOfLines={1}>
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
                      const colors = selected ? selectedMarkColors(value, theme) : null;
                      return (
                        <PressableScale
                          key={value}
                          accessibilityRole="radio"
                          accessibilityLabel={labels[value].label}
                          accessibilityState={{ selected, disabled: disabled || saving, busy: saving }}
                          disabled={disabled || saving}
                          onPress={() => {
                            if (!selected) onSet(lesson, cell, value);
                          }}
                          style={[
                            styles.mark,
                            colors ? { backgroundColor: colors.bg, borderColor: colors.border } : null,
                            disabled || saving ? styles.markDisabled : null,
                          ]}
                          testID={`attendance-mark-${member.id}-${value}`}
                        >
                          <Text
                            variant="captionBold"
                            numberOfLines={1}
                            style={{ color: colors ? colors.text : theme.status.idle.text }}
                          >
                            {labels[value].short}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                ) : (
                  <Text variant="small" color="textSoft">
                    {t.notParticipated}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: t.space.md },
  openLesson: { alignSelf: 'flex-start' },
  card: { paddingHorizontal: t.space.gutter },
  row: { gap: t.space.sm, paddingVertical: t.space.gutter },
  rowBorder: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  marks: { flexDirection: 'row', gap: t.space.xs },
  mark: {
    flex: 1,
    minWidth: 0,
    minHeight: t.sizes.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.space.xxs,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.status.idle.border,
    backgroundColor: t.status.idle.bg,
  },
  markDisabled: { opacity: 0.6 },
}));
