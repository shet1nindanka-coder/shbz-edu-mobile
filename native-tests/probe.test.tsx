// The environment itself: the tests run with React Native's native module resolution, and the renderer
// refuses what a phone refuses.
import { afterEach, describe, expect, it } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react-native';
import { Platform, Text, View } from 'react-native';

import { ThemeProvider } from '@/theme';
import { Button } from '@/ui';

import { findViolations } from './support/tree-checks';
import type { HostNode } from './support/tree';

afterEach(cleanup);

const rules = (): string[] => findViolations(screen.container as unknown as HostNode).map((violation) => violation.rule);

describe('native render harness', () => {
  it('renders a UI kit button on the native platform', async () => {
    await render(
      <ThemeProvider mode="light">
        <Button label="Открыть ДЗ" onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(Platform.OS).not.toBe('web');
    expect(screen.getByText('Открыть ДЗ')).toBeTruthy();
    expect(rules()).toEqual([]);
  });

  it('rejects a raw string inside a View like a phone does', async () => {
    const count = 0;
    let message = '';
    try {
      await render(<View>{count && <Text>x</Text>}</View>);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/must be rendered (with)?in a <Text>/i);
  });

  it('the tree walker reports what native would not accept', async () => {
    const web = { cursor: 'pointer', userSelect: 'none', transitionDuration: '200ms', position: 'fixed', width: '12px', lineHeight: 1.4 } as object;
    await render(
      <View accessibilityRole={'dialog' as never} style={web}>
        <Text style={{ fontFamily: 'Inter', color: 'rebeccapurple-ish', fontSize: 14 }}>x</Text>
      </View>,
    );
    expect(new Set(rules())).toEqual(
      new Set(['accessibility-role', 'style-unknown-key', 'style-enum', 'style-css-unit', 'style-line-height', 'style-text-on-view', 'style-font-family', 'style-color']),
    );
  });
});
