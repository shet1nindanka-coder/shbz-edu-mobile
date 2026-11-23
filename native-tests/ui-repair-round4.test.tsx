// Repairs after the review of round 4 (shared UI layer):
// - a note's rate-limit wait is ONE clock for the shown countdown and the real gate: with the device clock
//   set back, «Повторить» appears when the wait is over and then really sends (#315 / #344 review);
// - events of a screen (the AI check's status) are spoken only while that screen is in front, and the latest
//   one is spoken on return (`useEventAnnouncement`, #313 review);
// - photo places in a grid count only the photos of the set, not uploads in progress (#333 review).
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';

import { byTestId, fill, tap, visit } from './support/drive';
import { showHomeworkNumber } from './support/student';
import { all, type HostNode } from './support/tree';

const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };

function harness(): { rntl: typeof import('@testing-library/react-native'); wrap: (node: ReactNode) => ReactElement } {
  jest.useRealTimers();
  const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
  const { ThemeProvider } = require('@/theme') as typeof import('@/theme');
  const { I18nProvider } = require('@/i18n') as typeof import('@/i18n');
  const { FileServiceProvider } = require('@/services/files/file-service-context') as typeof import('@/services/files/file-service-context');
  const { SafeAreaInsetsContext } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
  const files = { source: () => ({ uri: 'file:///thumb.png' }) } as never;
  const wrap = (node: ReactNode): ReactElement => (
    <SafeAreaInsetsContext value={INSETS}>
      <ThemeProvider mode="light">
        <I18nProvider locale="ru" onChangeLocale={() => undefined}>
          <FileServiceProvider service={files}>{node}</FileServiceProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaInsetsContext>
  );
  return { rntl, wrap };
}

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

describe('note save refused with a wait, device clock set back (#315 review)', () => {
  it.each([
    ['number screen', '/student/numbers/118', '#number-note-input', 'number-note-retry', 'number-note-wait'],
    ['homework card', '/student/homeworks/hw_ilya_overdue', '#number-note-120', 'number-note-retry-120', 'number-note-wait-120'],
  ])('%s: «Повторить» appears when the wait is over and really sends', async (_name, url, input, retryId, waitId) => {
    const app = await visit({ as: 'ilya@example.com', url });
    // The homework shows one number card: № 120 is chosen in the strip first.
    if (input === '#number-note-120') await showHomeworkNumber(app, '120');
    const saves = jest.spyOn(app.runtime.api.studentStudy, 'saveNumberNote');
    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'rateLimited', times: 1 });
    expect(await fill(app, input, 'заметка под лимитом')).toBe(true);
    await app.advance(1500);
    await app.settle();
    expect(byTestId(app, waitId)).not.toBeNull();
    expect(byTestId(app, retryId)).toBeNull();
    const refused = saves.mock.calls.length;
    expect(refused).toBeGreaterThan(0);

    // The device clock goes back an hour while the wait runs.
    jest.setSystemTime(Date.now() - 3600_000);
    for (let step = 0; step < 70; step += 1) await app.advance(1000);
    await app.settle();
    expect(byTestId(app, waitId)).toBeNull();
    expect(byTestId(app, retryId)).not.toBeNull();

    // The button is shown only when it can send: pressing it sends the draft.
    await tap(app, `#${retryId}`);
    await app.advance(1500);
    await app.settle();
    expect(saves.mock.calls.length).toBe(refused + 1);
    expect(saves.mock.calls.at(-1)?.[1]).toBe('заметка под лимитом');
  });
});

describe('screen events are spoken only from the focused screen (#313 review)', () => {
  it('useEventAnnouncement holds a message while inactive and speaks the latest one on return', async () => {
    const { rntl, wrap } = harness();
    const { useEventAnnouncement } = require('@/ui') as typeof import('@/ui');
    const { useEffect } = require('react') as typeof import('react');
    function Speaker({ active, message }: { active: boolean; message: string | null }) {
      const announce = useEventAnnouncement(active);
      useEffect(() => {
        if (message) announce(message);
      }, [announce, message]);
      return null;
    }
    const voice = announcements();
    try {
      const view = await rntl.render(wrap(<Speaker active message="первое" />));
      expect(voice.spoken()).toEqual(['первое']);
      await view.rerender(wrap(<Speaker active={false} message="первое" />));
      await view.rerender(wrap(<Speaker active={false} message="второе" />));
      await view.rerender(wrap(<Speaker active={false} message="третье" />));
      expect(voice.spoken()).toEqual(['первое']);
      await view.rerender(wrap(<Speaker active message="третье" />));
      expect(voice.spoken()).toEqual(['первое', 'третье']);
      await view.rerender(wrap(<Speaker active message="третье" />));
      expect(voice.spoken()).toEqual(['первое', 'третье']);
      await view.unmount();
    } finally {
      voice.restore();
    }
  });

  it('the end of a homework check is not spoken over another tab; it is spoken on return', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/homeworks/hw_ilya_open' });
    const voice = announcements();
    try {
      await tap(app, '#homework-check-start');
      await app.advance(1500);
      await app.settle();
      expect(byTestId(app, 'homework-check-running')).not.toBeNull();
      expect(voice.spoken()).toEqual(['Проверка решения выполняется.']);

      await app.rntl.act(async () => {
        app.router.navigate('/student/lesson' as never);
      });
      for (let step = 0; step < 40; step += 1) await app.advance(1000);
      expect(app.path()).toMatch(/^\/student\/lesson/);
      const done = () => voice.spoken().filter((text) => text.startsWith('Проверка завершена'));
      const onServer = app.mock.studentWork.getHomework('hw_ilya_open');
      await app.advance(1500);
      expect((await onServer).assignment.latestCheck?.status).toBe('DONE');
      expect(done()).toEqual([]);

      await app.rntl.act(async () => {
        app.router.navigate('/student/homeworks/hw_ilya_open' as never);
      });
      await app.advance(1500);
      await app.settle();
      expect(done().length).toBe(1);
    } finally {
      voice.restore();
    }
  });
});

describe('photo places with an upload running (#333 review)', () => {
  it('the tiles count the photos of the set only; the uploading tile has no remove button', async () => {
    const { rntl, wrap } = harness();
    const { PhotoGrid } = require('@/components/files') as typeof import('@/components/files');
    const photos = [
      { key: 'p1', fileId: 'f1', name: 'IMG_1.jpg' },
      { key: 'p2', fileId: 'f2', name: 'IMG_2.jpg' },
      { key: 'p3', fileId: 'f3', name: 'IMG_3.jpg' },
      { key: 'up', fileId: 'up', name: 'IMG_4.jpg', localUri: 'file:///IMG_4.jpg', uploading: true },
    ];
    const view = await rntl.render(wrap(<PhotoGrid photos={photos} onRemove={() => undefined} onOpen={() => undefined} testID="grid" />));
    await rntl.act(async () => {
      rntl.fireEvent(view.getByTestId('grid'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 200 } } });
    });
    const labels = all(view.container as unknown as HostNode, (node) => typeof node.props.accessibilityLabel === 'string')
      .map((node) => node.props.accessibilityLabel as string);
    const remove = [...new Set(labels.filter((label) => label.startsWith('Удалить фото')))];
    expect(remove).toEqual(['Удалить фото 1 из 3, IMG_1.jpg', 'Удалить фото 2 из 3, IMG_2.jpg', 'Удалить фото 3 из 3, IMG_3.jpg']);
    expect(labels.some((label) => / из 4/.test(label))).toBe(false);
    await view.unmount();
  });
});
