import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useTheme } from '@/theme';
import { Segmented } from '@/ui';

export type PlannerSegmentsProps = {
  /** Which of the two lists is on screen. */
  active: 'lessons' | 'drafts';
};

/**
 * The two-segment switch of the teacher's «занятия» section (90-addendum-2 N1): «Уроки» and «Домашние
 * задания» — one section, one highlighted tab, like the site's `isPlannerPath`. Both section roots put it
 * into the header `aside`: next to the title on a tablet, in a full-width row under it on a phone.
 * Switching replaces the list instead of pushing, so "back" never walks between segments.
 */
export function PlannerSegments({ active }: PlannerSegmentsProps) {
  const { dict, m } = useI18n();
  const theme = useTheme();
  const navigation = useAppNavigation();
  return (
    <Segmented
      // A phone gives the switch its own row; in the tablet header it is as wide as its labels.
      fill={!theme.tablet}
      role="tab"
      accessibilityLabel={m.shell.tabs.lessons}
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
