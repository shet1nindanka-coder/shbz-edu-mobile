// PLACEHOLDER of `content.topics` — the content area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import { ScreenPlaceholder } from '@/screens/shell';

export function ContentTopicsScreen() {
  return <ScreenPlaceholder screenId="content.topics" links={[{ screen: 'content.topic', topicId: 'top_linear' }]} />;
}
