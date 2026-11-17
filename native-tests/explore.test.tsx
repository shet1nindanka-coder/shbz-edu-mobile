// Developer tool, not part of the suite:
//   EXPLORE_AS=login EXPLORE_URL=/path [EXPLORE_STEPS='#testID;label:Text;type:#id=text;advance:5000'] npx jest native-tests/explore
import { it } from '@jest/globals';

import { controls, keyOf, press, root, typeInto } from './support/drive';
import { device } from './support/fakes';
import { launch, type PersonaLogin } from './support/launch';
import { checkTree } from './support/problems';
import { all, isHidden, outline, pressables, type HostNode } from './support/tree';

const url = process.env.EXPLORE_URL;
const as = process.env.EXPLORE_AS as PersonaLogin | undefined;

(url ? it : it.skip)('explore', async () => {
  const app = await launch({ as, url });
  const find = (selector: string): HostNode | undefined =>
    selector.startsWith('#')
      ? all(root(app), (node) => node.props.testID === selector.slice(1) && !isHidden(node))[0]
      : pressables(root(app)).find((node) => keyOf(node).includes(selector));
  let known = new Set(pressables(root(app)).map(keyOf));
  const inputs = () => all(root(app), (node) => node.type === 'TextInput' && !isHidden(node)).map((node) => `input${keyOf(node)}`);
  const report = (title: string) => {
    const now = pressables(root(app)).map(keyOf);
    process.stdout.write(`\n=== ${title} → ${app.path()}\n  new: ${now.filter((key) => !known.has(key)).join(' | ')}\n  inputs: ${inputs().join(' | ')}\n`);
    known = new Set(now);
  };
  process.stdout.write(`PATH ${app.path()}\n  controls: ${controls(app, { perKind: 3, limit: 80 }).map((c) => c.key).join(' | ')}\n  inputs: ${inputs().join(' | ')}\n`);
  for (const stepText of (process.env.EXPLORE_STEPS ?? '').split(';').filter(Boolean)) {
    if (stepText.startsWith('advance:')) await app.advance(Number(stepText.slice(8)));
    else if (stepText.startsWith('photo')) device().picker.nextAssets = [{ uri: 'file:///cache/solution.jpg', name: 'solution.jpg', mimeType: 'image/jpeg', size: 240_000 }];
    else if (stepText.startsWith('type:')) {
      const [selector, text] = stepText.slice(5).split('=');
      const node = find(selector);
      if (node) await typeInto(app, node, text, stepText);
      else process.stdout.write(`  !! not found ${selector}\n`);
    } else {
      const node = find(stepText.replace(/^label:/, ''));
      if (node) await press(app, node, stepText);
      else process.stdout.write(`  !! not found ${stepText}\n`);
    }
    await app.settle();
    report(stepText);
  }
  if (process.env.EXPLORE_OUTLINE) process.stdout.write(outline(root(app)) + '\n');
  checkTree(root(app), 'explore');
});
