// Regressions of the shared UI layer: overlays opened from a focused field, the home-indicator padding under
// an open keyboard, the file viewer's untrusted deep links, number search failures, the retry-wait line.
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';

import { tap, visibleText, visit } from './support/drive';

const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };

/** Theme, language and device insets for a primitive rendered on its own. */
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

type Styled = { props: { style?: unknown }; parent: Styled | null };

function paddingBottomOf(node: Styled): number | undefined {
  const { StyleSheet } = require('react-native') as typeof import('react-native');
  const flat = StyleSheet.flatten(node.props.style as never) as { paddingBottom?: number } | undefined;
  return flat?.paddingBottom;
}

describe('overlays opened while a text field has the keyboard (iOS)', () => {
  it('a Select dismisses the keyboard as its sheet opens, on the first tap', async () => {
    const { rntl, wrap } = harness();
    const { Keyboard } = require('react-native') as typeof import('react-native');
    const { Select } = require('@/ui') as typeof import('@/ui');
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const view = await rntl.render(
      wrap(
        <Select
          label="Скорость"
          placeholder="—"
          closeLabel="Закрыть"
          value={5}
          options={[1, 5, 10].map((n) => ({ value: n, label: String(n) }))}
          onChange={() => undefined}
          testID="speed"
        />,
      ),
    );
    expect(dismiss).not.toHaveBeenCalled();
    await rntl.fireEvent.press(view.getByTestId('speed'));
    // One tap opens the sheet (nothing swallowed it) and the field behind lost the keyboard.
    expect(view.getAllByText('10').length).toBeGreaterThan(0);
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
    await view.unmount();
  });

  it('a BottomSheet that never opens leaves the keyboard alone', async () => {
    const { rntl, wrap } = harness();
    const { Keyboard, Text } = require('react-native') as typeof import('react-native');
    const { BottomSheet } = require('@/ui') as typeof import('@/ui');
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const view = await rntl.render(
      wrap(
        <BottomSheet visible={false} onClose={() => undefined} closeLabel="Закрыть">
          <Text>body</Text>
        </BottomSheet>,
      ),
    );
    expect(dismiss).not.toHaveBeenCalled();
    dismiss.mockRestore();
    await view.unmount();
  });
});

describe('home-indicator padding under an open keyboard', () => {
  it('a sticky footer sits on the keyboard on iOS and keeps the inset elsewhere', async () => {
    const { rntl, wrap } = harness();
    const { DeviceEventEmitter, Platform, Text, View } = require('react-native') as typeof import('react-native');
    const { Screen } = require('@/ui') as typeof import('@/ui');
    const { lightTheme } = require('@/theme') as { lightTheme?: { space: { md: number } } };
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
    // footer-content → its centred column → the footer bar that carries the padding.
    const bar = () => (view.getByTestId('footer-content') as unknown as Styled).parent!.parent!;
    const closed = paddingBottomOf(bar()) ?? 0;
    const md = lightTheme?.space.md ?? closed - INSETS.bottom;
    expect(closed).toBe(md + INSETS.bottom);
    const keyboard = { endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 336 }, duration: 250, easing: 'keyboard' };
    await rntl.act(() => {
      DeviceEventEmitter.emit('keyboardWillShow', keyboard);
      DeviceEventEmitter.emit('keyboardDidShow', keyboard);
    });
    expect(paddingBottomOf(bar())).toBe(Platform.OS === 'ios' ? md : md + INSETS.bottom);
    await rntl.act(() => {
      DeviceEventEmitter.emit('keyboardWillHide', keyboard);
      DeviceEventEmitter.emit('keyboardDidHide', keyboard);
    });
    expect(paddingBottomOf(bar())).toBe(md + INSETS.bottom);
    await view.unmount();
  });
});

const viewer = (files: { id: string; originalName: string; mimeType: string }[]) =>
  `/file-viewer?files=${encodeURIComponent(JSON.stringify(files))}`;

describe('file viewer deep links', () => {
  it('never shows a name written by the link, in the header or on the page', async () => {
    const forged = 'Введите пароль заново';
    const app = await visit({
      as: 'ilya@example.com',
      url: viewer([{ id: 'file_quadratic_homework', originalName: forged, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]),
      expectPath: '/file-viewer',
    });
    await app.settle();
    const text = visibleText(app);
    expect(text).not.toContain(forged);
    // The stored file's own name, read after the access check (FileService.describe).
    expect(text).toContain('quadratic-functions-homework.docx');
  });

  it('types a file from the stored row, not from the type the link wrote', async () => {
    // A PDF linked as a web page, then as a picture: still the PDF page with its real name.
    for (const mimeType of ['text/html', 'image/png']) {
      const app = await visit({
        as: 'ilya@example.com',
        url: viewer([{ id: 'file_linear_theory', originalName: 'x', mimeType }]),
        expectPath: '/file-viewer',
      });
      await app.settle();
      const text = visibleText(app);
      expect(text).toContain('linear-equations-theory.pdf');
      expect(text).not.toContain('Предпросмотр недоступен');
      expect(text).not.toContain('Не удалось показать изображение.');
      expect(text).not.toContain('Файл не найден');
      await app.unmount();
    }
  });

  it('a picture the user may not read shows "not found" and a way out instead of a spinner', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: viewer([{ id: 'file_log_answers', originalName: 'answers.png', mimeType: 'image/png' }]),
      expectPath: '/file-viewer',
    });
    await app.settle();
    expect(visibleText(app)).toContain('Файл не найден или был удалён.');
    expect(await tap(app, 'button:Закрыть')).toBe(true);
  });
});

describe('number search', () => {
  it.each(['serviceUnavailable', 'unauthorized'] as const)('shows the server text for %s, not "number not found"', async (error) => {
    const app = await visit({ as: 'teacher@example.com', url: '/number-search' });
    app.mock.controls.set('forceNextError', { method: 'shell.findNumber', error, times: 1 });
    const input = app.screen.getByTestId('number-search-input');
    await app.rntl.fireEvent.changeText(input, '112');
    await app.rntl.fireEvent(input, 'submitEditing', { nativeEvent: { text: '112' } });
    await app.settle();
    expect(app.path()).toBe('/number-search');
    expect(visibleText(app)).not.toContain('Не удалось найти тему по этому номеру.');
  });
});

describe('retry wait', () => {
  it('the handout wait line outlives the dismissed notice', async () => {
    const { rntl, wrap } = harness();
    const { HandoutNotice } = require('@/components/lessons') as typeof import('@/components/lessons');
    const handout = { open: () => undefined, dismiss: () => undefined, failure: null, wait: { seconds: 45, waiting: true, note: () => undefined } };
    const view = await rntl.render(wrap(<HandoutNotice handout={handout} testID="handout-error" />));
    expect(view.getByTestId('handout-error-wait')).toBeTruthy();
    expect(view.queryByTestId('handout-error')).toBeNull();
    await view.rerender(wrap(<HandoutNotice handout={{ ...handout, wait: { seconds: 0, waiting: false, note: () => undefined } }} testID="handout-error" />));
    expect(view.queryByTestId('handout-error-wait')).toBeNull();
    await view.unmount();
  });
});

describe('upload content checks on the device', () => {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);

  /** A file the document picker left in the app cache (`file://`), written through expo-file-system. */
  function pickedFile(name: string, bytes: Uint8Array): string {
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    file.write(bytes);
    return file.uri;
  }

  async function upload(app: Awaited<ReturnType<typeof visit>>, file: { uri: string; name: string; mimeType: string; size: number }) {
    const pending = app.mock.content.uploadFile(file).then(
      (ref) => ({ ok: true as const, ref }),
      (error: unknown) => ({ ok: false as const, code: (error as { code?: string }).code }),
    );
    await app.advance(3000);
    return pending;
  }

  it('a PDF picked under a .docx name is refused like on the site; a real PDF goes through', async () => {
    const app = await visit({ as: 'dev@example.com', url: '/developer/topics' });
    const mislabelled = pickedFile('theory.docx', PDF_BYTES);
    expect(await upload(app, { uri: mislabelled, name: 'theory.docx', mimeType: DOCX, size: PDF_BYTES.length })).toEqual({
      ok: false,
      code: 'uploadUnsupportedType',
    });
    // The declared size must be the real one.
    const pdf = pickedFile('theory.pdf', PDF_BYTES);
    expect(await upload(app, { uri: pdf, name: 'theory.pdf', mimeType: 'application/pdf', size: PDF_BYTES.length + 10 })).toEqual({
      ok: false,
      code: 'uploadRejected',
    });
    const accepted = await upload(app, { uri: pdf, name: 'theory.pdf', mimeType: 'application/pdf', size: PDF_BYTES.length });
    expect(accepted.ok).toBe(true);
    await app.unmount();
  });
});
