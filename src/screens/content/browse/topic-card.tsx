import type { TopicListItem } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { Button, NavCard } from '@/ui';

export type TopicCardProps = {
  topic: TopicListItem;
  onOpen: (topic: TopicListItem) => void;
  /** DEVELOPER only: shows the «Удалить» button. */
  onDelete?: (topic: TopicListItem) => void;
};

/**
 * Card of the topics list (docs/spec/07-developer-content.md §1.1 item 4): kicker, title on two reserved
 * lines, «24 номера · 3 активных», then «Открыть» and — for a developer — «Удалить».
 */
export function TopicCard({ topic, onOpen, onDelete }: TopicCardProps) {
  const { dict, m, locale } = useI18n();
  const t = dict.topics.list;
  const meta = `${plural(locale, topic.totalNumbers, dict.topics.widgets.numberForms)} · ${format(t.activeMeta, { count: topic.studentsWithActivity })}`;

  return (
    <NavCard
      kicker={t.cardKicker}
      title={topic.title}
      meta={meta}
      testID={`topic-card-${topic.id}`}
      footer={
        <>
          <Button
            label={t.open}
            accessibilityLabel={format(m.content.list.openA11y, { title: topic.title })}
            onPress={() => onOpen(topic)}
            testID={`topic-open-${topic.id}`}
          />
          {onDelete ? (
            <Button
              label={dict.topics.widgets.delete}
              accessibilityLabel={format(m.content.list.deleteA11y, { title: topic.title })}
              variant="danger"
              onPress={() => onDelete(topic)}
              testID={`topic-delete-${topic.id}`}
            />
          ) : null}
        </>
      }
    />
  );
}
