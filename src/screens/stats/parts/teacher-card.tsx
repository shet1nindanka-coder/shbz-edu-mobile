import { View } from 'react-native';

import type { TeacherStatsEntry } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

import { WeekBars } from '../charts/week-bars';
import { recentLessonLine, topicBarRatios } from '../logic';

export type TeacherCardProps = { entry: TeacherStatsEntry; weekStarts: readonly string[] };

/**
 * One teacher of the view «По учителям» (06 §1.6.b, §4.8): students, issued homework, parent calls
 * (counts only: comments are personal data and never appear here), lessons by week, lesson topics and
 * the recent lessons with their STORED status.
 */
export function TeacherCard({ entry, weekStarts }: TeacherCardProps) {
  const styles = useStyles();
  const { locale, dict } = useI18n();
  const t = dict.planner.teacherStats;
  const ratios = topicBarRatios(entry.topTopics);

  return (
    <Card padded={false} testID={`stats-teacher-${entry.teacherId}`}>
      {/* Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings. */}
      <View style={styles.card}>
        <View>
          <Text variant="cardTitle" accessibilityRole="header">
            {entry.teacherName}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {entry.teacherEmail}
          </Text>
        </View>

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
          <Text variant="kickerSm" accessibilityRole="header">
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
            <Text variant="kickerSm" accessibilityRole="header">
              {t.lessonTopics}
            </Text>
            {entry.topTopics.map((topic, index) => (
              // The site puts title, bar and count on one line; on a phone the title would be cut to a
              // few letters, so the bar goes under it.
              <View key={topic.title} style={styles.topic} accessible accessibilityLabel={`${topic.title}: ${topic.count}`}>
                <View style={styles.topicHead}>
                  <Text variant="label" color="textStrong" numberOfLines={1} style={styles.topicTitle}>
                    {topic.title}
                  </Text>
                  <Text variant="label" color="textMuted" tabular>
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
          <View style={styles.block}>
            <Text variant="kickerSm" accessibilityRole="header">
              {t.recentLessons}
            </Text>
            <View>
              {entry.recentLessons.map((lesson, index) => {
                const line = recentLessonLine(lesson, t, dict.planner.common, locale);
                return (
                  <View
                    key={lesson.id}
                    style={[styles.lesson, index < entry.recentLessons.length - 1 ? styles.lessonDivider : null]}
                    testID={`stats-teacher-lesson-${lesson.id}`}
                  >
                    <View style={styles.lessonHead}>
                      <Text variant="smallStrong" style={styles.lessonWhen}>
                        {line.when}
                      </Text>
                      <Text variant="label" color="textSoft">
                        {line.status}
                      </Text>
                    </View>
                    <Text variant="label" color="textMuted">
                      {line.details}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function StatTile({ label, value, note }: { label: string; value: number; note?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile} accessible accessibilityLabel={note ? `${label}: ${value}, ${note}` : `${label}: ${value}`}>
      <Text variant="statLabel" color="kicker" numberOfLines={2}>
        {label}
      </Text>
      <Text variant="metric" tabular>
        {value}
      </Text>
      {note ? (
        <Text variant="caption" color="textMuted">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { padding: t.space.card, gap: t.space.xl },
  tiles: { gap: t.space.field },
  tileRow: { flexDirection: 'row', gap: t.space.lg },
  tile: { flex: 1, minWidth: 0 },
  block: { gap: t.space.md },
  topic: { gap: t.space.xs },
  topicHead: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.md },
  topicTitle: { flex: 1, minWidth: 0 },
  topicTrack: {
    height: t.sizes.progress.sm,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.softBg,
    overflow: 'hidden',
  },
  topicFill: { height: '100%', borderRadius: t.radii.full, backgroundColor: t.colors.accentSolid },
  lesson: { gap: 2, paddingVertical: t.space.md },
  lessonDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  lessonHead: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.md },
  lessonWhen: { flex: 1, minWidth: 0 },
}));
