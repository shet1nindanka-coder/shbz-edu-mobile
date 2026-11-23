import { useState } from 'react';
import { View } from 'react-native';

import type { SolutionVerdict, TeacherHomeworkCheck } from '@/api/types';
import { PhotoThumb } from '@/components/files';
import { formatRunDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { accessibilityLabelOf, Card, Chip, Icon, PressableScale, Text } from '@/ui';

import { DisclosureRow } from './disclosure-row';
import { checkMoment, countVerdicts } from './review-logic';

export type ReviewCheckHistoryProps = {
  /** Newest first, at most 15. */
  checks: readonly TeacherHomeworkCheck[];
  /** Id of the latest finished check — it carries the «Текущая» mark. */
  currentId: string | null;
  onOpenPhoto: (check: TeacherHomeworkCheck, index: number) => void;
  testID?: string;
};

const VERDICT_ORDER: readonly SolutionVerdict[] = ['CORRECT', 'INCORRECT', 'UNCERTAIN'];

/**
 * "Check history" of one homework (docs/spec/04-teacher-students.md S4 item 4): every AI check run,
 * newest first, as rows — when, ONE caption with the verdict counts, and one mark on the right (the
 * current run; a failed one in red). A run that has results unfolds to the photos of that attempt and one
 * verdict per number.
 */
export function ReviewCheckHistory({ checks, currentId, onOpenPhoto, testID }: ReviewCheckHistoryProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, locale } = useI18n();
  const t = dict.students.review;
  const [open, setOpen] = useState(false);
  const [openRuns, setOpenRuns] = useState<readonly string[]>([]);
  const countLabel: Record<SolutionVerdict, string> = { CORRECT: t.countCorrect, INCORRECT: t.countIncorrect, UNCERTAIN: t.countUncertain };

  if (checks.length === 0) return null;

  const toggleRun = (checkId: string) =>
    setOpenRuns((current) => (current.includes(checkId) ? current.filter((id) => id !== checkId) : [...current, checkId]));

  return (
    <View testID={testID}>
      <DisclosureRow
        label={t.historyTitle}
        meta={`· ${plural(locale, checks.length, t.runForms)}`}
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
        testID={testID ? `${testID}-toggle` : undefined}
      />
      {open
        ? checks.map((check, index) => {
            const counts = countVerdicts(check.results);
            const expandable = check.results.length > 0;
            const expanded = expandable && openRuns.includes(check.id);
            const running = check.status === 'PENDING' || check.status === 'CHECKING';
            const when = formatRunDateTime(checkMoment(check), locale) ?? '—';
            const countsLine = VERDICT_ORDER.filter((verdict) => counts[verdict] > 0)
              .map((verdict) => format(countLabel[verdict], { n: counts[verdict] }))
              .join(' · ');
            const state = check.id === currentId ? t.current : running ? t.running : null;
            const header = (
              <>
                <View style={styles.runTexts}>
                  <Text variant="bodyStrong" tabular numberOfLines={1}>
                    {when}
                  </Text>
                  {countsLine ? (
                    <Text variant="small" color="textMuted" numberOfLines={2}>
                      {countsLine}
                    </Text>
                  ) : null}
                </View>
                {/* A colour only for what went wrong; «Текущая» and «Выполняется» are plain facts. */}
                {check.status === 'FAILED' ? (
                  <Chip tone="red" label={t.failed} />
                ) : state ? (
                  <Text variant="small" color="textMuted" numberOfLines={1}>
                    {state}
                  </Text>
                ) : null}
                {expandable ? <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={theme.sizes.icon.sm} color="textMuted" /> : null}
              </>
            );
            return (
              <View key={check.id} style={index < checks.length - 1 ? styles.divider : null} testID={`review-check-${check.id}`}>
                {expandable ? (
                  <PressableScale
                    accessibilityRole="button"
                    // One element for screen readers: the state and the verdict counts are spoken too.
                    accessibilityLabel={accessibilityLabelOf([when, check.status === 'FAILED' ? t.failed : state, countsLine, t.showVerdicts])}
                    accessibilityState={{ expanded }}
                    scaleTo={1}
                    onPress={() => toggleRun(check.id)}
                    testID={`review-check-toggle-${check.id}`}
                    style={styles.run}
                    pressedStyle={styles.pressed}
                  >
                    {header}
                  </PressableScale>
                ) : (
                  <View style={styles.run}>{header}</View>
                )}
                {expanded ? (
                  <Card style={styles.details}>
                    {check.photos.length > 0 ? (
                      <View style={styles.attempt}>
                        <Text variant="kicker" color="textMuted">
                          {t.attemptPhotos}
                        </Text>
                        <View style={styles.photos}>
                          {check.photos.map((photo, photoIndex) => (
                            <PhotoThumb
                              key={photo.fileId}
                              fileId={photo.fileId}
                              name={photo.originalName}
                              size={theme.sizes.control.lg}
                              onPress={() => onOpenPhoto(check, photoIndex)}
                              testID={`review-check-photo-${photo.fileId}`}
                            />
                          ))}
                        </View>
                      </View>
                    ) : null}
                    <View>
                      {check.results.map((result) => (
                        <View key={result.number} style={styles.verdict}>
                          <Text variant="smallBold" tabular>
                            {result.number}
                          </Text>
                          <Text variant="small" color={result.verdict === 'INCORRECT' ? 'redText' : 'textMuted'} style={styles.verdictText}>
                            {t.verdict[result.verdict].short}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                ) : null}
              </View>
            );
          })
        : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  run: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  runTexts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  pressed: { opacity: 0.6 },
  details: { gap: t.space.md, marginBottom: t.space.md },
  attempt: { gap: t.space.xs },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  verdict: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.md, paddingVertical: t.space.xxxs },
  verdictText: { flex: 1, minWidth: 0 },
}));
