// Student area, third round of fixes, on the native tree.
//
// #234: the homework list card was one pressable element whose name held only «title. meta». VoiceOver hides
// the descendants of such an element, so the overdue / done badge, every number's traffic light, the
// running check and the progress were never spoken, and the nested «Открыть ДЗ» button could not be reached.
import { describe, expect, it } from '@jest/globals';

import { byTestId, visit } from './support/drive';
import type { HostNode } from './support/tree';

const ILYA = 'ilya@example.com';

function label(node: HostNode | null): string {
  expect(node).not.toBeNull();
  return String((node as HostNode).props.accessibilityLabel ?? '');
}

function isInside(node: HostNode, ancestor: HostNode): boolean {
  for (let current: HostNode | null = node.parent; current; current = current.parent) if (current === ancestor) return true;
  return false;
}

describe('homework list card speaks what it shows (#234)', () => {
  it('the overdue card names the badge, every number status and the progress; the button is reachable', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks' });
    const card = byTestId(app, 'homework-card-hw_ilya_overdue');
    const name = label(card);
    expect(name).toContain('Просрочено');
    expect(name).toContain('Выполнено 0 из 3');
    expect(name).toContain('Нужна помощь преподавателя: № 118');
    expect(name).toContain('Не отмечены: № 120, № 124');
    expect(name).toContain('ДЗ ещё не начато');
    expect((card as HostNode).props.accessibilityRole).toBe('button');

    // «Открыть ДЗ» is a sibling of the press target, not hidden inside it.
    const button = byTestId(app, 'homework-open-hw_ilya_overdue');
    expect(button).not.toBeNull();
    expect(isInside(button as HostNode, card as HostNode)).toBe(false);
  });

  it('a completed card names the «done» badge and the full progress', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks' });
    // The completed homework sits in the folded archive: open it first.
    const toggle = byTestId(app, 'homeworks-archive-toggle');
    if (toggle && !byTestId(app, 'homework-card-hw_ilya_done')) {
      await app.rntl.fireEvent.press(toggle as never);
      await app.settle();
    }
    const name = label(byTestId(app, 'homework-card-hw_ilya_done'));
    // The badge, right after the title (the meta line says «Выполнено 2 из 2», a different piece).
    expect(name).toContain(', Выполнено, ');
    expect(name).toContain('Решен с первого раза: № 112, Исправлен после самопроверки: № 113');
    expect(name).toContain('ДЗ выполнено полностью');
    expect(name).not.toContain('Просрочено');
  });
});
