// Repairs after the review of round 3: error lines that appear without moving the focus are live regions,
// so TalkBack speaks them (`accessibilityRole="alert"` alone only sets a role description on Android).
// Rendered on their own, without the app: a launched app loads its own module registry.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiProvider } from '@/api';
import type { ApiClient } from '@/api/client';
import { ImportPromptButton } from '@/screens/content/shared/import-prompt-button';
import { OwnerSaveBar } from '@/screens/developer/accounts/owner-save-bar';
import { ThemeProvider } from '@/theme';

describe('errors without a role-only announcement on Android', () => {
  afterEach(cleanup);

  it('the owner save error is a live region', async () => {
    await render(
      <ThemeProvider mode="light">
        <OwnerSaveBar count={1} saving={false} error="Не удалось сохранить" onDiscard={() => undefined} onSave={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('owner-save-error').props.accessibilityLiveRegion).toBe('polite');
  });

  it('the import prompt copy error is a live region', async () => {
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
      expect(error.props.accessibilityLiveRegion).toBe('polite');
    } finally {
      denied.mockRestore();
      queryClient.clear();
    }
  });
});
