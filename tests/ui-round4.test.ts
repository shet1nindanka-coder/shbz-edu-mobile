// Round 4 fixes in the shared UI layers (pure parts): announcements gated on the focused screen and made on
// both platforms where no live region speaks (#313, #328/#329 recipe), the scroll-into-view of a scrollable
// bar (#320), the live-WebView cap of math blocks (#308), the names of photos in a set (#333), and the
// duration count-down of a wait handed over as a wall-clock moment (#344).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { advanceWaitClock, startWaitClock, waitClockSeconds } from '../src/components/retry-wait/wait-clock';
import { photoPlaceLabel } from '../src/components/files/photo-label';
import { allocateMathSlots, MATH_LIVE_CAP, viewportDistance, type MathSlotEntry } from '../src/components/math/math-slots';
import { common } from '../src/i18n/mobile/common';
import { announcementStep, shouldAnnounce } from '../src/ui/a11y';
import { centredScrollOffset } from '../src/ui/internal/scroll-into-view';

describe('announcements (#313, #328)', () => {
  it('speaks on Android only for a text that has no live region', () => {
    assert.equal(shouldAnnounce('android', null, 'Ошибка'), false);
    assert.equal(shouldAnnounce('android', null, 'Ошибка', 'native'), true);
    assert.equal(shouldAnnounce('ios', null, 'Ошибка', 'native'), true);
    assert.equal(shouldAnnounce('web', null, 'Ошибка', 'native'), false);
    assert.equal(shouldAnnounce('android', 'Ошибка', 'Ошибка', 'native'), false);
  });

  it('holds a message back while the screen is not focused and speaks it on return', () => {
    const ios = (focused: boolean) => ({ platform: 'ios', focused });
    // A background tab's refresh fails: nothing is spoken, nothing is marked as spoken.
    const hidden = announcementStep(null, 'Сервер недоступен', ios(false));
    assert.deepEqual(hidden, { last: null, speak: null });
    // The user comes back while the error is still shown: now it is news.
    const back = announcementStep(hidden.last, 'Сервер недоступен', ios(true));
    assert.deepEqual(back, { last: 'Сервер недоступен', speak: 'Сервер недоступен' });
    // Leaving and returning again does not repeat what was already spoken.
    const away = announcementStep(back.last, 'Сервер недоступен', ios(false));
    assert.equal(announcementStep(away.last, 'Сервер недоступен', ios(true)).speak, null);
    // Gone: the same message later is news again.
    const gone = announcementStep(back.last, null, ios(true));
    assert.equal(gone.last, null);
    assert.equal(announcementStep(gone.last, 'Сервер недоступен', ios(true)).speak, 'Сервер недоступен');
  });

  it('keeps iOS-only hooks silent on Android', () => {
    assert.equal(announcementStep(null, 'Ошибка', { platform: 'android', focused: true }).speak, null);
    assert.equal(announcementStep(null, 'Ошибка', { platform: 'android', focused: true, on: 'native' }).speak, 'Ошибка');
  });
});

describe('scrollable bar keeps the selection in view (#320)', () => {
  it('centres the selected segment, never before the start', () => {
    // «Метрики платформы» at x 280–440 in a 390 pt row.
    assert.equal(centredScrollOffset({ x: 280, width: 160 }, 390), 165);
    assert.equal(centredScrollOffset({ x: 10, width: 80 }, 390), 0);
  });
});

describe('live math WebViews are capped (#308)', () => {
  const entry = (id: number, distance: number | null, live = false): MathSlotEntry => ({ id, distance, live });

  it('gives everyone a slot while the set fits', () => {
    const entries = Array.from({ length: MATH_LIVE_CAP }, (_, index) => entry(index + 1, index * 10));
    assert.equal(allocateMathSlots(entries).size, MATH_LIVE_CAP);
  });

  it('never exceeds the cap, and the blocks on screen win over live ones further away', () => {
    // 23 statements of an expanded board: the first 12 got the slots on mount, the user scrolled to the end.
    const entries = Array.from({ length: 23 }, (_, index) => entry(index + 1, index < 12 ? 2.5 : index < 16 ? 0 : 0.5, index < 12));
    const granted = allocateMathSlots(entries);
    assert.equal(granted.size, MATH_LIVE_CAP);
    for (let id = 13; id <= 23; id += 1) assert.ok(granted.has(id), `block ${id} is near the viewport`);
    // One slot is left: the nearest of the live blocks keeps it (no reload on the way back).
    assert.ok(granted.has(1));
  });

  it('drops blocks far away or on a screen that cannot be seen', () => {
    const entries = [
      ...Array.from({ length: 12 }, (_, index) => entry(index + 1, 0, true)),
      entry(13, 4, true),
      entry(14, Number.POSITIVE_INFINITY, true),
    ];
    const granted = allocateMathSlots(entries);
    assert.equal(granted.has(13), false);
    assert.equal(granted.has(14), false);
  });

  it('lets unmeasured blocks wait behind measured near ones, live ones first', () => {
    const entries = [
      ...Array.from({ length: 11 }, (_, index) => entry(index + 1, 0.2)),
      entry(12, null, false),
      entry(13, null, true),
      entry(14, 5),
    ];
    const granted = allocateMathSlots(entries);
    assert.equal(granted.size, 12);
    assert.ok(granted.has(13));
    assert.equal(granted.has(12), false);
  });

  it('measures the distance from the window in screens', () => {
    assert.equal(viewportDistance(100, 50, 300, 800), 0);
    assert.equal(viewportDistance(-850, 50, 300, 800), 1);
    assert.equal(viewportDistance(2400, 50, 300, 800), 2);
    assert.equal(viewportDistance(0, 0, 0, 800), Number.POSITIVE_INFINITY);
  });
});

describe('photos in a set have their own names (#333, #332)', () => {
  it('names the place and the file, in both languages', () => {
    assert.equal(photoPlaceLabel(common.ru.photos.removePhotoOf, 1, 3, 'IMG_2042.jpg'), 'Удалить фото 2 из 3, IMG_2042.jpg');
    assert.equal(photoPlaceLabel(common.en.photos.openPhotoOf, 0, 2, ''), 'Open photo 1 of 2');
    assert.equal(photoPlaceLabel(common.ru.photos.photoOf, 2, 3, null), 'Фото 3 из 3');
  });
});

describe('a wait handed over as a moment is counted as a duration (#344)', () => {
  it('does not grow when the clock is set back', () => {
    const start = 1_000_000;
    // The refusal said 30 s; the clock is set back an hour five seconds later.
    let clock = startWaitClock(30, start);
    clock = advanceWaitClock(clock, start + 5_000);
    clock = advanceWaitClock(clock, start + 5_000 - 3_600_000);
    assert.equal(waitClockSeconds(clock), 25);
  });
});
