import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { ScrollViewInstance } from 'react-native';

import { hasErrorCode, qk, useApi } from '@/api';
import { format, useI18n } from '@/i18n';
import type { ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { Screen } from '@/ui';

import { LoadError } from './study/load-error';
import { NumberCard } from './study/number-card';
import { NumberSkeleton } from './study/number-skeleton';
import { RefreshError } from './study/refresh-error';
import { useRefetchOnFocus } from './study/use-refetch-on-focus';
import { useRefresh } from './study/use-refresh';

/** Route params of `student.number` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type StudentNumberScreenProps = ScreenParams['student.number'];

/** After the keyboard has opened, the note (the last element of the screen) is scrolled into view. */
const KEYBOARD_SETTLE_MS = 250;

/**
 * `student.number` — «Номер {number}» (docs/spec/02-student-study.md S3): one problem with its statement,
 * the student's own status (read-only) and the personal note. Reached only from the number search; the
 * recorded and the normalised spelling open the same card (`010203` = `10203`).
 */
export function StudentNumberScreen({ number }: StudentNumberScreenProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict } = useI18n();
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detail = useQuery({
    queryKey: qk('studentStudy', 'getNumberDetail', number),
    queryFn: () => api.studentStudy.getNumberDetail(number),
  });
  const { refetch } = detail;
  const { refreshing, refresh } = useRefresh(refetch);
  // 00 §2.3 (statements): a refetch when the screen is uncovered again with stale data.
  useRefetchOnFocus([detail]);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  // Bad format or an unknown number: the not-found shell (the search normally answers before navigating
  // here, so this is the fallback for a deep link or a number removed meanwhile).
  if (hasErrorCode(detail.error, 'numberNotFound', 'invalidNumber')) return <NotFoundScreen />;

  const data = detail.data;
  const revealNote = () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), KEYBOARD_SETTLE_MS);
  };

  return (
    <Screen
      testID="student-number-screen"
      header={
        // The title carries the RECORDED spelling once it is known; the eyebrow is the topic.
        <DetailAppBar title={format(dict.student.number.title, { number: data?.number.number ?? number })} subtitle={data?.topic.title} />
      }
      scrollRef={scroll}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {data ? (
        <>
          {detail.isError ? <RefreshError error={detail.error} testID="number-refresh-error" style={styles.notice} /> : null}
          <NumberCard detail={data} onNoteFocus={revealNote} />
        </>
      ) : detail.isError ? (
        <LoadError error={detail.error} failedAt={detail.errorUpdatedAt} onRetry={refresh} retrying={detail.isFetching} home testID="number-error" />
      ) : (
        <NumberSkeleton />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  notice: { marginBottom: t.space.md },
}));
