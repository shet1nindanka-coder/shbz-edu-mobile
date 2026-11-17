import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Notice } from '@/ui';

import type { Handout } from './use-handout';
import { RetryWaitLine } from './use-retry-wait';

/**
 * Why a handout did not open (`404 lessonNotFound`, `404 noHomeworkHandout`, `429 rateLimited`, …). For
 * `503 pdfRendererUnavailable` it offers the HTML print version instead (90-addendum-2 A.2.6).
 */
export function HandoutNotice({ handout, testID }: { handout: Handout; testID?: string }) {
  const styles = useStyles();
  const { m } = useI18n();
  const failure = handout.failure;
  if (!failure) return null;
  return (
    <View style={styles.block}>
      <Notice
        tone="error"
        text={failure.text}
        onDismiss={handout.dismiss}
        dismissLabel={m.common.actions.close}
        action={
          failure.canOpenPrintVersion ? (
            <Button
              label={m.planner.lessonBoard.print}
              size="sm"
              variant="outline"
              onPress={() => handout.open({ ...failure.request, format: 'html' })}
              testID={testID ? `${testID}-print` : undefined}
            />
          ) : undefined
        }
        testID={testID}
      />
      <RetryWaitLine seconds={handout.wait.seconds} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({ block: { gap: t.space.xs } }));
