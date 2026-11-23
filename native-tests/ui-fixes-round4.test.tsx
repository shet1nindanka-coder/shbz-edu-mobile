// Regressions of the shared UI layer, round 4: announcements only from the focused screen (#313) and on
// Android where no live region speaks (`useStatusAnnouncement`), a note-save countdown kept out of the live
// region (#315/#331), a pending sheet hidden while its screen is not focused (#314), the spoken value of an
// empty date field (#340), photo names in a set (#333) and the live-WebView cap of math blocks (#308).
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';

import { byTestId, fill, tap, visit } from './support/drive';
import type { AppHandle } from './support/launch';
import { showHomeworkNumber } from './support/student';
import { all, textOf, type HostNode } from './support/tree';

const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };

function harness(): { rntl: typeof import('@testing-library/react-native'); wrap: (node: ReactNode) => ReactElement } {
  jest.useRealTimers();
  const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
  const { ThemeProvider } = require('@/theme') as typeof import('@/theme');
  const { I18nProvider } = require('@/i18n') as typeof import('@/i18n');
  const { SafeAreaInsetsContext } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
  const wrap = (node: ReactNode): ReactElement => (
    <SafeAreaInsetsContext value={INSETS}>
      <ThemeProvider mode="light">
        <I18nProvider locale="ru" onChangeLocale={() => undefined}>
          {node}
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaInsetsContext>
  );
  return { rntl, wrap };
}

const isIos = () => (require('react-native') as typeof import('react-native')).Platform.OS === 'ios';

function announcements(): { spoken: () => string[]; restore: () => void } {
  const { AccessibilityInfo } = require('react-native') as typeof import('react-native');
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

const nodes = (app: AppHandle, predicate: (node: HostNode) => boolean) => all(app.screen.container as unknown as HostNode, predicate);
const webViews = (app: AppHandle) => nodes(app, (node) => node.type === 'RNCWebView').length;

function modalOf(app: AppHandle, testID: string): { visible: unknown } | null {
  const found = app.screen.queryAllByTestId(testID, { includeHiddenElements: true });
  if (found.length === 0) return null;
  type Instance = { type: unknown; props: Record<string, unknown>; parent: Instance | null };
  let node = found[0] as unknown as Instance | null;
  while (node && node.type !== 'Modal') node = node.parent;
  return node ? { visible: node.props.visible } : null;
}

describe('announcements (#313)', () => {
  it('a refresh error of a background tab is not spoken; it is spoken once when the user comes back', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/lessons' });
    await app.rntl.act(async () => {
      app.router.navigate('/teacher/students' as never);
    });
    await app.settle();
    const voice = announcements();
    try {
      const { ApiError } = require('@/api/errors') as typeof import('@/api/errors');
      jest.spyOn(app.runtime.api.planner, 'listLessons').mockImplementation(async () => {
        throw new ApiError({ code: 'internal', status: 500, message: 'Сервер недоступен (тест)' });
      });
      await app.rntl.act(async () => {
        void app.queryClient.invalidateQueries({ queryKey: ['planner', 'listLessons'] });
      });
      for (let i = 0; i < 6; i += 1) await app.advance(2000);
      expect(app.path()).toBe('/teacher/students');
      expect(app.screen.queryAllByTestId('lessons-refresh-error', { includeHiddenElements: true }).length).toBe(1);
      expect(voice.spoken()).toEqual([]);

      await app.rntl.act(async () => {
        app.router.navigate('/teacher/lessons' as never);
      });
      await app.advance(500);
      const said = voice.spoken().filter((text) => text.includes('Сервер недоступен (тест)'));
      // iOS: held back, spoken now; Android: the notice's live region speaks it, no announcement is added.
      expect(said.length).toBe(isIos() ? 1 : 0);
    } finally {
      voice.restore();
    }
  });

  it('useStatusAnnouncement speaks a text once on both platforms', async () => {
    const { rntl, wrap } = harness();
    const { Text, useStatusAnnouncement } = require('@/ui') as typeof import('@/ui');
    function Line({ error }: { error: string | null }) {
      useStatusAnnouncement(error);
      return error ? <Text accessibilityRole="alert">{error}</Text> : null;
    }
    const spy = announcements();
    const view = await rntl.render(wrap(<Line error={null} />));
    await view.rerender(wrap(<Line error="Сервис временно недоступен." />));
    await view.rerender(wrap(<Line error="Сервис временно недоступен." />));
    await view.rerender(wrap(<Line error={null} />));
    await view.rerender(wrap(<Line error="Сервис временно недоступен." />));
    expect(spy.spoken()).toEqual(['Сервис временно недоступен.', 'Сервис временно недоступен.']);
    spy.restore();
    await view.unmount();
  });

  it('a notice with a fixed announcement is not a live region and says exactly that, once', async () => {
    const { rntl, wrap } = harness();
    const { Notice } = require('@/ui') as typeof import('@/ui');
    const spy = announcements();
    const view = await rntl.render(wrap(<Notice tone="error" text="Ошибка 30" announcement="Ошибка" testID="n" />));
    await view.rerender(wrap(<Notice tone="error" text="Ошибка 29" announcement="Ошибка" testID="n" />));
    expect(view.getByTestId('n').props.accessibilityLiveRegion).toBe('none');
    expect(spy.spoken()).toEqual(['Ошибка']);
    spy.restore();
    await view.unmount();
  });
});

describe('note save refused with a wait (#315, #331)', () => {
  it.each([
    ['number screen', '/student/numbers/118', '#number-note-input', 'number-note-error', 'number-note-wait'],
    ['homework card', '/student/homeworks/hw_ilya_overdue', '#number-note-120', 'number-note-error-120', 'number-note-wait-120'],
  ])('%s: the live region holds the message only; the countdown is a plain line under it', async (_name, url, input, errorId, waitId) => {
    const app = await visit({ as: 'ilya@example.com', url });
    // The homework shows one number card: № 120 is chosen in the strip first.
    if (input === '#number-note-120') await showHomeworkNumber(app, '120');
    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'rateLimited', times: 1 });
    expect(await fill(app, input, 'заметка под лимитом')).toBe(true);
    await app.advance(1500);
    await app.settle();
    const notice = byTestId(app, errorId);
    expect(notice).not.toBeNull();
    expect(notice!.props.accessibilityLiveRegion).toBe('polite');
    expect(textOf(notice!)).not.toMatch(/Повторить можно через/);
    const wait = byTestId(app, waitId);
    expect(wait).not.toBeNull();
    expect(textOf(wait!)).toMatch(/Повторить можно через/);
    // The countdown line is outside every live region.
    const inLive = nodes(app, (node) => node.props.accessibilityLiveRegion === 'polite').some((node) => all(node, (child) => child.props.testID === waitId).length > 0);
    expect(inLive).toBe(false);
  });
});

describe('a pending sheet and outside navigation (#314)', () => {
  it('the blocking report sheet leaves the window while another screen is on top and comes back on return', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/students/usr_ilya' });
    jest.spyOn(app.runtime.api.teacherStudents, 'downloadStudentReport').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ uri: 'file:///cache/r.pdf', fileName: 'r.pdf' } as never), 30000);
        }),
    );
    await tap(app, '#student-card-menu');
    await app.rntl.fireEvent.press(app.screen.getByTestId('student-menu-report-7d'));
    await app.advance(600);
    expect(modalOf(app, 'student-report-progress')).toEqual({ visible: true });

    await app.rntl.act(async () => {
      app.router.push('/settings' as never);
    });
    await app.advance(1500);
    expect(app.path()).toBe('/settings');
    // No window of the card is left above Settings (RN `Modal` renders nothing while it is not visible).
    expect(modalOf(app, 'student-report-progress')).toBeNull();

    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.advance(1500);
    expect(app.path()).toBe('/teacher/students/usr_ilya');
    expect(modalOf(app, 'student-report-progress')).toEqual({ visible: true });
    await app.advance(30000);
  });
});

describe('date-time field with no value (#340)', () => {
  it('says that it is not set instead of reading the placeholder as its value', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/students/usr_ilya/assign' });
    const field = byTestId(app, 'assign-deadline');
    expect(field).not.toBeNull();
    expect(field!.props.accessibilityValue).toEqual({ text: 'не выбрано' });
  });
});

describe('student homework photos (#333)', () => {
  it('every open / remove button names its photo', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/homeworks/hw_ilya_open' });
    const labels = (role: string) =>
      nodes(app, (node) => node.props.accessibilityRole === role && typeof node.props.accessibilityLabel === 'string').map((node) => node.props.accessibilityLabel as string);
    const remove = labels('button').filter((label) => label.startsWith('Удалить фото'));
    const open = labels('imagebutton').filter((label) => label.startsWith('Открыть фото'));
    expect(remove.length).toBeGreaterThan(1);
    expect(new Set(remove).size).toBe(remove.length);
    expect(remove[0]).toMatch(/^Удалить фото 1 из \d+, /);
    expect(open[0]).toMatch(/^Открыть фото 1 из \d+, /);
  });
});

describe('live math WebViews (#308)', () => {
  it.each([
    // The lesson board shows ONE student (a sheet) and ONE number card at a time: every statement of the
    // class is walked through its tile instead, and each card that leaves must give its slot back.
    ['lesson board', '/teacher/lessons/les_live', 'lesson-participant-toggle-', 'lesson-tile-', 13, 1],
    ['homework-plan board', '/teacher/homework-plans/hp_ready', 'draft-participant-toggle-', null, 0, 1],
  ] as const)('%s with every participant expanded keeps at most 12 WebViews', async (_name, url, prefix, tilePrefix, atLeastWalked, atLeastBlocks) => {
    const app = await visit({ as: 'teacher@example.com', url });
    const { liveMathViews } = require('@/components/math/use-math-slot') as typeof import('@/components/math/use-math-slot'); // eslint-disable-line @typescript-eslint/no-require-imports
    const idsOf = (start: string) => [...new Set(nodes(app, (node) => typeof node.props.testID === 'string' && (node.props.testID as string).startsWith(start)).map((node) => node.props.testID as string))];
    const pressId = async (id: string) => {
      const node = nodes(app, (candidate) => candidate.props.testID === id)[0];
      if (!node) return false;
      await app.rntl.act(async () => {
        app.rntl.fireEvent.press(node as never);
      });
      await app.settle();
      return true;
    };
    const ids = idsOf(prefix);
    expect(ids.length).toBeGreaterThan(1);
    const walked = new Set<string>();
    for (const id of ids) {
      if (!(await pressId(id)) || tilePrefix === null) continue;
      for (const tile of idsOf(tilePrefix)) {
        if (!(await pressId(tile))) continue;
        walked.add(tile);
        expect(webViews(app)).toBeLessThanOrEqual(12);
        expect(liveMathViews()).toBe(webViews(app));
      }
    }
    expect(walked.size).toBeGreaterThanOrEqual(atLeastWalked);
    expect(webViews(app)).toBeGreaterThan(0);
    expect(webViews(app)).toBeLessThanOrEqual(12);
    expect(liveMathViews()).toBe(webViews(app));
    // Every statement is still there: blocks without a slot keep their place (the skeleton).
    const blocks = nodes(app, (node) => node.props.accessible === true && node.props.accessibilityRole === 'text' && typeof node.props.accessibilityLabel === 'string' && /\$/.test(node.props.accessibilityLabel as string));
    expect(blocks.length).toBeGreaterThanOrEqual(atLeastBlocks);
  });

  it('the blocks on screen always win a slot; scrolling moves the slots with the viewport', async () => {
    // A fresh registry: the apps launched above left their (fake-timer) state in the module of their runtime.
    jest.resetModules();
    const { rntl, wrap } = harness();
    const { act } = rntl;
    const { useMathSlot } = require('@/components/math/use-math-slot') as typeof import('@/components/math/use-math-slot');
    const { Dimensions, Text } = require('react-native') as typeof import('react-native');
    const height = Dimensions.get('window').height;
    // 30 blocks, 200 px apart; `scroll` moves them up like a list would.
    const position = { scroll: 0 };
    const live = new Map<number, boolean>();
    function Block({ index }: { index: number }) {
      const measure = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, index * 200 - position.scroll, 300, 150);
      const has = useMathSlot(true, measure);
      live.set(index, has);
      return <Text>{has ? 'live' : 'placeholder'}</Text>;
    }
    const view = await rntl.render(wrap(<>{Array.from({ length: 30 }, (_, index) => <Block key={index} index={index} />)}</>));
    const settle = async (ms: number) => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      });
    };
    await settle(50);
    const liveNow = () => [...live.entries()].filter(([, has]) => has).map(([index]) => index);
    const onScreen = () => Array.from({ length: 30 }, (_, index) => index).filter((index) => index * 200 - position.scroll + 150 >= 0 && index * 200 - position.scroll <= height);
    expect(liveNow().length).toBeLessThanOrEqual(12);
    for (const index of onScreen()) expect(live.get(index)).toBe(true);

    // Scroll to the end: the next poll hands the slots to the blocks now on screen.
    position.scroll = 30 * 200 - height;
    await settle(900);
    expect(liveNow().length).toBeLessThanOrEqual(12);
    for (const index of onScreen()) expect(live.get(index)).toBe(true);
    expect(live.get(0)).toBe(false);
    await view.unmount();
  });
});
