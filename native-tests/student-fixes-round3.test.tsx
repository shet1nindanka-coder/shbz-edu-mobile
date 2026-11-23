// Student area, third round of fixes, on the native tree.
//
// #234: the homework list card was one pressable element whose name held only «title. meta». VoiceOver hides
// the descendants of such an element, so what the card showed besides them was never spoken, and the nested
// «Открыть ДЗ» button could not be reached.
// The row of the redesigned list shows a title, one caption (the deadline — «просрочено 2 дня», «выполнено» —
// or the running check) and «N из M»; the numbers and their statuses live inside the homework. The rule is
// the same: the name of the row holds everything the row shows, and nothing pressable hides inside it.
import { describe, expect, it } from '@jest/globals';

import { byTestId, visit } from './support/drive';
import { all, pressables, textOf, type HostNode } from './support/tree';

const ILYA = 'ilya@example.com';

function label(node: HostNode | null): string {
  expect(node).not.toBeNull();
  return String((node as HostNode).props.accessibilityLabel ?? '');
}

function isInside(node: HostNode, ancestor: HostNode): boolean {
  for (let current: HostNode | null = node.parent; current; current = current.parent) if (current === ancestor) return true;
  return false;
}

/** Every piece of text the row draws. */
function shownTexts(row: HostNode): string[] {
  return all(row, (node) => node.type === 'Text' && node.children.every((child) => typeof child === 'string'))
    .map((node) => textOf(node).trim())
    .filter((text) => text.length > 0);
}

/** Pressable elements hidden inside the row (a screen reader cannot reach them). */
const nestedControls = (row: HostNode): HostNode[] => pressables(row).filter((node) => node !== row && isInside(node, row));

describe('homework list card speaks what it shows (#234)', () => {
  it('the overdue row names the overdue caption and the progress; nothing pressable hides inside it', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks' });
    const card = byTestId(app, 'homework-card-hw_ilya_overdue');
    const name = label(card);
    expect(name).toMatch(/просрочено \d+ (день|дня|дней)/);
    expect(name).toContain('Решено 0 из 3');
    const shown = shownTexts(card as HostNode);
    expect(shown.length).toBe(3); // the title, one caption, the progress
    for (const text of shown) expect(name).toContain(text);
    expect((card as HostNode).props.accessibilityRole).toBe('button');

    // The whole row opens the homework: there is no button inside it that a screen reader could not reach.
    expect(nestedControls(card as HostNode)).toEqual([]);
    expect(String((card as HostNode).props.accessibilityHint ?? '')).not.toBe('');
    await app.rntl.fireEvent.press(card as never);
    await app.settle();
    expect(app.path()).toBe('/student/homeworks/hw_ilya_overdue');
  });

  it('a completed row names «выполнено» and the full progress', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks' });
    // The completed homework is in the other segment of the list: open it first.
    const done = app.screen.getByRole('radio', { name: 'Выполненные' });
    await app.rntl.fireEvent.press(done);
    await app.settle();
    const card = byTestId(app, 'homework-card-hw_ilya_done');
    const name = label(card);
    expect(name).toContain('. выполнено. ');
    expect(name).toContain('Решено 2 из 2');
    for (const text of shownTexts(card as HostNode)) expect(name).toContain(text);
    expect(name).not.toMatch(/просрочено/i);
    expect(nestedControls(card as HostNode)).toEqual([]);
  });
});
