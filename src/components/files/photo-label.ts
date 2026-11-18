import { format } from '@/lib/i18n/format';
import { accessibilityLabelOf } from '@/ui/a11y';

/**
 * The spoken name of a photo by its place in a set: `template` is one of `m.common.photos.photoOf`
 * («Фото {n} из {total}»), `openPhotoOf`, `removePhotoOf`; the file name follows when known —
 * «Удалить фото 2 из 3, IMG_2042.jpg». Use the same words in the confirmation of a removal, so the user
 * hears which photo the dialog is about.
 */
export function photoPlaceLabel(template: string, index: number, total: number, name?: string | null): string {
  return accessibilityLabelOf([format(template, { n: index + 1, total }), name]);
}

/**
 * The place of every tile of a grid in its set (`PhotoGrid`): only photos that are in the set count — a photo
 * still uploading is not one of them yet (it has no remove button and may still fail), so it gets no place,
 * and the others are numbered among themselves. «Удалить фото 1 из 3» on the tile then matches «Фото 1 из 3»
 * in the confirmation, which counts the attached photos only.
 */
export function photoGridPositions(items: readonly { uploading?: boolean }[]): ({ index: number; total: number } | undefined)[] {
  const total = items.filter((item) => !item.uploading).length;
  let next = 0;
  return items.map((item) => (item.uploading ? undefined : { index: next++, total }));
}
