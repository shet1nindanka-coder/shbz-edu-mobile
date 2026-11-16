// PLACEHOLDER of `planner.lessonBoard` — the planner area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `planner.lessonBoard` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerLessonBoardScreenProps = ScreenParams['planner.lessonBoard'];

export function PlannerLessonBoardScreen({ lessonId }: PlannerLessonBoardScreenProps) {
  return (
    <ScreenPlaceholder
      screenId="planner.lessonBoard"
      params={{ lessonId }}
      links={[{ screen: 'planner.draftNew', lessonId }, { screen: 'planner.lessons' }]}
    />
  );
}
