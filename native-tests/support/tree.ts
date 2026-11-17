/** Helpers over the rendered host tree (test-renderer `TestInstance`s). */

export type HostNode = {
  type: string;
  props: Record<string, unknown>;
  parent: HostNode | null;
  children: (HostNode | string)[];
};

export function walk(root: HostNode, visit: (node: HostNode, ancestors: HostNode[]) => void, ancestors: HostNode[] = []): void {
  visit(root, ancestors);
  const next = [...ancestors, root];
  for (const child of root.children) {
    if (typeof child !== 'string') walk(child, visit, next);
  }
}

export function textOf(node: HostNode | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textOf).join('');
}

export function all(root: HostNode, predicate: (node: HostNode) => boolean): HostNode[] {
  const found: HostNode[] = [];
  walk(root, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

/** True when the node or an ancestor is removed from the screen for the user (inactive tab, closed modal). */
export function isHidden(node: HostNode): boolean {
  for (let current: HostNode | null = node; current; current = current.parent) {
    const props = current.props;
    if (props.accessibilityElementsHidden === true && props.importantForAccessibility === 'no-hide-descendants' && current.type === 'RNSScreen') return true;
    if (props['aria-hidden'] === true && current.type === 'RNSScreen') return true;
    if (current.type === 'RNSScreen' && props.activityState === 0) return true;
    const style = flattenStyle(props.style);
    if (style.display === 'none') return true;
  }
  return false;
}

export function flattenStyle(style: unknown): Record<string, unknown> {
  if (style === null || style === undefined || style === false) return {};
  if (Array.isArray(style)) {
    const merged: Record<string, unknown> = {};
    for (const entry of style) Object.assign(merged, flattenStyle(entry));
    return merged;
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

/** Short description of a node for messages: `View#testID "label"`. */
export function describe(node: HostNode): string {
  const id = typeof node.props.testID === 'string' ? `#${node.props.testID}` : '';
  const label = typeof node.props.accessibilityLabel === 'string' ? ` [${node.props.accessibilityLabel}]` : '';
  const text = textOf(node).replace(/\s+/g, ' ').trim().slice(0, 50);
  return `${node.type}${id}${label}${text ? ` "${text}"` : ''}`;
}

/** Path of testIDs from the root to the node — tells which component rendered it. */
export function pathOf(node: HostNode): string {
  const ids: string[] = [];
  for (let current: HostNode | null = node; current; current = current.parent) {
    if (typeof current.props.testID === 'string') ids.unshift(current.props.testID);
  }
  return ids.slice(-4).join(' > ');
}

const PRESS_PROPS = ['onPress', 'onClick', 'onResponderRelease', 'onPressIn', 'onLongPress'];

/** Host elements the user can tap: a press handler and not disabled. */
export function pressables(root: HostNode): HostNode[] {
  return all(root, (node) => {
    if (!PRESS_PROPS.some((name) => typeof node.props[name] === 'function')) return false;
    if (node.props.accessible === false && node.props.onClick === undefined) return false;
    const state = node.props.accessibilityState as { disabled?: boolean } | undefined;
    if (state?.disabled === true || node.props['aria-disabled'] === true || node.props.disabled === true) return false;
    return !isHidden(node);
  });
}

/** Indented outline of the visible tree: host type, testID, role, label and text. For debugging tests. */
export function outline(root: HostNode, options: { hidden?: boolean } = {}): string {
  const lines: string[] = [];
  const visit = (node: HostNode | string, depth: number): void => {
    if (typeof node === 'string') {
      lines.push(`${'  '.repeat(depth)}"${node}"`);
      return;
    }
    if (!options.hidden && isHidden(node)) return;
    const { testID, accessibilityRole, accessibilityLabel, placeholder } = node.props as Record<string, string | undefined>;
    const interesting = testID || accessibilityRole || accessibilityLabel || placeholder || node.type !== 'View';
    const press = PRESS_PROPS.some((name) => typeof node.props[name] === 'function') ? ' (press)' : '';
    if (interesting || press) {
      lines.push(
        `${'  '.repeat(depth)}${node.type}${testID ? `#${testID}` : ''}${accessibilityRole ? ` role=${accessibilityRole}` : ''}${accessibilityLabel ? ` label="${accessibilityLabel}"` : ''}${placeholder ? ` placeholder="${placeholder}"` : ''}${press}`,
      );
      for (const child of node.children) visit(child, depth + 1);
    } else {
      for (const child of node.children) visit(child, depth);
    }
  };
  visit(root, 0);
  return lines.join('\n');
}
