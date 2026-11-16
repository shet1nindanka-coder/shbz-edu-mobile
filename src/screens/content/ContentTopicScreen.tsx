// PLACEHOLDER of `content.topic` — the content area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `content.topic` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentTopicScreenProps = ScreenParams['content.topic'];

export function ContentTopicScreen({ topicId }: ContentTopicScreenProps) {
  return (
    <ScreenPlaceholder
      screenId="content.topic"
      params={{ topicId }}
      links={[{ screen: 'content.topicEdit', topicId }, { screen: 'content.number', topicId, number: '010203' }]}
    />
  );
}
