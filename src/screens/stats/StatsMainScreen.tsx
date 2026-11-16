// PLACEHOLDER of `stats.main` — the stats area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import { ScreenPlaceholder } from '@/screens/shell';

export function StatsMainScreen() {
  return <ScreenPlaceholder screenId="stats.main" links={[{ screen: 'content.topicEdit', topicId: 'top_empty' }]} />;
}
