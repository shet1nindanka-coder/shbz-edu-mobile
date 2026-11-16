import { useState } from 'react';
import { View } from 'react-native';

import { EGE_PROFILE_MIN_PRIMARY, EGE_PROFILE_SCALE, getEgeProfileTasks, getOgeGrades, getOgeTasks } from '@/domain/exam-scores';
import { useI18n } from '@/i18n';
import { DetailAppBar } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { Enter, PageHeader, Screen, Segmented } from '@/ui';

import { ExamSection } from './study/exam-section';
import { GradeList } from './study/grade-list';
import { ScoreScaleGrid } from './study/score-scale-grid';
import { TaskScoringList } from './study/task-scoring-list';

type ExamKind = 'ege' | 'oge';

/**
 * `student.info` — «Общая инфа» (docs/spec/02-student-study.md S5): the raw → scaled table and the points
 * per task for the EGE (profile maths), the points per task and the grade ranges for the OGE. Fully
 * static: the tables and texts are bundled, nothing is requested. The chosen exam is not remembered.
 */
export function StudentInfoScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.student.examInfo;
  const [exam, setExam] = useState<ExamKind>('ege');

  return (
    <Screen
      testID="student-info-screen"
      // Pushed inside the overview tab: the tab bar owns the bottom inset.
      header={<DetailAppBar title={m.shell.tabs.info} />}
      bottomInset={false}
    >
      <PageHeader title={dict.student.info.title} gap={theme.space.lg} />
      <Segmented
        options={[
          { value: 'ege', label: t.ege },
          { value: 'oge', label: t.oge },
        ]}
        value={exam}
        onChange={setExam}
        accessibilityLabel={t.tablistAria}
        role="tab"
        fill
        plain
        testID="exam-segments"
        style={styles.segments}
      />

      {/* The key replays the panel's entrance when the exam changes. */}
      <Enter key={exam} duration={180}>
        {exam === 'ege' ? (
          <View style={styles.sections} testID="exam-panel-ege">
            <ExamSection title={t.scaleTitle} testID="exam-section-scale">
              <ScoreScaleGrid rows={EGE_PROFILE_SCALE} highlightPrimary={EGE_PROFILE_MIN_PRIMARY} />
            </ExamSection>
            <ExamSection title={t.tasksTitle} testID="exam-section-tasks">
              <TaskScoringList items={getEgeProfileTasks(t)} />
            </ExamSection>
          </View>
        ) : (
          <View style={styles.sections} testID="exam-panel-oge">
            <ExamSection title={t.tasksTitle} testID="exam-section-tasks">
              <TaskScoringList items={getOgeTasks(t)} />
            </ExamSection>
            <ExamSection title={t.gradesTitle} testID="exam-section-grades">
              <GradeList items={getOgeGrades(t)} />
            </ExamSection>
          </View>
        )}
      </Enter>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  segments: { marginBottom: t.space.cardWide },
  sections: { gap: t.space.pageTop },
}));
