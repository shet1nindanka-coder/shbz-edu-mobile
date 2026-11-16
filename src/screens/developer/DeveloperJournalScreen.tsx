// PLACEHOLDER of `developer.journal` — the developer area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `developer.journal` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type DeveloperJournalScreenProps = ScreenParams['developer.journal'];

export function DeveloperJournalScreen({ outcome, days }: DeveloperJournalScreenProps) {
  return <ScreenPlaceholder screenId="developer.journal" params={{ outcome, days }} />;
}
