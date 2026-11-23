import { View } from 'react-native';

import type { TeacherStatsEntry } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

import { WeekBars } from '../charts/week-bars';
import { recentLessonLine, topicBarRatios } from '../logic';
import { StatsCard } from './stats-card';

export type TeacherCardProps = { entry: TeacherStatsEntry; weekStarts: readonly string[] };

/**
 * One teacher of the view «По учителям» (06 §1.6.b, §4.8; layout: mockup D-stats): a card titled with the
 * name — four plain figures (students, issued homework, parent calls — counts only: comments are personal
 * data and never appear here — and lessons), lessons by week, lesson topics and the recent lessons with
 * their STORED status as rows.
 */
export function TeacherCard({ entry, weekStarts }: TeacherCardProps) {
  const styles = useStyles();
  const { locale, dict } = useI18n();
  const t = dict.planner.teacherStats;
  const ratios = topicBarRatios(entry.topTopics);

  return (
    <StatsCard title={entry.teacherName} subtitle={entry.teacherEmail} testID={`stats-teacher-${entry.teacherId}`}>
      <View style={styles.tiles}>
        <View style={styles.tileRow}>
          <StatTile label={t.students} value={entry.studentsCount} />
          <StatTile label={t.issuedHomework} value={entry.homeworkTotal} note={format(t.for30Days, { n: entry.homework30d })} />
        </View>
        <View style={styles.tileRow}>
          <StatTile
            label={t.parentCalls}
            value={entry.callsReached}
            note={entry.callsNoAnswer > 0 ? format(t.noAnswers, { n: entry.callsNoAnswer }) : undefined}
          />
          <StatTile label={t.lessons} value={entry.lessonsTotal} note={format(t.finished, { n: entry.lessonsFinished })} />
        </View>
      </View>

      <View style={styles.block}>
        <Text variant="smallStrong" color="textMuted" accessibilityRole="header">
          {t.lessonsByWeek}
        </Text>
        {entry.lessonsTotal > 0 ? (
          <WeekBars counts={entry.lessonsByWeek} weekStarts={weekStarts} testID={`stats-teacher-weeks-${entry.teacherId}`} />
        ) : (
          <Text variant="small" color="textMuted">
            {t.noLessons}
          </Text>
        )}
      </View>

      {entry.topTopics.length > 0 ? (
        <View style={styles.block}>
          <Text variant="smallStrong" color="textMuted" accessibilityRole="header">
            {t.lessonTopics}
          </Text>
          {entry.topTopics.map((topic, index) => (
            // The site puts title, bar and count on one line; on a phone the title would be cut to a
            // few letters, so the bar goes under it.
            <View key={topic.title} style={styles.topic} accessible accessibilityLabel={`${topic.title}: ${topic.count}`}>
              <View style={styles.topicHead}>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.topicTitle}>
                  {topic.title}
                </Text>
                <Text variant="small" color="textMuted" tabular>
                  {topic.count}
                </Text>
              </View>
              <View style={styles.topicTrack}>
                <View style={[styles.topicFill, { width: `${(ratios[index] ?? 0) * 100}%` }]} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {entry.recentLessons.length > 0 ? (
        <View>
          <Text variant="smallStrong" color="textMuted" accessibilityRole="header">
            {t.recentLessons}
          </Text>
          {entry.recentLessons.map((lesson, index) => {
            const line = recentLessonLine(lesson, t, dict.planner.common, locale);
            return (
              <View
                key={lesson.id}
                accessible
                accessibilityLabel={`${line.when}. ${line.details}. ${line.status}`}
                style={[styles.lesson, index > 0 ? styles.divider : null]}
                testID={`stats-teacher-lesson-${lesson.id}`}
              >
                <View style={styles.lessonTexts}>
                  <Text variant="bodyStrong">{line.when}</Text>
                  <Text variant="small" color="textMuted" numberOfLines={2}>
                    {line.details}
                  </Text>
                </View>
                <Text variant="small" color="textMuted">
                  {line.status}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </StatsCard>
  );
}

/** A plain figure of the card in a soft box: a caption, the number and at most one note. */
function StatTile({ label, value, note }: { label: string; value: number; note?: string }) {
  const styles = useStyles();
  return (
    <Card style={styles.tile} accessibilityLabel={note ? `${label}: ${value}, ${note}` : `${label}: ${value}`}>
      <Text variant="small" color="textMuted" numberOfLines={2}>
        {label}
      </Text>
      <Text variant="metric" tabular>
        {value}
      </Text>
      {note ? (
        <Text variant="small" color="textMuted">
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  tiles: { gap: t.space.sm },
  tileRow: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.sm },
  tile: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  block: { gap: t.space.sm },
  topic: { gap: t.space.xs },
  topicHead: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.md },
  topicTitle: { flex: 1, minWidth: 0 },
  // Not progress and not a status: a neutral bar on the neutral track.
  topicTrack: {
    height: t.sizes.progress.sm,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.soft2,
    overflow: 'hidden',
  },
  topicFill: { height: '100%', borderRadius: t.radii.full, backgroundColor: t.colors.textMuted },
  lesson: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  lessonTexts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  divider: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
}));
