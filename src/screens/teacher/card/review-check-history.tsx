import { useState } from 'react';
import { View } from 'react-native';

import type { SolutionVerdict, TeacherHomeworkCheck } from '@/api/types';
import { PhotoThumb } from '@/components/files';
import { formatRunDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { accessibilityLabelOf, Chip, Icon, PressableScale, Text, type ChipTone } from '@/ui';

import { DisclosureRow } from './disclosure-row';
import { checkMoment, countVerdicts } from './review-logic';

export type ReviewCheckHistoryProps = {
  /** Newest first, at most 15. */
  checks: readonly TeacherHomeworkCheck[];
  /** Id of the latest finished check — it carries the «Текущая» badge. */
  currentId: string | null;
  onOpenPhoto: (check: TeacherHomeworkCheck, index: number) => void;
  testID?: string;
};

const VERDICT_ORDER: readonly SolutionVerdict[] = ['CORRECT', 'INCORRECT', 'UNCERTAIN'];
const VERDICT_TONE: Record<SolutionVerdict, ChipTone> = { CORRECT: 'green', INCORRECT: 'red', UNCERTAIN: 'muted' };
const ATTEMPT_THUMB = 56;

/**
 * "Check history" of one homework (docs/spec/04-teacher-students.md S4 item 4): every AI check run,
 * newest first, as a timeline; a run that has results unfolds to the photos of that attempt and one
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
  const verdictColor: Record<SolutionVerdict, string> = {
    CORRECT: theme.colors.greenText,
    INCORRECT: theme.colors.dangerText,
    UNCERTAIN: theme.colors.kicker,
  };

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
      {open ? (
        <View style={styles.timeline}>
          {checks.map((check) => {
            const counts = countVerdicts(check.results);
            const expandable = check.results.length > 0;
            const expanded = expandable && openRuns.includes(check.id);
            const running = check.status === 'PENDING' || check.status === 'CHECKING';
            const header = (
              <>
                <View style={styles.runTitle}>
                  <Text variant="smallStrong" tabular>
                    {formatRunDateTime(checkMoment(check), locale) ?? '—'}
                  </Text>
                  {check.id === currentId ? <Chip tone="green" label={t.current} /> : null}
                  {check.status === 'FAILED' ? <Chip tone="red" label={t.failed} /> : null}
                  {running ? <Chip tone="muted" label={t.running} /> : null}
                  {expandable ? <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={14} color="kicker" /> : null}
                </View>
                {expandable ? (
                  <View style={styles.chips}>
                    {VERDICT_ORDER.map((verdict) =>
                      counts[verdict] > 0 ? <Chip key={verdict} tone={VERDICT_TONE[verdict]} label={format(countLabel[verdict], { n: counts[verdict] })} /> : null,
                    )}
                  </View>
                ) : null}
              </>
            );
            return (
              <View key={check.id} style={styles.run} testID={`review-check-${check.id}`}>
                <View style={[styles.dot, { backgroundColor: check.id === currentId ? theme.colors.accentSolid : theme.colors.softBorder }]} />
                <View style={styles.runBody}>
                  {expandable ? (
                    <PressableScale
                      accessibilityRole="button"
                      // One element for screen readers: the badges and the verdict counts are spoken too.
                      accessibilityLabel={accessibilityLabelOf([
                        formatRunDateTime(checkMoment(check), locale),
                        check.id === currentId ? t.current : null,
                        check.status === 'FAILED' ? t.failed : null,
                        running ? t.running : null,
                        ...VERDICT_ORDER.map((verdict) => (counts[verdict] > 0 ? format(countLabel[verdict], { n: counts[verdict] }) : null)),
                        t.showVerdicts,
                      ])}
                      accessibilityState={{ expanded }}
                      scaleTo={1}
                      onPress={() => toggleRun(check.id)}
                      testID={`review-check-toggle-${check.id}`}
                      style={styles.runHeader}
                      pressedStyle={styles.pressed}
                    >
                      {header}
                    </PressableScale>
                  ) : (
                    <View style={styles.runHeader}>{header}</View>
                  )}
                  {expanded ? (
                    <View style={styles.details}>
                      {check.photos.length > 0 ? (
                        <View style={styles.attempt}>
                          <Text variant="kickerSm">{t.attemptPhotos}</Text>
                          <View style={styles.photos}>
                            {check.photos.map((photo, index) => (
                              <PhotoThumb
                                key={photo.fileId}
                                fileId={photo.fileId}
                                name={photo.originalName}
                                size={ATTEMPT_THUMB}
                                onPress={() => onOpenPhoto(check, index)}
                                testID={`review-check-photo-${photo.fileId}`}
                              />
                            ))}
                          </View>
                        </View>
                      ) : null}
                      <View style={styles.chips}>
                        {check.results.map((result) => (
                          <View key={result.number} style={styles.verdict}>
                            <Text variant="captionBold" tabular>
                              {format(t.number, { n: result.number })}
                              <Text variant="captionStrong" style={{ color: verdictColor[result.verdict] }}>
                                {` — ${t.verdict[result.verdict].short}`}
                              </Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  timeline: { gap: t.space.xs, paddingTop: t.space.xs },
  run: { flexDirection: 'row', gap: t.space.sm },
  dot: { width: 10, height: 10, borderRadius: t.radii.full, marginTop: 17 },
  runBody: { flex: 1, minWidth: 0 },
  runHeader: { minHeight: t.sizes.minTouch, justifyContent: 'center', gap: t.space.xs, paddingVertical: t.space.xs, borderRadius: t.radii.md },
  pressed: { opacity: 0.6 },
  runTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.sm, rowGap: t.space.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  details: { gap: t.space.sm, paddingBottom: t.space.sm },
  attempt: { gap: t.space.xs },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  verdict: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: t.radii.sm,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.outlineBorder,
    backgroundColor: t.colors.cardBg,
  },
}));
