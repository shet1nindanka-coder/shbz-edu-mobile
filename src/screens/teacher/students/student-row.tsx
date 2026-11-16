import { View } from 'react-native';

import type { TeacherStudentListItem } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, IconButton, PressableScale, Text } from '@/ui';

export type StudentRowProps = {
  student: TeacherStudentListItem;
  /** Tap on the row: open the student's card. */
  onOpen: (student: TeacherStudentListItem) => void;
  /** "⋯" or a long press: copy login / reset password / delete. */
  onActions: (student: TeacherStudentListItem) => void;
};

/**
 * One student of the list (docs/spec/04-teacher-students.md S2, mobile note): name and login; the row
 * opens the card, the trailing "⋯" opens the actions the site shows as three buttons. The two controls
 * are siblings, never nested, so each has its own touch target.
 */
export function StudentRow({ student, onOpen, onActions }: StudentRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.students.list;

  return (
    <View style={[styles.card, theme.shadows.card]} testID={`student-row-${student.id}`}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${student.name}. ${t.loginLabel}: ${student.email}`}
        accessibilityHint={t.viewProgress}
        onPress={() => onOpen(student)}
        onLongPress={() => onActions(student)}
        scaleTo={1}
        pressedStyle={styles.pressed}
        style={styles.main}
        testID={`student-open-${student.id}`}
      >
        <Avatar name={student.name} />
        <View style={styles.texts}>
          <Text variant="bodyBold" numberOfLines={1}>
            {student.name}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {student.email}
          </Text>
        </View>
      </PressableScale>
      <IconButton
        icon="more"
        variant="ghost"
        accessibilityLabel={format(m.teacher.students.actionsFor, { name: student.name })}
        onPress={() => onActions(student)}
        style={styles.more}
        testID={`student-actions-${student.id}`}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.cardBorder,
    backgroundColor: t.colors.cardBg,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: t.space.md,
    paddingLeft: t.space.gutter,
    paddingRight: t.space.xxs,
    // Follows the card's left corners so the pressed tint does not spill over them.
    borderTopLeftRadius: t.radii.lg - t.borders.hairline,
    borderBottomLeftRadius: t.radii.lg - t.borders.hairline,
  },
  pressed: { backgroundColor: t.colors.softBg },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  more: { marginRight: t.space.xs },
}));
