/**
 * Static checks of a rendered host tree against what React Native accepts on a phone. A jest render never
 * reaches the native view managers, so the mistakes that only a device reports (a red screen, a silent
 * fallback) are looked for here: raw text outside `<Text>`, style keys and values native does not know,
 * fonts that are not loaded, icon glyphs that do not exist, unknown accessibility roles and enum props.
 */
import { describe as describeNode, flattenStyle, pathOf, textOf, walk, type HostNode } from './tree';

export type Violation = { rule: string; message: string; node: string; path: string };

/* eslint-disable @typescript-eslint/no-require-imports */
type AttributeConfig = true | { process?: (value: unknown) => unknown; diff?: unknown };
const styleAttributes = (): Record<string, AttributeConfig> =>
  require('react-native/Libraries/Components/View/ReactNativeStyleAttributes').default as Record<string, AttributeConfig>;
const normalizeColor = (): ((color: unknown) => number | null | undefined) =>
  require('react-native/Libraries/StyleSheet/normalizeColor').default as (color: unknown) => number | null | undefined;
const loadedFonts = (): string[] => Object.keys((require('@/theme/fonts') as { appFonts: Record<string, unknown> }).appFonts);
const platformOs = (): string => (require('react-native') as { Platform: { OS: string } }).Platform.OS;
/* eslint-enable @typescript-eslint/no-require-imports */

/** `AccessibilityRole` of React Native 0.88 (`Libraries/Components/View/ViewAccessibility.js`). */
const ACCESSIBILITY_ROLES = new Set([
  'none', 'button', 'dropdownlist', 'togglebutton', 'link', 'search', 'image', 'keyboardkey', 'text', 'adjustable',
  'imagebutton', 'header', 'summary', 'alert', 'checkbox', 'combobox', 'menu', 'menubar', 'menuitem', 'progressbar',
  'radio', 'radiogroup', 'scrollbar', 'spinbutton', 'switch', 'tab', 'tabbar', 'tablist', 'timer', 'list', 'toolbar',
  'grid', 'pager', 'scrollview', 'horizontalscrollview', 'viewgroup', 'webview', 'drawerlayout', 'slidingdrawer', 'iconmenu',
]);

/** `Role` (the ARIA-style `role` prop) of React Native 0.88. */
const ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell', 'checkbox', 'columnheader', 'combobox',
  'complementary', 'contentinfo', 'definition', 'dialog', 'directory', 'document', 'feed', 'figure', 'form', 'grid',
  'group', 'heading', 'img', 'link', 'list', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem',
  'meter', 'navigation', 'none', 'note', 'option', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row',
  'rowgroup', 'rowheader', 'scrollbar', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'summary', 'switch',
  'tab', 'table', 'tablist', 'tabpanel', 'term', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

const ENUM_PROPS: Record<string, readonly unknown[]> = {
  pointerEvents: ['auto', 'none', 'box-none', 'box-only'],
  importantForAccessibility: ['auto', 'yes', 'no', 'no-hide-descendants'],
  accessibilityLiveRegion: ['none', 'polite', 'assertive'],
  'aria-live': ['polite', 'assertive', 'off'],
  ellipsizeMode: ['head', 'middle', 'tail', 'clip'],
  keyboardType: [
    'default', 'email-address', 'numeric', 'phone-pad', 'number-pad', 'decimal-pad', 'url', 'ascii-capable',
    'numbers-and-punctuation', 'name-phone-pad', 'twitter', 'web-search', 'visible-password', 'ascii-capable-number-pad',
  ],
  inputMode: ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'],
  autoCapitalize: ['none', 'sentences', 'words', 'characters'],
  returnKeyType: ['done', 'go', 'next', 'search', 'send', 'none', 'previous', 'default', 'emergency-call', 'google', 'join', 'route', 'yahoo'],
  enterKeyHint: ['enter', 'done', 'go', 'next', 'previous', 'search', 'send'],
  textContentType: [
    'none', 'URL', 'addressCity', 'addressCityAndState', 'addressState', 'countryName', 'creditCardNumber',
    'creditCardExpiration', 'creditCardExpirationMonth', 'creditCardExpirationYear', 'creditCardSecurityCode',
    'creditCardType', 'creditCardName', 'creditCardGivenName', 'creditCardMiddleName', 'creditCardFamilyName',
    'emailAddress', 'familyName', 'fullStreetAddress', 'givenName', 'jobTitle', 'location', 'middleName', 'name',
    'namePrefix', 'nameSuffix', 'nickname', 'organizationName', 'postalCode', 'streetAddressLine1',
    'streetAddressLine2', 'sublocality', 'telephoneNumber', 'username', 'password', 'newPassword', 'oneTimeCode',
    'birthdate', 'birthdateDay', 'birthdateMonth', 'birthdateYear', 'cellularEID', 'cellularIMEI', 'dateTime',
    'flightNumber', 'shipmentTrackingNumber',
  ],
  autoComplete: [
    'additional-name', 'address-line1', 'address-line2', 'birthdate-day', 'birthdate-full', 'birthdate-month',
    'birthdate-year', 'cc-csc', 'cc-exp', 'cc-exp-day', 'cc-exp-month', 'cc-exp-year', 'cc-number', 'cc-name',
    'cc-given-name', 'cc-middle-name', 'cc-family-name', 'cc-type', 'country', 'current-password', 'email',
    'family-name', 'gender', 'given-name', 'honorific-prefix', 'honorific-suffix', 'name', 'name-family', 'name-given',
    'name-middle', 'name-middle-initial', 'name-prefix', 'name-suffix', 'new-password', 'nickname', 'one-time-code',
    'organization', 'organization-title', 'password', 'password-new', 'postal-address', 'postal-address-country',
    'postal-address-extended', 'postal-address-extended-postal-code', 'postal-address-locality', 'postal-address-region',
    'postal-code', 'street-address', 'sms-otp', 'tel', 'tel-country-code', 'tel-national', 'tel-device', 'url',
    'username', 'username-new', 'off',
  ],
  resizeMode: ['cover', 'contain', 'stretch', 'repeat', 'center', 'none'],
  animationType: ['none', 'slide', 'fade'],
  presentationStyle: ['fullScreen', 'pageSheet', 'formSheet', 'overFullScreen'],
  keyboardShouldPersistTaps: ['always', 'never', 'handled', true, false],
  keyboardDismissMode: ['none', 'on-drag', 'interactive'],
  textBreakStrategy: ['simple', 'highQuality', 'balanced'],
  lineBreakStrategyIOS: ['none', 'standard', 'hangul-word', 'push-out'],
};

const ENUM_STYLES: Record<string, readonly unknown[]> = {
  position: ['absolute', 'relative', 'static'],
  display: ['none', 'flex', 'contents'],
  overflow: ['visible', 'hidden', 'scroll'],
  flexDirection: ['row', 'column', 'row-reverse', 'column-reverse'],
  flexWrap: ['wrap', 'nowrap', 'wrap-reverse'],
  alignItems: ['flex-start', 'flex-end', 'center', 'stretch', 'baseline'],
  alignSelf: ['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline'],
  alignContent: ['flex-start', 'flex-end', 'center', 'stretch', 'space-between', 'space-around', 'space-evenly'],
  justifyContent: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
  borderStyle: ['solid', 'dotted', 'dashed'],
  borderCurve: ['circular', 'continuous'],
  backfaceVisibility: ['visible', 'hidden'],
  boxSizing: ['border-box', 'content-box'],
  direction: ['inherit', 'ltr', 'rtl'],
  pointerEvents: ['auto', 'none', 'box-none', 'box-only'],
  cursor: ['auto', 'pointer'],
  userSelect: ['auto', 'text', 'none', 'contain', 'all'],
  fontStyle: ['normal', 'italic'],
  fontWeight: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900', 100, 200, 300, 400, 500, 600, 700, 800, 900, 'ultralight', 'thin', 'light', 'medium', 'regular', 'semibold', 'condensedBold', 'condensed', 'heavy', 'black'],
  textAlign: ['auto', 'left', 'right', 'center', 'justify'],
  textAlignVertical: ['auto', 'top', 'bottom', 'center'],
  verticalAlign: ['auto', 'top', 'bottom', 'middle'],
  textDecorationLine: ['none', 'underline', 'line-through', 'underline line-through'],
  textDecorationStyle: ['solid', 'double', 'dotted', 'dashed'],
  textTransform: ['none', 'uppercase', 'lowercase', 'capitalize'],
  writingDirection: ['auto', 'ltr', 'rtl'],
  resizeMode: ['cover', 'contain', 'stretch', 'repeat', 'center', 'none'],
  objectFit: ['cover', 'contain', 'fill', 'scale-down', 'none'],
  outlineStyle: ['solid', 'dotted', 'dashed'],
  isolation: ['auto', 'isolate'],
};

/** Style keys whose value is a length: a finite number, a percentage, or (where yoga allows) `auto`. */
const LENGTH_KEYS = /^(width|height|minWidth|minHeight|maxWidth|maxHeight|top|right|bottom|left|start|end|inset.*|margin.*|padding.*|gap|rowGap|columnGap|flexBasis|border.*Width|border.*Radius|borderRadius|borderWidth|fontSize|lineHeight|letterSpacing|shadowRadius|textShadowRadius|outlineWidth|outlineOffset)$/;
const NON_NEGATIVE_KEYS = /^(width|height|minWidth|minHeight|maxWidth|maxHeight|padding.*|gap|rowGap|columnGap|border.*Width|borderWidth|border.*Radius|borderRadius|fontSize|lineHeight|shadowRadius|outlineWidth)$/;
const NUMBER_ONLY_KEYS = new Set(['flex', 'flexGrow', 'flexShrink', 'opacity', 'zIndex', 'elevation', 'shadowOpacity', 'fontSize', 'lineHeight', 'letterSpacing', 'shadowRadius', 'textShadowRadius']);
const AUTO_ALLOWED = /^(width|height|flexBasis|margin.*|top|right|bottom|left|start|end|inset.*|minWidth|minHeight|maxWidth|maxHeight)$/;

/** System font families that exist without loading anything. */
const SYSTEM_FONTS: Record<string, readonly string[]> = {
  ios: ['System', 'Menlo', 'Courier', 'Courier New', 'Helvetica', 'Helvetica Neue', 'Georgia', 'Times New Roman'],
  android: ['System', 'normal', 'sans-serif', 'sans-serif-medium', 'sans-serif-light', 'sans-serif-thin', 'sans-serif-condensed', 'serif', 'monospace', 'Roboto', 'notoserif'],
};

/** Hosts on which a text style can only be a mistake (text styles are not inherited on native). */
const PLAIN_VIEW_HOSTS = new Set(['View', 'RCTScrollView', 'RCTSafeAreaView']);
const TEXT_HOSTS = new Set(['Text', 'RCTText', 'RCTVirtualText', 'TextInput', 'RCTSinglelineTextInputView', 'RCTMultilineTextInputView']);

function checkStyle(style: Record<string, unknown>, plainView: boolean, report: (rule: string, message: string) => void): void {
  const attributes = styleAttributes();
  const colors = normalizeColor();
  const fonts = loadedFonts();
  const os = platformOs();

  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null) continue;
    const attribute = attributes[key];
    if (attribute === undefined) {
      report('style-unknown-key', `style.${key} = ${JSON.stringify(value)} is not a React Native style attribute (web-only or misspelt)`);
      continue;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      report('style-not-finite', `style.${key} is ${String(value)}`);
      continue;
    }
    if (typeof value === 'string' && /^-?[\d.]+(px|rem|em|vh|vw|vmin|vmax|pt|dp)$/.test(value)) {
      report('style-css-unit', `style.${key} = "${value}" uses a CSS unit; native takes numbers or percentages`);
      continue;
    }
    if (ENUM_STYLES[key] && !ENUM_STYLES[key].includes(value)) {
      report('style-enum', `style.${key} = ${JSON.stringify(value)} is not accepted on native (allowed: ${ENUM_STYLES[key].join(' | ')})`);
      continue;
    }
    if (/[cC]olor$/.test(key) && typeof value !== 'object') {
      if (colors(value) === null || colors(value) === undefined) report('style-color', `style.${key} = ${JSON.stringify(value)} is not a colour React Native can parse`);
      continue;
    }
    if (LENGTH_KEYS.test(key)) {
      if (typeof value === 'string') {
        const percent = /^-?\d+(\.\d+)?%$/.test(value);
        const auto = value === 'auto' && AUTO_ALLOWED.test(key);
        if (NUMBER_ONLY_KEYS.has(key) || (!percent && !auto)) report('style-length', `style.${key} = "${value}" is not a number${NUMBER_ONLY_KEYS.has(key) ? '' : ', a percentage or auto'}`);
      } else if (typeof value === 'number' && value < 0 && NON_NEGATIVE_KEYS.test(key)) {
        report('style-negative', `style.${key} = ${value} is negative`);
      } else if (typeof value !== 'number') {
        report('style-length', `style.${key} = ${JSON.stringify(value)} is not a number`);
      }
    } else if (NUMBER_ONLY_KEYS.has(key) && typeof value !== 'number') {
      report('style-number', `style.${key} = ${JSON.stringify(value)} must be a number`);
    }
    if (key === 'opacity' && typeof value === 'number' && (value < 0 || value > 1)) report('style-opacity', `style.opacity = ${value} is outside 0..1`);
    if (key === 'lineHeight' && typeof value === 'number' && value < 4) {
      report('style-line-height', `style.lineHeight = ${value}: native line height is in points, not a multiplier`);
    }
    if (key === 'fontFamily' && typeof value === 'string') {
      if (!fonts.includes(value) && !(SYSTEM_FONTS[os] ?? []).includes(value)) {
        report('style-font-family', `style.fontFamily = "${value}" is neither loaded by the app (${fonts.join(', ')}) nor a system font of ${os}`);
      }
    }
    if (key === 'aspectRatio' && typeof value !== 'number' && !(typeof value === 'string' && /^\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?$/.test(value))) {
      report('style-aspect-ratio', `style.aspectRatio = ${JSON.stringify(value)}`);
    }
    if (typeof attribute === 'object' && typeof attribute.process === 'function' && !/[cC]olor$/.test(key)) {
      try {
        attribute.process(value);
      } catch (error) {
        report('style-process', `style.${key} = ${JSON.stringify(value)} is rejected by React Native: ${(error as Error).message}`);
      }
    }
  }
  if (plainView) {
    for (const key of ['color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'letterSpacing', 'textTransform', 'textDecorationLine']) {
      if (style[key] !== undefined && style[key] !== null) {
        report('style-text-on-view', `style.${key} on a non-text view has no effect on native (text styles do not inherit from View)`);
      }
    }
  }
}

/** Everything the walker can tell is wrong for native in the tree under `root`. */
export function findViolations(root: HostNode): Violation[] {
  const violations: Violation[] = [];

  walk(root, (node, ancestors) => {
    const report = (rule: string, message: string) => violations.push({ rule, message, node: describeNode(node), path: pathOf(node) });
    const isText = TEXT_HOSTS.has(node.type);

    // 1. Raw text outside <Text>: a red screen on a phone ("Text strings must be rendered within a <Text>").
    for (const child of node.children) {
      if (typeof child === 'string' && !isText) report('raw-text', `the string ${JSON.stringify(child)} is a direct child of <${node.type}>`);
    }

    // 2. Nesting React Native refuses or lays out wrongly.
    if (node.type === 'Image' && node.children.length > 0) report('image-children', '<Image> cannot contain children');
    // Only the inline view itself (the direct child of a <Text>) is constrained, not what it contains.
    if (node.parent?.type === 'Text' && !isText) {
      const style = flattenStyle(node.props.style);
      if (typeof style.width !== 'number' || typeof style.height !== 'number') {
        report('view-in-text', `<${node.type}> is nested inside <Text> without a fixed width and height (an inline view needs both on native)`);
      }
    }
    if (isText && ancestors.some((ancestor) => ancestor.type === 'TextInput')) report('text-in-input', '<Text> nested inside <TextInput>');

    // 3. Styles.
    for (const prop of ['style', 'contentContainerStyle', 'imageStyle', 'columnWrapperStyle']) {
      if (node.props[prop] === undefined) continue;
      const style = flattenStyle(node.props[prop]);
      checkStyle(style, prop === 'style' && PLAIN_VIEW_HOSTS.has(node.type), (rule, message) =>
        report(rule, prop === 'style' ? message : message.replace('style.', `${prop}.`)),
      );
    }

    // 3a. Typography rules of the app (CLAUDE.md "Styling"): one loaded family per weight. A `fontWeight` next
    // to a custom family makes Android pick a synthetic bold on top of the face (or drop the family).
    if (node.type === 'Text') {
      const style = flattenStyle(node.props.style);
      const family = typeof style.fontFamily === 'string' ? style.fontFamily : null;
      if (family && /^Onest_/.test(family) && style.fontWeight !== undefined && style.fontWeight !== 'normal' && style.fontWeight !== '400' && style.fontWeight !== 400) {
        report('font-weight-with-family', `fontWeight ${JSON.stringify(style.fontWeight)} is combined with the custom family ${family}`);
      }
      const inheritsFamily = ancestors.some((ancestor) => ancestor.type === 'Text' && typeof flattenStyle(ancestor.props.style).fontFamily === 'string');
      if (!family && !inheritsFamily && node.children.some((child) => typeof child === 'string' && child.trim() !== '')) {
        report('text-without-font', 'the text has no fontFamily: it is drawn in the system font, not in Onest');
      }
      if (typeof style.lineHeight === 'number' && typeof style.fontSize === 'number' && style.lineHeight < style.fontSize) {
        report('line-height-below-font-size', `lineHeight ${style.lineHeight} is smaller than fontSize ${style.fontSize}: glyphs are clipped on native`);
      }
    }

    // 3b. Controls (CLAUDE.md "Accessibility"): a role, a name, and a touch target of at least 44 pt.
    const pressable = typeof node.props.onClick === 'function' || typeof node.props.onPress === 'function';
    const state = node.props.accessibilityState as { disabled?: boolean } | undefined;
    if (pressable && node.props.accessible !== false && node.props.importantForAccessibility !== 'no' && node.props.importantForAccessibility !== 'no-hide-descendants') {
      if (node.props.accessibilityRole === undefined && node.props.role === undefined) report('control-without-role', 'a pressable element has no accessibilityRole');
      const named = typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.trim() !== '';
      const text = textOf(node).replace(/[\uE000-\uF8FF\u2060\s]/g, '');
      if (!named && text === '') report('control-without-name', 'a pressable element has neither an accessibilityLabel nor a text');
      if (state?.disabled !== true) {
        const style = flattenStyle(node.props.style);
        const slop = node.props.hitSlop;
        const extra = (a: string, b: string): number =>
          typeof slop === 'number' ? slop * 2 : slop && typeof slop === 'object' ? (Number((slop as Record<string, unknown>)[a]) || 0) + (Number((slop as Record<string, unknown>)[b]) || 0) : 0;
        const width = typeof style.width === 'number' ? style.width : typeof style.minWidth === 'number' ? null : null;
        const height = typeof style.height === 'number' ? style.height : null;
        if (width !== null && height !== null && (width + extra('left', 'right') < 44 || height + extra('top', 'bottom') < 44)) {
          report('touch-target', `the touch target is ${width + extra('left', 'right')}×${height + extra('top', 'bottom')} pt (size ${width}×${height} plus hitSlop); the minimum is 44×44`);
        }
      }
    }

    // 4. Icons are drawn with react-native-svg from generated Lucide data (`src/ui/icon.tsx`): an unknown
    // name is a type error, so there is no glyph to check at run time.

    // 5. Accessibility and enum props.
    const { accessibilityRole, role } = node.props;
    if (accessibilityRole !== undefined && !ACCESSIBILITY_ROLES.has(accessibilityRole as string)) {
      report('accessibility-role', `accessibilityRole="${String(accessibilityRole)}" is not a React Native role`);
    }
    if (role !== undefined && !ROLES.has(role as string)) report('role', `role="${String(role)}" is not a React Native role`);
    for (const [prop, allowed] of Object.entries(ENUM_PROPS)) {
      const value = node.props[prop];
      if (value !== undefined && value !== null && !allowed.includes(value)) {
        report('prop-enum', `${prop}=${JSON.stringify(value)} is not accepted on native`);
      }
    }
    const { numberOfLines, accessibilityState, accessibilityValue, hitSlop } = node.props as Record<string, unknown>;
    if (numberOfLines !== undefined && numberOfLines !== null && (typeof numberOfLines !== 'number' || numberOfLines < 0 || !Number.isInteger(numberOfLines))) {
      report('number-of-lines', `numberOfLines=${JSON.stringify(numberOfLines)} must be a non-negative integer`);
    }
    if (accessibilityState !== undefined && accessibilityState !== null) {
      for (const [key, value] of Object.entries(accessibilityState as Record<string, unknown>)) {
        const valid = key === 'checked' ? typeof value === 'boolean' || value === 'mixed' : ['disabled', 'selected', 'busy', 'expanded'].includes(key) && typeof value === 'boolean';
        if (value !== undefined && !valid) report('accessibility-state', `accessibilityState.${key}=${JSON.stringify(value)}`);
      }
    }
    if (accessibilityValue !== undefined && accessibilityValue !== null) {
      const value = accessibilityValue as Record<string, unknown>;
      for (const key of ['min', 'max', 'now']) {
        if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) {
          report('accessibility-value', `accessibilityValue.${key}=${JSON.stringify(value[key])} must be a finite number`);
        }
      }
      if (value.text !== undefined && typeof value.text !== 'string') report('accessibility-value', `accessibilityValue.text=${JSON.stringify(value.text)} must be a string`);
    }
    if (typeof node.props.accessibilityLabel !== 'string' && node.props.accessibilityLabel !== undefined && node.props.accessibilityLabel !== null) {
      report('accessibility-label', `accessibilityLabel=${JSON.stringify(node.props.accessibilityLabel)} must be a string`);
    }
    if (hitSlop !== undefined && hitSlop !== null && typeof hitSlop !== 'number') {
      for (const [key, value] of Object.entries(hitSlop as Record<string, unknown>)) {
        if (!['top', 'left', 'bottom', 'right'].includes(key) || typeof value !== 'number') report('hit-slop', `hitSlop.${key}=${JSON.stringify(value)}`);
      }
    }
    if (node.type === 'Image') {
      const source = node.props.source as unknown;
      const ok =
        typeof source === 'number' ||
        (Array.isArray(source) && source.length > 0) ||
        (typeof source === 'object' && source !== null && (typeof (source as { uri?: unknown }).uri === 'string' || typeof (source as { testUri?: unknown }).testUri === 'string'));
      if (!ok) report('image-source', `<Image> source=${JSON.stringify(source)}`);
    }
  });

  return violations;
}

/** Groups violations for an assertion message: one line per distinct problem with the places it occurs. */
export function formatViolations(violations: Violation[]): string {
  const groups = new Map<string, { count: number; places: Set<string> }>();
  for (const violation of violations) {
    const key = `[${violation.rule}] ${violation.message}`;
    const group = groups.get(key) ?? { count: 0, places: new Set<string>() };
    group.count += 1;
    if (group.places.size < 3) group.places.add(`${violation.node}${violation.path ? ` @ ${violation.path}` : ''}`);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => `${key}  ×${group.count}\n      ${[...group.places].join('\n      ')}`).join('\n');
}
