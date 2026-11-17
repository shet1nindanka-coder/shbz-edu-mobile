import { View } from 'react-native';

import type { GroupListItem } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Card, Chip, PressableScale, Text, useTextScale } from '@/ui';

import { groupCardSubline, memberNamesLine } from '../logic';

export type GroupCardProps = {
  group: GroupListItem;
  onOpen: (group: GroupListItem) => void;
  /** Absent when the role cannot compose lessons: the button is not rendered. */
  onComposeLesson?: (group: GroupListItem) => void;
};

/**
 * One group of the list (06 §1.1): name, «8 класс · создана …», the member-count chip, the first three
 * names and the two actions. The text block opens the group too — the usual phone gesture — while the
 * buttons stay the accessible controls, so a screen reader hears each action once.
 */
export function GroupCard({ group, onOpen, onComposeLesson }: GroupCardProps) {
  const styles = useStyles();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.list;
  const common = dict.planner.common;
  // Large text: the member chip moves under a name that does not fit beside it, instead of squeezing it.
  const { large } = useTextScale();

  return (
    <Card testID={`group-card-${group.id}`}>
      <PressableScale accessible={false} scaleTo={1} onPress={() => onOpen(group)} style={styles.summary}>
        <View style={[styles.titleRow, large ? styles.titleRowWrap : null]}>
          <View style={large ? styles.titleBlockWrap : styles.titleBlock}>
            {/* Two lines: there is no tooltip on a phone to read a name the site cuts at one. */}
            <Text variant="cardTitle" numberOfLines={2}>
              {group.name}
            </Text>
            <Text variant="caption" color="textMuted" style={styles.subline}>
              {groupCardSubline(group, t, locale)}
            </Text>
          </View>
          <Chip tone="green" label={plural(locale, group.membersCount, common.studentForms)} />
        </View>
        {/* Two lines, so «и ещё N» after three full names is not cut off. */}
        <Text variant="small" color="textMuted" numberOfLines={2} style={styles.members}>
          {memberNamesLine(group.members, t)}
        </Text>
      </PressableScale>
      <View style={styles.actions}>
        <Button
          label={common.open}
          accessibilityLabel={format(m.groups.list.openGroupAria, { name: group.name })}
          variant="outline"
          onPress={() => onOpen(group)}
          style={styles.action}
          testID={`group-open-${group.id}`}
        />
        {onComposeLesson ? (
          <Button
            label={t.composeLesson}
            onPress={() => onComposeLesson(group)}
            style={styles.action}
            testID={`group-compose-${group.id}`}
          />
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  summary: { alignSelf: 'stretch' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.space.md },
  titleBlock: { flex: 1, minWidth: 0 },
  titleRowWrap: { flexWrap: 'wrap', rowGap: t.space.xs },
  titleBlockWrap: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  subline: { marginTop: t.space.xxs },
  members: { marginTop: t.space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, marginTop: t.space.field },
  // Each button keeps the width of its label and they share what is left: a fixed basis cut «Составить урок».
  action: { flexGrow: 1 },
}));
