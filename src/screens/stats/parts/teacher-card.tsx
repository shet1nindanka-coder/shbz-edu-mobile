import { View } from 'react-native';

import type { TeacherStatsEntry } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Icon, Text, type IconName } from '@/ui';

import { WeekBars } from '../charts/week-bars';
import { recentLessonLine, topicBarRatios } from '../logic';
import { StatsCard } from './stats-card';

export type TeacherCardProps = { entry: TeacherStatsEntry; weekStarts: readonly string[] };

/** The STORED status of a recent lesson as a glyph; the word is read out. */
const LESSON_STATUS_ICON: Record<TeacherStatsEntry['recentLessons'][number]['status'], IconName> = {
  PLANNED: 'clock',
  ACTIVE: 'playCircle',
  FINISHED: 'check',
};

/**
 * One teacher of the view «По учителям» (06 §1.6.b, §4.8; layout: mockup D-stats; text diet §1a): a card
 * titled with the name — four figures with a caption each (students, issued homework, parent calls —
 * counts only: comments are personal data and never appear here — and lessons as «проведено/всего»),
 * lessons by week, lesson topics and the recent lessons as rows: the topic, when, and the STORED status as
 * a glyph. The login and the site's notes under the figures are read out, not drawn.
 */
export function TeacherCard({ entry, weekStarts }: TeacherCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.teacherStats;
  const ratios = topicBarRatios(entry.topTopics);

  return (
    <StatsCard
      title={entry.teacherName}
      titleAccessibilityLabel={`${entry.teacherName}, ${entry.teacherEmail}`}
      testID={`stats-teacher-${entry.teacherId}`}
    >
      <View style={styles.tiles}>
        <View style={styles.tileRow}>
          <StatTile label={t.students} value={String(entry.studentsCount)} />
          <StatTile label={t.issuedHomework} value={String(entry.homeworkTotal)} spoken={format(t.for30Days, { n: entry.homework30d })} />
        </View>
        <View style={styles.tileRow}>
          <StatTile
            label={m.stats.short.calls}
            spokenLabel={t.parentCalls}
            value={String(entry.callsReached)}
            spoken={entry.callsNoAnswer > 0 ? format(t.noAnswers, { n: entry.callsNoAnswer }) : undefined}
          />
          <StatTile
            label={t.lessons}
            value={format(m.common.numbers.doneOf, { done: entry.lessonsFinished, total: entry.lessonsTotal })}
            spoken={format(t.finished, { n: entry.lessonsFinished })}
          />
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
                accessibilityLabel={`${line.title}. ${line.when}. ${line.who}. ${line.status}`}
                style={[styles.lesson, index > 0 ? styles.divider : null]}
                testID={`stats-teacher-lesson-${lesson.id}`}
              >
                <View style={styles.lessonTexts}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {line.title}
                  </Text>
                  <Text variant="small" color="textMuted" numberOfLines={1}>
                    {line.when}
                  </Text>
                </View>
                <Icon name={LESSON_STATUS_ICON[lesson.status]} size={theme.sizes.icon.md} color={lesson.status === 'ACTIVE' ? 'accentSolid' : 'textMuted'} />
              </View>
            );
          })}
        </View>
      ) : null}
    </StatsCard>
  );
}

type StatTileProps = {
  /** The caption: one or two words. */
  label: string;
  /** The site's full caption, when the visible one is shortened. */
  spokenLabel?: string;
  value: string;
  /** The site's note under the figure — only read out. */
  spoken?: string;
};

/** A plain figure of the card in a soft box: a caption and the number. */
function StatTile({ label, spokenLabel, value, spoken }: StatTileProps) {
  const styles = useStyles();
  const name = spokenLabel ?? label;
  return (
    <Card style={styles.tile} accessibilityLabel={spoken ? `${name}: ${value}, ${spoken}` : `${name}: ${value}`}>
      <Text variant="small" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="metric" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
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
  lesson: { minHeight: t.sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  lessonTexts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  divider: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
}));
