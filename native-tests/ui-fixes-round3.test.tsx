// Regressions of the shared UI layer, round 3: what VoiceOver hears (announcements, field errors, card
// names), the Android date-time dialogs (value, language, Moscow zone), the sticky footer column on wide
// windows, a cool-down that a clock set back cannot lengthen, a file description retried with the page,
// an abandoned number search, and sheets left open under navigation started from outside the screen.
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';

import { byTestId, pressTestId, typeTestId, visit } from './support/drive';
import { device } from './support/fakes';
import type { AppHandle } from './support/launch';
import { all, flattenStyle, textOf, type HostNode } from './support/tree';

const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };

/** Theme, language and device insets for a primitive rendered on its own. */
function harness(locale: 'ru' | 'en' = 'ru'): { rntl: typeof import('@testing-library/react-native'); wrap: (node: ReactNode) => ReactElement } {
  jest.useRealTimers();
  const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
  const { ThemeProvider } = require('@/theme') as typeof import('@/theme');
  const { I18nProvider } = require('@/i18n') as typeof import('@/i18n');
  const { SafeAreaInsetsContext } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
  const wrap = (node: ReactNode): ReactElement => (
    <SafeAreaInsetsContext value={INSETS}>
      <ThemeProvider mode="light">
        <I18nProvider locale={locale} onChangeLocale={() => undefined}>
          {node}
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaInsetsContext>
  );
  return { rntl, wrap };
}

const isIos = () => (require('react-native') as typeof import('react-native')).Platform.OS === 'ios';

/** Spies on what is spoken through `AccessibilityInfo` (the module object the app imports). */
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

describe('announcements for VoiceOver (#233)', () => {
  it('an error notice is spoken once on iOS when it appears or changes, never on Android (live region)', async () => {
    const { rntl, wrap } = harness();
    const { Notice } = require('@/ui') as typeof import('@/ui');
    const spy = announcements();
    const view = await rntl.render(wrap(<Notice tone="error" text="Неверный логин или пароль." />));
    await view.rerender(wrap(<Notice tone="error" text="Неверный логин или пароль." />));
    await view.rerender(wrap(<Notice tone="error" text="Слишком много попыток." />));
    await view.rerender(wrap(<Notice tone="success" text="Сохранено" />));
    expect(spy.spoken()).toEqual(isIos() ? ['Неверный логин или пароль.', 'Слишком много попыток.'] : []);
    spy.restore();
    await view.unmount();
  });

  it('a field error is spoken on iOS and becomes the hint of its input', async () => {
    const { rntl, wrap } = harness();
    const { TextField } = require('@/ui') as typeof import('@/ui');
    const spy = announcements();
    const view = await rntl.render(wrap(<TextField label="Логин" value="" onChangeText={() => undefined} testID="field" />));
    expect(view.getByTestId('field').props.accessibilityHint).toBeUndefined();
    await view.rerender(wrap(<TextField label="Логин" value="" error="Введите логин" onChangeText={() => undefined} testID="field" />));
    expect(view.getByTestId('field').props.accessibilityHint).toBe('Введите логин');
    expect(view.getByTestId('field').props.accessibilityLabel).toBe('Логин');
    expect(spy.spoken()).toEqual(isIos() ? ['Введите логин'] : []);
    spy.restore();
    await view.unmount();
  });

  it('an undo toast says what happened and that it can be undone (iOS)', async () => {
    const { rntl, wrap } = harness();
    const { UndoToast } = require('@/components/undo-toast') as typeof import('@/components/undo-toast');
    const spy = announcements();
    const view = await rntl.render(wrap(<UndoToast text="№ 12 убран из набора" undoLabel="Отменить" onUndo={() => undefined} />));
    expect(spy.spoken()).toEqual(isIos() ? ['№ 12 убран из набора. Отменить'] : []);
    spy.restore();
    await view.unmount();
  });

  it('an error state whose description counts down is spoken once, not at every tick', async () => {
    const { rntl, wrap } = harness();
    const { ErrorState } = require('@/ui') as typeof import('@/ui');
    const spy = announcements();
    const state = (left: number) => (
      <ErrorState title="Ошибка" description={`Слишком много запросов. Повторить можно через ${left} секунд.`} announcement="Ошибка. Слишком много запросов." />
    );
    const view = await rntl.render(wrap(state(30)));
    await view.rerender(wrap(state(29)));
    await view.rerender(wrap(state(28)));
    expect(spy.spoken()).toEqual(isIos() ? ['Ошибка. Слишком много запросов.'] : []);
    spy.restore();
    await view.unmount();
  });
});

describe('selectable number card (#237)', () => {
  it('speaks the student status and the footnote in its name, the statement in its hint', async () => {
    const { rntl, wrap } = harness();
    const { NumberSelectCard } = require('@/components/number-select-card') as typeof import('@/components/number-select-card');
    const view = await rntl.render(
      wrap(
        <NumberSelectCard
          number="118"
          status="RED"
          selected={false}
          conditionLatex="Решите уравнение $x+1=2$."
          footnote="Уже в ДЗ с дедлайном"
          onToggle={() => undefined}
          testID="card"
        />,
      ),
    );
    const card = view.getByTestId('card');
    expect(card.props.accessibilityLabel).toBe('Выбрать № 118, Нужна помощь преподавателя, Уже в ДЗ с дедлайном');
    expect(card.props.accessibilityHint).toBe('Решите уравнение $x+1=2$.');
    await view.rerender(
      wrap(<NumberSelectCard number="120" status={null} selected conditionLatex={null} onToggle={() => undefined} testID="card" />),
    );
    expect(view.getByTestId('card').props.accessibilityLabel).toBe('Выбрать № 120, Не отмечено');
    await view.unmount();
  });

  it('CardPressArea keeps nested controls outside its press target', async () => {
    const { rntl, wrap } = harness();
    const { Card, CardPressArea, IconButton, Text } = require('@/ui') as typeof import('@/ui');
    const opened = jest.fn();
    const menu = jest.fn();
    const view = await rntl.render(
      wrap(
        <Card>
          <CardPressArea onPress={opened} accessibilityLabel="Урок 12 ноября" accessibilityParts={['Идёт', null, '45 минут']} testID="area">
            <Text>Урок 12 ноября</Text>
          </CardPressArea>
          <IconButton icon="more" accessibilityLabel="Действия с уроком" onPress={menu} testID="menu" />
        </Card>,
      ),
    );
    expect(view.getByTestId('area').props.accessibilityLabel).toBe('Урок 12 ноября, Идёт, 45 минут');
    // The menu is not a descendant of the press target, so a screen reader reaches it on its own.
    type Node = { parent: Node | null; props: { testID?: string } };
    for (let node: Node | null = view.getByTestId('menu') as unknown as Node; node; node = node.parent) {
      expect(node.props.testID).not.toBe('area');
    }
    await rntl.fireEvent.press(view.getByTestId('menu'));
    expect(menu).toHaveBeenCalledTimes(1);
    expect(opened).not.toHaveBeenCalled();
    await view.unmount();
  });
});

describe('date-time picker body (#243, #245, #211)', () => {
  it('Android rows carry the chosen value; the dialogs get Moscow time and the app-language buttons', async () => {
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS !== 'android') return;
    const { rntl, wrap } = harness('en');
    const { DateTimeField } = require('@/ui') as typeof import('@/ui');
    const { useDateTimeLabels } = require('@/components/date-time') as typeof import('@/components/date-time');
    function Field() {
      return <DateTimeField value="2026-03-29T02:30" onChange={() => undefined} placeholder="Pick" labels={useDateTimeLabels()} locale="en" testID="dt" />;
    }
    const view = await rntl.render(wrap(<Field />));
    await rntl.fireEvent.press(view.getByTestId('dt'));
    const dateRow = view.getByTestId('date-time-date-row');
    const timeRow = view.getByTestId('date-time-time-row');
    expect(dateRow.props.accessibilityValue).toEqual({ text: '29/03/2026' });
    expect(timeRow.props.accessibilityValue).toEqual({ text: '02:30' });

    device().calls.length = 0;
    await rntl.act(async () => {
      rntl.fireEvent.press(timeRow);
      await Promise.resolve();
    });
    const open = device().calls.find((call) => call.name === 'RNCTimePicker.open');
    expect(open).toBeTruthy();
    const options = open!.args[0] as { value: number; timeZoneName?: string; dialogButtons: { positive: { label?: string }; negative: { label?: string } } };
    expect(options.timeZoneName).toBe('Europe/Moscow');
    // The real instant of Moscow 02:30 on 29 Mar 2026 (UTC+3), whatever the device zone.
    expect(options.value).toBe(Date.UTC(2026, 2, 28, 23, 30));
    expect(options.dialogButtons.positive.label).toBe('OK');
    expect(options.dialogButtons.negative.label).toBe('Cancel');
    await view.unmount();
  });
});

describe('sticky footer on a wide window (#253)', () => {
  it('the gutter sits inside the footer column, as on the content', async () => {
    const { rntl, wrap } = harness();
    const { Text, View } = require('react-native') as typeof import('react-native');
    const { Screen } = require('@/ui') as typeof import('@/ui');
    const { lightTheme } = require('@/theme') as { lightTheme: { space: { gutter: number } } };
    const view = await rntl.render(
      wrap(
        <Screen
          footer={
            <View testID="footer-content">
              <Text>Сохранить</Text>
            </View>
          }
        >
          <Text>body</Text>
        </Screen>,
      ),
    );
    type Styled = { props: { style?: unknown }; parent: Styled | null };
    const column = (view.getByTestId('footer-content') as unknown as Styled).parent!;
    const bar = column.parent!;
    expect(flattenStyle(column.props.style)).toMatchObject({ maxWidth: 720, paddingHorizontal: lightTheme.space.gutter });
    expect(flattenStyle(bar.props.style).paddingHorizontal).toBeUndefined();
    await view.unmount();
  });
});

describe('cool-down as a duration (#213)', () => {
  it('a clock set back an hour does not lengthen a running lock', async () => {
    const { rntl, wrap } = harness();
    const { Text } = require('react-native') as typeof import('react-native');
    const { useDurationLock } = require('@/components/retry-wait') as typeof import('@/components/retry-wait');
    let now = Date.parse('2026-11-17T09:00:00Z');
    jest.useFakeTimers({ now });
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    let start: ((seconds: number) => void) | null = null;
    function Probe() {
      const lock = useDurationLock();
      start = lock.start;
      return <Text testID="left">{String(lock.seconds)}</Text>;
    }
    const view = await rntl.render(wrap(<Probe />));
    await rntl.act(async () => {
      start!(60);
    });
    expect(view.getByTestId('left').props.children).toBe('60');
    await rntl.act(async () => {
      now += 10_000;
      jest.advanceTimersByTime(1000);
    });
    expect(view.getByTestId('left').props.children).toBe('50');
    await rntl.act(async () => {
      now -= 3_600_000;
      jest.advanceTimersByTime(1000);
    });
    expect(view.getByTestId('left').props.children).toBe('50');
    await rntl.act(async () => {
      now += 50_000;
      jest.advanceTimersByTime(1000);
    });
    expect(view.getByTestId('left').props.children).toBe('0');
    clock.mockRestore();
    await view.unmount();
    jest.useRealTimers();
  });
});

describe('file viewer: a description that failed without an answer (#200)', () => {
  function texts(view: { toJSON: () => unknown }): string {
    const out: string[] = [];
    const walk = (n: unknown): void => {
      if (n == null) return;
      if (typeof n === 'string') {
        out.push(n);
        return;
      }
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      ((n as { children?: unknown[] }).children ?? []).forEach(walk);
    };
    walk(view.toJSON());
    return out.join(' | ');
  }

  it('is asked again with the page retry, and the file then gets its real name and type', async () => {
    const { rntl, wrap } = harness();
    const { ApiError } = require('@/api/errors') as typeof import('@/api/errors');
    const { FileServiceProvider } = require('@/services/files/file-service-context') as typeof import('@/services/files/file-service-context');
    const { FileViewer } = require('@/components/files') as typeof import('@/components/files');
    let describeCalls = 0;
    let downloadCalls = 0;
    const service = {
      source: () => ({ uri: '', headers: {} }),
      describe: async (id: string) => {
        describeCalls += 1;
        if (describeCalls === 1) throw new ApiError({ code: 'network', status: 0, message: 'Нет соединения' });
        return { id, originalName: 'theory.pdf', mimeType: 'application/pdf', size: 1000 };
      },
      download: async () => {
        downloadCalls += 1;
        return 'file:///cache/theory.pdf';
      },
    };
    const view = await rntl.render(
      wrap(
        <FileServiceProvider service={service as never}>
          <FileViewer files={[{ id: 'f1', originalName: '', mimeType: '' }]} describeIds={['f1']} onClose={() => undefined} testID="v" />
        </FileServiceProvider>,
      ),
    );
    await rntl.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const first = texts(view);
    expect(first).toContain('Нет соединения');
    expect(first).toContain('Повторить');
    // Nothing is downloaded or handed over without the stored type.
    expect(downloadCalls).toBe(0);
    expect(view.getByTestId('v-share').props.accessibilityState).toMatchObject({ disabled: true });

    await rntl.act(async () => {
      rntl.fireEvent.press(view.getByText('Повторить'));
    });
    await rntl.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const after = texts(view);
    expect(describeCalls).toBe(2);
    expect(after).toContain('theory.pdf');
    expect(after).not.toContain('Предпросмотр недоступен');
    expect(after).not.toContain('Нет соединения');
    await view.unmount();
  });
});

describe('an abandoned number search (#214, #224)', () => {
  it('closing the search while it runs leaves the user where they went', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/number-search' });
    await typeTestId(app, 'number-search-input', '010203');
    const input = byTestId(app, 'number-search-input');
    await app.rntl.act(async () => {
      app.rntl.fireEvent(input as never, 'submitEditing', { nativeEvent: { text: '010203' } });
    });
    // Closed before the answer arrives.
    expect(await pressTestId(app, 'number-search-close')).toBe(true);
    await app.settle();
    expect(app.path()).toBe('/student');
  });

  it('closing the search and opening Settings: the late answer neither navigates nor closes Settings', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/number-search' });
    await typeTestId(app, 'number-search-input', '010203');
    const input = byTestId(app, 'number-search-input');
    await app.rntl.act(async () => {
      app.rntl.fireEvent(input as never, 'submitEditing', { nativeEvent: { text: '010203' } });
    });
    // Closed and Settings opened before the answer arrives (no time passes in between).
    await app.rntl.act(async () => {
      app.rntl.fireEvent.press(byTestId(app, 'number-search-close') as never);
    });
    await app.rntl.act(async () => {
      app.router.push('/settings');
    });
    expect(app.path()).toBe('/settings');
    await app.settle();
    expect(app.path()).toBe('/settings');
  });
});

describe('overlays of a screen left by navigation from outside (#216)', () => {
  /** RN `Modal` windows that are open now, with their text. */
  const openModals = (app: AppHandle): string[] =>
    all(app.screen.container as unknown as HostNode, (node) => node.type === 'Modal' && node.props.visible !== false).map((node) =>
      textOf(node),
    );

  it('a reminder tap closes the photo-source sheet of the homework before opening the lesson', async () => {
    const app = await visit({ as: 'artem@example.com', url: '/student/homeworks/hw_artem_issued' });
    const add = all(app.screen.container as unknown as HostNode, (node) => typeof node.props.onClick === 'function' || typeof node.props.accessibilityLabel === 'string').find(
      (node) => node.props.accessibilityLabel === 'Добавить фото' && node.props.accessibilityRole === 'button',
    );
    expect(add).toBeTruthy();
    await app.rntl.act(async () => {
      app.rntl.fireEvent.press(add as never);
    });
    await app.settle();
    expect(openModals(app).some((text) => text.includes('Сделать фото'))).toBe(true);

    const { navigateTo } = require('@/navigation') as typeof import('@/navigation');
    await app.rntl.act(async () => {
      navigateTo({ screen: 'student.lesson' }, 'STUDENT');
    });
    await app.settle();
    expect(app.path()).toMatch(/^\/student\/lesson/);
    expect(openModals(app).some((text) => text.includes('Сделать фото'))).toBe(false);
  });
});

describe('font scale and fixed rows (#239)', () => {
  /** The OS text size the app starts with (390 pt phone); the next launch loads a fresh `Dimensions`. */
  const withFontScale = (fontScale: number) => () => {
    const { Dimensions } = require('react-native') as typeof import('react-native');
    const window = { width: 390, height: 844, scale: 3, fontScale };
    Dimensions.set({ window, screen: window });
  };

  // The Theme control sits on the right of its row now, next to the label «Тема»: there is no room for
  // «Системная» at any text size, so the segment always carries the site's short name — the long one is
  // never drawn in the fixed row (it was cut at 1.2). A screen reader still hears the full name.
  it.each([1, 1.2, 1.3] as const)('the Theme control at font scale %s says «Авто», never a cut «Системная»', async (fontScale) => {
    const app = await visit({ as: 'ilya@example.com', url: '/settings', arrange: withFontScale(fontScale) });
    const theme = byTestId(app, 'settings-theme');
    expect(theme).toBeTruthy();
    expect(textOf(theme!)).toContain('Авто');
    expect(textOf(theme!)).not.toContain('Системная');
    const system = all(theme!, (node) => node.props.accessibilityRole === 'radio' && textOf(node) === 'Авто')[0];
    expect(system?.props.accessibilityLabel).toBe('Системная');
  });
});
