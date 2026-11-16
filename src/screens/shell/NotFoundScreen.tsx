import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles } from '@/theme';
import { ErrorState, Screen } from '@/ui';

export type NotFoundScreenProps = {
  /** Text under the title; default is the site's "page may have been removed" line. */
  description?: string;
};

/**
 * Not-found shell (docs/spec/01-shell-auth.md §1.6): the muted 404, a title and one button home. Shown
 * for an unknown route and by any screen whose entity no longer exists (`404` on a detail read).
 */
export function NotFoundScreen({ description }: NotFoundScreenProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const navigation = useAppNavigation();
  return (
    <Screen scroll={false} contentContainerStyle={styles.center} testID="not-found">
      <ErrorState
        numeral="404"
        title={dict.shells.notFoundTitle}
        description={description ?? dict.shells.notFoundDescription}
        retryLabel={dict.common.home}
        onRetry={navigation.goHome}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({ center: { justifyContent: 'center' } }));
