import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Segmented } from '@/ui';

export type PlannerSegmentsProps = {
  /** Which of the two lists is on screen. */
  active: 'lessons' | 'drafts';
};

/**
 * The two-segment root of the teacher's «занятия» section (90-addendum-2 N1): «Уроки» and «Домашние
 * задания» — one section, one highlighted tab, like the site's `isPlannerPath`. Both list screens put it
 * at the top; switching replaces the list instead of pushing, so "back" never walks between segments.
 */
export function PlannerSegments({ active }: PlannerSegmentsProps) {
  const { dict } = useI18n();
  const navigation = useAppNavigation();
  return (
    <Segmented
      fill
      plain
      role="tab"
      options={[
        { value: 'lessons', label: dict.planner.lessonsList.kicker },
        { value: 'drafts', label: dict.planner.homeworkPlans.list.kicker },
      ]}
      value={active}
      onChange={(next) => navigation.replace({ screen: next === 'lessons' ? 'planner.lessons' : 'planner.drafts' })}
      testID="planner-segments"
    />
  );
}
