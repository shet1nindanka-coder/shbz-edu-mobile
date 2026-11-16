// PLACEHOLDER of `developer.panel` — the developer area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `developer.panel` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type DeveloperPanelScreenProps = ScreenParams['developer.panel'];

export function DeveloperPanelScreen({ tab }: DeveloperPanelScreenProps) {
  return (
    <ScreenPlaceholder
      screenId="developer.panel"
      params={{ tab }}
      links={[{ screen: 'developer.journal' }, { screen: 'developer.journal', outcome: 'failed', days: 1 }]}
    />
  );
}
