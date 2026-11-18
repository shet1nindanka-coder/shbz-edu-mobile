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
