import type { TopicListItem } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { ListRow } from '@/ui';

export type TopicRowProps = {
  topic: TopicListItem;
  onOpen: (topic: TopicListItem) => void;
  /** Tablet: the topic shown in the panel next to the list. */
  selected?: boolean;
  /** Hairline under the row; off on the last one. */
  divider?: boolean;
};

/**
 * Row of the topics list (docs/spec/07-developer-content.md §1.1 item 4; layout:
 * docs/design/glass-over-paper.md §1a): the title and, on the right, how many numbers the topic has — a
 * bare figure. «24 номера · 3 активных» is spoken, not shown. The whole row opens the topic; editing and
 * deleting live on the topic's own screens.
 */
export function TopicRow({ topic, onOpen, selected = false, divider = true }: TopicRowProps) {
  const { dict, m, locale } = useI18n();
  const facts = `${plural(locale, topic.totalNumbers, dict.topics.widgets.numberForms)} · ${format(dict.topics.list.activeMeta, { count: topic.studentsWithActivity })}`;

  return (
    <ListRow
      title={topic.title}
      titleLines={2}
      meta={String(topic.totalNumbers)}
      selected={selected}
      divider={divider}
      onPress={() => onOpen(topic)}
      accessibilityLabel={`${format(m.content.list.openA11y, { title: topic.title })}. ${facts}`}
      testID={`topic-card-${topic.id}`}
    />
  );
}
