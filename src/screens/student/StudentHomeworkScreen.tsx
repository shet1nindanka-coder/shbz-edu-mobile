import { useRef } from 'react';
import type { ScrollViewInstance } from 'react-native';

import { useI18n } from '@/i18n';
import type { ScreenParams } from '@/navigation';
import { DetailAppBar } from '@/screens/shell';
import { Screen } from '@/ui';

import { HomeworkDetail } from './work/homework-detail';

/** Route params of `student.homework` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type StudentHomeworkScreenProps = ScreenParams['student.homework'];

/**
 * `student.homework` — one homework as a pushed screen of the «дз» section (a phone; a tablet shows the
 * same `HomeworkDetail` in the right panel of the list, and this screen when it is opened by a link).
 */
export function StudentHomeworkScreen({ assignmentId }: StudentHomeworkScreenProps) {
  const { m } = useI18n();
  const scrollRef = useRef<ScrollViewInstance>(null);
  return (
    <HomeworkDetail assignmentId={assignmentId} onScrollToTop={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
      {({ title, subtitle, body, refreshing, refresh }) => (
        <Screen
          testID="student-homework-screen"
          header={<DetailAppBar title={title} subtitle={subtitle} backTitle={m.shell.tabs.homeworks} />}
          scrollRef={scrollRef}
          refreshing={refreshing}
          onRefresh={refresh}
        >
          {body}
        </Screen>
      )}
    </HomeworkDetail>
  );
}
