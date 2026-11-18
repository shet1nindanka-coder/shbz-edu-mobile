// Repairs after the review of round 4 (shared UI layer): photo places in a grid with uploads running.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { photoGridPositions, photoPlaceLabel } from '../src/components/files/photo-label';
import { common } from '../src/i18n/mobile/common';

describe('photo places count only the photos of the set (#333 review)', () => {
  it('an upload in progress gets no place and does not grow the total', () => {
    const positions = photoGridPositions([{}, {}, { uploading: false }, { uploading: true }]);
    assert.deepEqual(positions, [{ index: 0, total: 3 }, { index: 1, total: 3 }, { index: 2, total: 3 }, undefined]);
  });

  it('the tile and the confirmation (attached photos only) name the same photo', () => {
    const attached = ['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg'];
    const items = [...attached.map(() => ({})), { uploading: true }];
    const tile = photoGridPositions(items)[0]!;
    assert.equal(photoPlaceLabel(common.ru.photos.photoOf, tile.index, tile.total, attached[0]), photoPlaceLabel(common.ru.photos.photoOf, 0, attached.length, attached[0]));
    assert.equal(photoPlaceLabel(common.ru.photos.removePhotoOf, tile.index, tile.total, attached[0]), 'Удалить фото 1 из 3, IMG_1.jpg');
  });

  it('nothing but uploads: no places', () => {
    assert.deepEqual(photoGridPositions([{ uploading: true }, { uploading: true }]), [undefined, undefined]);
    assert.deepEqual(photoGridPositions([]), []);
  });
});
