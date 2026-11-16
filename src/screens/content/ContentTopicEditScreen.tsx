// PLACEHOLDER of `content.topicEdit` — the content area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `content.topicEdit` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentTopicEditScreenProps = ScreenParams['content.topicEdit'];

export function ContentTopicEditScreen({ topicId }: ContentTopicEditScreenProps) {
  return <ScreenPlaceholder screenId="content.topicEdit" params={{ topicId }} />;
}
