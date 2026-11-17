// Every developer screen, opened by deep link on a cold start.
import { describe, it } from '@jest/globals';

import { visit } from './support/drive';

const DEV = 'dev@example.com';
const TOPICS = ['top_linear', 'top_quadratic', 'top_derivative', 'top_log', 'top_systems', 'top_empty', 'top_word'];
const PANEL_TABS = ['status', 'actions', 'broadcast', 'settings'];

describe('developer screens as dev@example.com', () => {
  it.each([
    ['content.topics', '/developer/topics'],
    ['developer.accounts', '/developer/accounts'],
    ['calls.list', '/developer/calls'],
    ['calls.list with a student to flash', '/developer/calls?studentId=usr_kirill'],
    ['stats.main', '/developer/statistics'],
    ['developer.panel', '/developer/panel'],
    ['developer.journal', '/developer/panel/journal'],
    ['developer.journal filtered', '/developer/panel/journal?outcome=failed&days=7'],
  ])('%s  %s', async (_screen, url) => {
    await visit({ as: DEV, url });
  });

  it.each(PANEL_TABS)('developer.panel  /developer/panel?tab=%s', async (tab) => {
    await visit({ as: DEV, url: `/developer/panel?tab=${tab}` });
  });

  it.each(TOPICS)('content.topic  /developer/topics/%s', async (topicId) => {
    await visit({ as: DEV, url: `/developer/topics/${topicId}` });
  });

  it.each(TOPICS)('content.topicEdit  /developer/topics/%s/edit', async (topicId) => {
    await visit({ as: DEV, url: `/developer/topics/${topicId}/edit` });
  });

  it.each([['top_linear', '118'], ['top_quadratic', '204'], ['top_log', '010207'], ['top_word', '501'], ['top_derivative', '301']])('content.number  /developer/topics/%s/numbers/%s', async (topicId, number) => {
    await visit({ as: DEV, url: `/developer/topics/${topicId}/numbers/${number}` });
  });
});

describe('developer screens: entities that do not exist', () => {
  it.each(['/developer/topics/top_nothing', '/developer/topics/top_nothing/edit', '/developer/topics/top_linear/numbers/999'])('%s is the 404 shell', async (url) => {
    await visit({ as: DEV, url, expectNotFound: true });
  });

  it("a student's route does not exist for a developer: the app opens the developer's home", async () => {
    await visit({ as: DEV, url: '/student/homeworks', expectPath: '/developer/topics' });
  });
});
