// Shared UI / service layer behaviour on the native tree: the press guard of Button / TextButton, the
// pull-to-refresh spinner offline, and the photo pager's `contentOffset` (native only: web has no such prop).
import { describe, expect, it, jest } from '@jest/globals';

import { visibleText, visit } from './support/drive';
import type { HostNode } from './support/tree';
import { walk } from './support/tree';

const file = (id: string, originalName: string, mimeType: string) => ({ id, originalName, mimeType });
const viewer = (files: ReturnType<typeof file>[], index = 0) => `/file-viewer?files=${encodeURIComponent(JSON.stringify(files))}${index ? `&index=${index}` : ''}`;

function findPager(root: HostNode): HostNode | null {
  let found: HostNode | null = null;
  walk(root, (node) => {
    if (!found && node.props.pagingEnabled === true && node.props.horizontal === true) found = node;
  });
  return found;
}

describe('file viewer pager', () => {
  it('keeps contentOffset constant while the user swipes (a changed prop is a programmatic jump on a phone)', async () => {
    const PHOTOS = [
      file('file_word_theory', 'a.jpg', 'image/jpeg'),
      file('file_word_theory_2', 'b.jpg', 'image/jpeg'),
      file('file_word_theory_3', 'c.jpg', 'image/jpeg'),
    ];
    const app = await visit({ as: 'ilya@example.com', url: viewer(PHOTOS, 1), expectPath: '/file-viewer' });
    const root = app.screen.container as unknown as HostNode;
    const pager = findPager(root);
    expect(pager).not.toBeNull();
    const initial = pager!.props.contentOffset as { x: number; y: number };
    const pageWidth = initial.x; // opened on the second photo
    expect(pageWidth).toBeGreaterThan(0);
    expect(visibleText(app)).toContain('2 из 3');

    // The finger drags past the middle of the next page: the counter follows ...
    await app.rntl.fireEvent.scroll(pager as never, {
      nativeEvent: { contentOffset: { x: pageWidth * 1.6, y: 0 }, contentSize: { width: pageWidth * 3, height: 1 }, layoutMeasurement: { width: pageWidth, height: 1 } },
    });
    await app.settle();
    expect(visibleText(app)).toContain('3 из 3');
    // ... but the prop is not re-driven from the live index.
    const after = findPager(app.screen.container as unknown as HostNode);
    expect(after!.props.contentOffset).toEqual(initial);
  });
});

type Fiber = { memoizedProps: Record<string, unknown> | null; return: Fiber | null };
type PressTarget = { unstable_fiber: Fiber };

/**
 * The `onPress` the Pressable receives, found on the fiber path like RNTL's `fireEvent` does. Called
 * directly, so two presses run back to back with no render in between (a JS thread that was busy while the
 * user tapped twice); `fireEvent.press` would wrap each in its own `act` and render in between.
 */
function pressHandler(node: PressTarget): () => void {
  for (let fiber: Fiber | null = node.unstable_fiber; fiber; fiber = fiber.return) {
    const handler = fiber.memoizedProps?.onPress;
    if (typeof handler === 'function') return () => (handler as (event: unknown) => void)({ nativeEvent: {} });
  }
  throw new Error('no press handler');
}

describe('press guard and pull-to-refresh (isolated)', () => {
  it('Button: two presses handled back to back run the handler once; a later press runs it again', async () => {
    jest.useRealTimers();
    const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const { ThemeProvider } = require('@/theme') as typeof import('@/theme');
    const { Button } = require('@/ui') as typeof import('@/ui');
    const onPress = jest.fn();
    const view = await rntl.render(
      <ThemeProvider mode="light">
        <Button label="Создать" onPress={onPress} testID="create" />
      </ThemeProvider>,
    );
    const press = pressHandler(view.getByTestId('create') as unknown as PressTarget);
    // Two taps the JS thread handles back to back, with no render in between.
    await rntl.act(() => {
      press();
      press();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    await rntl.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await rntl.act(() => press());
    expect(onPress).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it('Button: an async handler keeps the button locked until its promise settles', async () => {
    jest.useRealTimers();
    const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const { ThemeProvider } = require('@/theme') as typeof import('@/theme');
    const { Button } = require('@/ui') as typeof import('@/ui');
    let finish: () => void = () => undefined;
    const onPress = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = await rntl.render(
      <ThemeProvider mode="light">
        <Button label="Выдать" onPress={onPress} testID="issue" />
      </ThemeProvider>,
    );
    const press = pressHandler(view.getByTestId('issue') as unknown as PressTarget);
    await rntl.act(() => press());
    await rntl.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await rntl.act(() => press());
    expect(onPress).toHaveBeenCalledTimes(1);
    await rntl.act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await rntl.act(() => press());
    expect(onPress).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it('usePullRefresh: offline, the spinner ends although the refetch promise stays pending', async () => {
    jest.useRealTimers();
    const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const tq = require('@tanstack/react-query') as typeof import('@tanstack/react-query');
    const { ApiError } = require('@/api/errors') as typeof import('@/api/errors');
    const { createAppQueryClient, usePullRefresh } = require('@/services/query') as typeof import('@/services/query');
    const client = createAppQueryClient({ retryDelayMs: 5 });
    client.mount();
    client.setQueryData(['teacherStudents', 'listStudents'], 'cached', { updatedAt: Date.now() - 60_000 });
    tq.onlineManager.setOnline(false);
    const wrapper = ({ children }: { children: React.ReactNode }) => <tq.QueryClientProvider client={client}>{children}</tq.QueryClientProvider>;
    const hook = await rntl.renderHook(
      () => {
        const query = tq.useQuery({
          queryKey: ['teacherStudents', 'listStudents'],
          queryFn: () => Promise.reject(ApiError.network('offline')),
          staleTime: Number.POSITIVE_INFINITY,
        });
        return { query, pull: usePullRefresh([query]) };
      },
      { wrapper },
    );
    try {
      await rntl.act(async () => {
        hook.result.current.pull.refresh();
      });
      expect(hook.result.current.pull.refreshing).toBe(true);
      await rntl.waitFor(() => expect(hook.result.current.query.fetchStatus).toBe('paused'));
      expect(hook.result.current.pull.refreshing).toBe(false);
      expect(hook.result.current.query.data).toBe('cached');
      // Back online: the parked refetch resumes silently, the spinner does not come back.
      await rntl.act(async () => {
        tq.onlineManager.setOnline(true);
      });
      await rntl.waitFor(() => expect(hook.result.current.query.fetchStatus).toBe('idle'));
      expect(hook.result.current.pull.refreshing).toBe(false);
    } finally {
      tq.onlineManager.setOnline(true);
      await hook.unmount();
      client.clear();
      client.unmount();
    }
  });
});
