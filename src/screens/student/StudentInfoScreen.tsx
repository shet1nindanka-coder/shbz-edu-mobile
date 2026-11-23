import { useState } from 'react';
import { View } from 'react-native';

import { EGE_PROFILE_MIN_PRIMARY, EGE_PROFILE_SCALE, getEgeProfileTasks, getOgeGrades, getOgeTasks } from '@/domain/exam-scores';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { DetailAppBar, ShellAppBar } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { Enter, Screen, Segmented } from '@/ui';

import { ExamSection } from './study/exam-section';
import { GradeList } from './study/grade-list';
import { ScoreScaleGrid } from './study/score-scale-grid';
import { TaskScoringList } from './study/task-scoring-list';

type ExamKind = 'ege' | 'oge';

/**
 * `student.info` — «Баллы» (docs/spec/02-student-study.md S5): the points per task and the raw → scaled
 * table for the EGE (profile maths), the points per task and the grade ranges for the OGE. Fully static:
 * the tables and texts are bundled, nothing is requested. The chosen exam is not remembered.
 *
 * A tablet has it in the dock («инфа»); a phone opens it from the profile, so its "back" leads there.
 */
export function StudentInfoScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.student.examInfo;
  const [exam, setExam] = useState<ExamKind>('ege');

  const navigation = useAppNavigation();
  const exams = (
    <Segmented
      options={[
        { value: 'ege', label: t.ege },
        { value: 'oge', label: t.oge },
      ]}
      value={exam}
      onChange={setExam}
      accessibilityLabel={t.tablistAria}
      role="tab"
      fill={!theme.tablet}
      testID="exam-segments"
    />
  );

  return (
    <Screen
      testID="student-info-screen"
      header={
        theme.tablet ? (
          <ShellAppBar title={m.shell.tabs.info} aside={exams} />
        ) : (
          <DetailAppBar title={m.shell.tabs.info} backTitle={m.shell.tabs.profile} onBack={navigation.openSettings} aside={exams} />
        )
      }
    >
      {/* The key replays the panel's entrance when the exam changes. */}
      <Enter key={exam} duration={180}>
        {exam === 'ege' ? (
          <View style={styles.sections} testID="exam-panel-ege">
            <ExamSection title={t.tasksTitle} testID="exam-section-tasks">
              <TaskScoringList items={getEgeProfileTasks(t)} />
            </ExamSection>
            <ExamSection title={t.scaleTitle} testID="exam-section-scale">
              <ScoreScaleGrid rows={EGE_PROFILE_SCALE} highlightPrimary={EGE_PROFILE_MIN_PRIMARY} />
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
  sections: { gap: t.space.block },
}));
