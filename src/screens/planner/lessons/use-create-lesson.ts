import { useMutation, useQueryClient } from '@tanstack/react-query';

import { qk, useApi } from '@/api';
import type { CreateLessonInput } from '@/api/types';
import { useAppNavigation } from '@/navigation';

import { useStillHere } from '../shared/use-still-here';

/**
 * `POST /teacher/lessons`. The lesson exists for EVERY `plan` outcome (queued, skipped, unavailable,
 * budgetExhausted, queueFull), so success always leads to its board, which shows what happened to the
 * plan (docs/spec/00-unified-contract.md §3.1). The form is replaced, not covered: "back" from the board
 * must not return to a form that would create the lesson again. Only the form is replaced: a teacher who
 * has left it while the request ran stays where they are (the lists are refreshed either way).
 */
export function useCreateLesson() {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();

  return useMutation({
    mutationFn: (input: CreateLessonInput) => api.planner.createLesson(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'listLessons') });
      // The new lesson also appears on the student card ("Lessons" tab, "already used in a lesson" marks)
      // and in the group's lessons block.
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'getLessonNewForm') });
      void queryClient.invalidateQueries({ queryKey: qk('teacherStudents', 'listStudentLessons') });
      void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroup') });
      if (stillHere()) navigation.replace({ screen: 'planner.lessonBoard', lessonId: created.lessonId });
    },
  });
}
