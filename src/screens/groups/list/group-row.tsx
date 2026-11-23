import type { GroupListItem } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { ListRow } from '@/ui';

import { groupRowCaption } from '../logic';

export type GroupRowProps = {
  group: GroupListItem;
  /** Tablet: the group the panel next to the list shows. */
  selected?: boolean;
  divider: boolean;
  onOpen: (group: GroupListItem) => void;
};

/**
 * One group of the list (06 §1.1; docs/design/glass-over-paper.md §1 rule 2): the name and one caption —
 * «8 класс · 4 ученика». The whole row opens the group; composing a lesson is the group's own main action.
 */
export function GroupRow({ group, selected = false, divider, onOpen }: GroupRowProps) {
  const { locale, dict, m } = useI18n();
  const caption = groupRowCaption(group, plural(locale, group.membersCount, dict.planner.common.studentForms), dict.planner.groups.list);
  return (
    <ListRow
      title={group.name}
      // Two lines: there is no tooltip on a phone to read a name the site cuts at one.
      titleLines={2}
      subtitle={caption}
      selected={selected}
      divider={divider}
      onPress={() => onOpen(group)}
      accessibilityLabel={`${format(m.groups.list.openGroupAria, { name: group.name })}. ${caption}`}
      testID={`group-open-${group.id}`}
    />
  );
}
