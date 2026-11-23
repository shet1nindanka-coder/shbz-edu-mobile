// Repairs after the review of round 3 (teacher, groups, content and developer areas): a student report that
// finishes while the teacher is elsewhere, and what screen readers hear and when.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, fill, hasTestId, tap, visibleText, visit } from './support/drive';
import type { AppHandle } from './support/launch';

const ANNA = 'teacher@example.com';

const platformOs = () => (require('react-native') as typeof import('react-native')).Platform.OS; // eslint-disable-line @typescript-eslint/no-require-imports

/** What the app says to screen readers, both APIs. */
function spyAnnouncements() {
  const { AccessibilityInfo } = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
  const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  return {
    spoken: () => [...queued.mock.calls.map((call) => call[0]), ...plain.mock.calls.map((call) => call[0])],
    plain: () => plain.mock.calls.map((call) => call[0]),
    clear: () => {
      queued.mockClear();
      plain.mockClear();
    },
    restore: () => {
      queued.mockRestore();
      plain.mockRestore();
    },
  };
}

/** The PDF itself is built by the mock's file layer, which the harness does not run: the report arrives after `ms`. */
function fakeStudentReport(app: AppHandle, ms: number) {
  return jest.spyOn(app.runtime.api.teacherStudents, 'downloadStudentReport').mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ uri: 'file:///cache/student-report.pdf', fileName: 'Отчёт — Илья — Неделя.pdf' }), ms);
      }),
  );
}

function fakeGroupReport(app: AppHandle, ms: number) {
  return jest.spyOn(app.runtime.api.groups, 'downloadGroupAttendancePdf').mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ uri: 'file:///cache/report.pdf', fileName: 'Посещаемость — 8А — Неделя.pdf' }), ms);
      }),
  );
}

describe('student card report that finishes after the teacher left', () => {
  it('is kept on the card and offered on return, not thrown away', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    const voice = spyAnnouncements();
    try {
      const download = fakeStudentReport(app, 8000);
      await tap(app, '#student-card-menu');
      // Not `tap`: it waits for the screen to settle, i.e. for the report itself.
      await app.rntl.fireEvent.press(app.screen.getByTestId('student-menu-report-7d'));
      await app.advance(600);
      expect(download).toHaveBeenCalledTimes(1);
      // The teacher opens another screen over the card (a notification tap, a lesson): the card stays below.
      await app.rntl.act(async () => {
        app.router.push('/settings' as never);
      });
      await app.advance(1500);
      expect(app.path()).toBe('/settings');
      voice.clear();
      await app.advance(8000);
      await app.settle();
      expect(app.path()).toBe('/settings');
      // Nothing is opened or said over the screen the teacher went to.
      expect(voice.spoken().filter((text) => text.includes('Отчёт готов'))).toEqual([]);

      await app.rntl.act(async () => {
        app.router.back();
      });
      await app.settle();
      expect(app.path()).toContain('/teacher/students/usr_ilya');
      expect(hasTestId(app, 'student-report-ready')).toBe(true);
      expect(visibleText(app)).toContain('Отчёт готов: Отчёт: 7 дней');
      // VoiceOver hears it when the card is in front again (Android reads the notice's live region).
      if (platformOs() === 'ios') expect(voice.spoken()).toContain('Отчёт готов: Отчёт: 7 дней');

      await tap(app, '#student-report-ready-open');
      await app.settle();
      expect(app.path()).toContain('file-viewer');
      expect(visibleText(app)).toContain('Отчёт: 7 дней');
      expect(download).toHaveBeenCalledTimes(1);
    } finally {
      voice.restore();
    }
  });

  it('still opens at once while the teacher stays on the card', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    fakeStudentReport(app, 500);
    await tap(app, '#student-card-menu');
    await tap(app, '#student-menu-report-30d');
    await app.advance(1500);
    await app.settle();
    expect(app.path()).toContain('file-viewer');
    expect(visibleText(app)).toContain('Отчёт: 30 дней');
  });
});

describe('group report ready notice (#215)', () => {
  it('is announced when the group screen is in front again, not over the other screen', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups/grp_8a' });
    await tap(app, 'tab:Посещаемость');
    await app.settle();
    const voice = spyAnnouncements();
    try {
      fakeGroupReport(app, 2500);
      // The three periods are folded behind the «PDF» button: a sheet of rows.
      await tap(app, '#group-attendance-pdf');
      await app.rntl.fireEvent.press(app.screen.getByTestId('group-attendance-pdf-7d'));
      await app.advance(200);
      await app.rntl.act(async () => {
        app.router.navigate('/teacher/calls' as never);
      });
      await app.settle();
      voice.clear();
      await app.advance(3000);
      await app.settle();
      expect(voice.spoken().filter((text) => text.includes('Отчёт готов'))).toEqual([]);

      await app.open('/teacher/groups/grp_8a');
      expect(hasTestId(app, 'group-attendance-report-error-ready')).toBe(true);
      if (platformOs() === 'ios') expect(voice.spoken()).toContain('Отчёт готов: Посещаемость: 7 дней');
    } finally {
      voice.restore();
    }
  });
});

describe('credentials sheet: a repeated copy', () => {
  it('is spoken again on Android, where the unchanged live region stays silent', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students' });
    await tap(app, '#students-add');
    await fill(app, '#create-student-name', 'Новый Ученик');
    await fill(app, '#create-student-login', 'repeat.copy@example.com');
    await fill(app, '#create-student-password', 'secret-pass-9');
    await tap(app, '#create-student-submit');
    expect(hasTestId(app, 'credentials-sheet')).toBe(true);
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard'); // eslint-disable-line @typescript-eslint/no-require-imports
    const clipboard = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
    const voice = spyAnnouncements();
    const feedback = () => byTestId(app, 'credentials-feedback');
    try {
      await tap(app, '#credentials-line-login');
      await app.settle();
      expect(clipboard).toHaveBeenCalledWith('repeat.copy@example.com');
      expect(feedback()?.props.accessibilityLiveRegion).toBe('polite');
      const said = feedback()?.children.join('') ?? '';
      expect(said).toMatch(/Логин/);
      // The first copy changes the live region: nothing is announced directly on Android.
      if (platformOs() === 'android') expect(voice.plain()).toEqual([]);
      await tap(app, '#credentials-line-login');
      await app.settle();
      expect(feedback()?.children.join('')).toBe(said);
      if (platformOs() === 'android') expect(voice.plain()).toEqual([said]);
      else expect(voice.plain()).toEqual([]);
    } finally {
      voice.restore();
      clipboard.mockRestore();
    }
  });
});
