// The bell sheet: «mark all read» pressed while the list refetch that the sheet started on opening is still
// on its way. That answer was read before the write; it must not bring the unread rows back after the
// count went to zero (which also hides the button, so the user could not repeat the action).
import { describe, expect, it } from '@jest/globals';

import { all, isHidden } from './support/tree';
import { hasTestId, pressTestId, root, visit } from './support/drive';

describe('notifications sheet', () => {
  it('«mark all read» during the opening refetch leaves every row read', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/notifications' });
    expect(hasTestId(app, 'notifications-mark-all')).toBe(true);
    // The list read runs on the server before the write and answers after the optimistic patch.
    app.mock.controls.set('latency', { minMs: 400, maxMs: 400 });
    await app.rntl.act(async () => {
      void app.queryClient.refetchQueries({ queryKey: ['shell', 'listNotifications'] });
    });
    app.mock.controls.set('latency', { minMs: 900, maxMs: 900 });
    await pressTestId(app, 'notifications-mark-all');
    await app.settle();
    const unread = all(
      root(app),
      (node) =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('notification-') &&
        !isHidden(node) &&
        (node.props.accessibilityState as { selected?: boolean } | undefined)?.selected === true,
    );
    expect(unread.map((node) => String(node.props.testID))).toEqual([]);
    expect(hasTestId(app, 'notifications-mark-all')).toBe(false);
  });
});
