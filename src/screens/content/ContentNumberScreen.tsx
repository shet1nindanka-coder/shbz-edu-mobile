// PLACEHOLDER of `content.number` — the content area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `content.number` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentNumberScreenProps = ScreenParams['content.number'];

export function ContentNumberScreen({ topicId, number }: ContentNumberScreenProps) {
  return <ScreenPlaceholder screenId="content.number" params={{ topicId, number }} />;
}
