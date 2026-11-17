import { render, screen } from '@testing-library/react-native';
import { Platform, Text, View } from 'react-native';

import { ThemeProvider } from '@/theme';
import { Button } from '@/ui';

describe('native render harness', () => {
  it('renders a UI kit button on the native platform', async () => {
    await render(
      <ThemeProvider mode="light">
        <Button label="Открыть ДЗ" onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(Platform.OS).not.toBe('web');
    expect(screen.getByText('Открыть ДЗ')).toBeTruthy();
  });

  it('rejects a raw string inside a View like a phone does', async () => {
    const count = 0;
    let failed = false;
    try {
      await render(<View>{count && <Text>x</Text>}</View>);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
