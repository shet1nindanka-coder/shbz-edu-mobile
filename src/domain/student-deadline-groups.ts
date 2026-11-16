// Ported from the site (lib/student-deadline-groups.ts). [MOBILE] `StudentDeadline` (a row type the site
// derives from a Prisma query) is declared here with the fields the grouping reads, and the deadline item
// carries `assignmentId` instead of the site URL `href` (navigation is the app's job).
import { HomeworkNumberStatus } from "@/domain/enums";
import { homeworkAssignmentLabel } from "@/domain/homework-label";
import type { Locale } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { toIsoDateTimeString } from "@/domain/utils";

export type StudentDeadlineAssignmentStatus = "DONE" | "IN_PROGRESS" | "NOT_STARTED";

/** One number with a deadline (a `StudentTopicNumberStatus` row joined with its topic). */
export type StudentDeadline = {
  id: string;
  homeworkNumberId: string;
  homeworkNumber: string;
  topicId: string;
  topicTitle: string;
  status: HomeworkNumberStatus | null;
  deadlineAt: Date | string;
};

export type StudentDeadlineAssignment = {
  id: string;
  deadlineAt: string;
  topicId: string;
  topicTitle: string;
  totalNumbers: number;
  solvedNumbers: number;
  status: StudentDeadlineAssignmentStatus;
};

type StudentDeadlineInput = Omit<StudentDeadline, "deadlineAt"> & {
  deadlineAt: Date | string;
};

export function groupStudentDeadlinesAsAssignments(
  deadlines: StudentDeadlineInput[]
): StudentDeadlineAssignment[] {
  const grouped = new Map<
    string,
    {
      id: string;
      deadlineAt: string;
      topicId: string;
      topicTitle: string;
      statuses: (HomeworkNumberStatus | null)[];
    }
  >();

  for (const deadline of deadlines) {
    const deadlineAt = toIsoDateTimeString(deadline.deadlineAt);

    if (!deadlineAt) {
      continue;
    }

    const key = `${deadline.topicId}::${deadlineAt}`;
    const current = grouped.get(key);

    if (current) {
      current.statuses.push(deadline.status);
      continue;
    }

    grouped.set(key, {
      id: key,
      deadlineAt,
      topicId: deadline.topicId,
      topicTitle: deadline.topicTitle,
      statuses: [deadline.status]
    });
  }

  return Array.from(grouped.values())
    .map((group) => {
      const totalNumbers = group.statuses.length;
      const solvedNumbers = group.statuses.filter(
        (status) => status === HomeworkNumberStatus.GREEN || status === HomeworkNumberStatus.YELLOW
      ).length;
      const startedNumbers = group.statuses.filter((status) => status !== null).length;
      const status: StudentDeadlineAssignmentStatus =
        solvedNumbers === totalNumbers
          ? "DONE"
          : startedNumbers > 0
          ? "IN_PROGRESS"
          : "NOT_STARTED";

      return {
        id: group.id,
        deadlineAt: group.deadlineAt,
        topicId: group.topicId,
        topicTitle: group.topicTitle,
        totalNumbers,
        solvedNumbers,
        status
      };
    })
    .sort((left, right) => new Date(left.deadlineAt).getTime() - new Date(right.deadlineAt).getTime());
}

export type StudentHomeworkDeadlineInput = {
  id: string;
  title: string | null;
  orderInTopic: number;
  topicTitle: string;
  deadlineAt: Date | string | null;
  totalNumbers: number;
  solvedCount: number;
};

export function mapStudentHomeworksToDeadlineItems(
  assignments: StudentHomeworkDeadlineInput[],
  locale: Locale = DEFAULT_LOCALE
) {
  return assignments
    .flatMap((assignment) => {
      const deadlineAt = toIsoDateTimeString(assignment.deadlineAt);

      if (!deadlineAt) {
        return [];
      }

      const status: StudentDeadlineAssignmentStatus =
        assignment.totalNumbers > 0 && assignment.solvedCount >= assignment.totalNumbers
          ? "DONE"
          : assignment.solvedCount > 0
            ? "IN_PROGRESS"
            : "NOT_STARTED";

      return [
        {
          id: assignment.id,
          label: `${homeworkAssignmentLabel(assignment, locale)} · ${assignment.topicTitle}`,
          assignmentId: assignment.id,
          deadlineAt,
          totalNumbers: assignment.totalNumbers,
          solvedNumbers: assignment.solvedCount,
          status
        }
      ];
    })
    .sort((left, right) => new Date(left.deadlineAt).getTime() - new Date(right.deadlineAt).getTime());
}
