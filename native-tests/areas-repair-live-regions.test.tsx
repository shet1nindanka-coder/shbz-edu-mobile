// Repairs after the review of round 3: error lines that appear without moving the focus are spoken on both
// platforms (`accessibilityRole="alert"` alone only sets a role description on Android). Round 4: through
// `useStatusAnnouncement`, not a live region — a region attached together with its text may stay silent on
// Android, and a region plus the announcement would be read twice.
// Rendered on their own, without the app: a launched app loads its own module registry.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiProvider } from '@/api';
import type { ApiClient } from '@/api/client';
import { ImportPromptButton } from '@/screens/content/shared/import-prompt-button';
import { OwnerSaveBar } from '@/screens/developer/accounts/owner-save-bar';
import { ThemeProvider } from '@/theme';

function announcements(): { spoken: () => string[]; restore: () => void } {
  const { AccessibilityInfo } = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
  const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  return {
    spoken: () => [...queued.mock.calls.map((call) => call[0]), ...plain.mock.calls.map((call) => call[0])],
    restore: () => {
      queued.mockRestore();
      plain.mockRestore();
    },
  };
}

describe('errors without a role-only announcement on Android', () => {
  afterEach(cleanup);

  it('the owner save error is spoken once, without a second live-region reading', async () => {
    const spy = announcements();
    await render(
      <ThemeProvider mode="light">
        <OwnerSaveBar count={1} saving={false} error="Не удалось сохранить" onDiscard={() => undefined} onSave={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('owner-save-error').props.accessibilityLiveRegion).toBeUndefined();
    expect(spy.spoken()).toEqual(['Не удалось сохранить']);
    spy.restore();
  });

  it('the import prompt copy error is spoken once, without a second live-region reading', async () => {
    const spy = announcements();
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard'); // eslint-disable-line @typescript-eslint/no-require-imports
    const denied = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(false);
    const api = { content: { getImportPrompt: async () => 'PROMPT' } } as unknown as ApiClient;
    const queryClient = new QueryClient();
    try {
      await render(
        <ApiProvider client={api}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider mode="light">
              <ImportPromptButton />
            </ThemeProvider>
          </QueryClientProvider>
        </ApiProvider>,
      );
      await fireEvent.press(screen.getByTestId('import-prompt-copy'));
      const error = await screen.findByTestId('import-prompt-error');
      expect(error.props.accessibilityLiveRegion).toBeUndefined();
      expect(spy.spoken()).toEqual([error.props.children]);
    } finally {
      spy.restore();
      denied.mockRestore();
      queryClient.clear();
    }
  });
});
