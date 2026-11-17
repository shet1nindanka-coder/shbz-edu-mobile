// One-shot notices between screens (the site's `?deleted=1` redirect params). See `one-shot-store.ts`.
export {
  clearOneShotNotices,
  noticeChannel,
  postOneShotNotice,
  subscribeOneShotNotice,
  takeOneShotNotice,
  type NoticeChannel,
} from './one-shot-store';
export { useOneShotNotice } from './use-one-shot-notice';
