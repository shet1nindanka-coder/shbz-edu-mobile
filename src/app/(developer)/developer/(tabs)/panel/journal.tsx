// `developer.journal` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { journalDaysParam, journalOutcomeParam } from '@/navigation/routes';
import { DeveloperJournalScreen } from '@/screens/developer/DeveloperJournalScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperJournalRoute() {
  const { outcome, days } = useLocalSearchParams<{ outcome?: string; days?: string }>();
  return <DeveloperJournalScreen outcome={journalOutcomeParam(outcome)} days={journalDaysParam(days)} />;
}
