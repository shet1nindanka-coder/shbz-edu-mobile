// Native renderer: ONE auto-height WebView per block (docs/spec/09-data-i18n-math.md §4.3 steps 4–6, 10).
// The page is the static shell of `math-shell.ts`; content, colours and font size are pushed with
// `injectJavaScript`, the page answers with its height. Metro picks `math-view.web.tsx` on web.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';

import { makeStyles, useTheme } from '@/theme';
import { Skeleton } from '@/ui';

import { getCachedMathHeight, mathHeightKey, setCachedMathHeight } from './math-height-cache';
import {
  buildRenderCall,
  getMathShellHtml,
  MATH_SHELL_BASE_URL,
  MATH_SHELL_FONT_FAMILY,
  parseShellMessage,
} from './math-shell';
import { buildMathCssVars } from './math-styles';
import type { MathViewProps } from './math-view.types';

// The package types its props as `WebViewProps & P` with `P = undefined`, which collapses to `never`
// under strict TypeScript; instantiating the generic with an empty object restores the real props.
const WebView = RNWebView<object>;
type WebViewHandle = RNWebView<object>;

const ORIGIN_WHITELIST = ['*'];

type Measured = { key: string; height: number };

export function MathView({
  html,
  value,
  estimatedHeight,
  maxHeight,
  fontScale,
  accessibilityLabel,
  testID,
}: MathViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const webView = useRef<WebViewHandle>(null);
  const renderId = useRef(0);
  const [width, setWidth] = useState<number | null>(null);
  const [shellReady, setShellReady] = useState(false);
  const [measured, setMeasured] = useState<Measured | null>(null);
  // Bumped when the OS kills the web content process: the WebView is remounted and re-rendered.
  const [generation, setGeneration] = useState(0);

  const source = useMemo(() => ({ html: getMathShellHtml(), baseUrl: MATH_SHELL_BASE_URL }), []);
  const { label, redSoft, redText } = theme.colors;
  const varsJson = useMemo(
    () =>
      JSON.stringify(
        buildMathCssVars({
          text: label,
          dangerSoft: redSoft,
          dangerText: redText,
          fontFamily: MATH_SHELL_FONT_FAMILY,
          fontScale,
        }),
      ),
    [label, redSoft, redText, fontScale],
  );

  // Dark theme and font scale travel as CSS variables in the same call as the content, never by
  // rebuilding the shell; a recycled row therefore keeps its parsed CSS and fonts.
  useEffect(() => {
    if (!shellReady) return;
    renderId.current += 1;
    const vars = JSON.parse(varsJson) as Record<string, string>;
    webView.current?.injectJavaScript(buildRenderCall(renderId.current, html, vars, maxHeight));
  }, [shellReady, html, varsJson, maxHeight, generation]);

  const cacheKey =
    width === null ? null : mathHeightKey({ value, width, fontScale, theme: theme.name, maxHeight });
  const reported = measured !== null && measured.key === cacheKey;
  const cachedHeight = cacheKey === null ? undefined : getCachedMathHeight(cacheKey);
  // Order: the fresh measurement, then what this content measured last time at this width, then the
  // previous measurement (a width change mid-flight), then the estimate.
  const height = reported ? measured.height : (cachedHeight ?? measured?.height ?? estimatedHeight);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseShellMessage(event.nativeEvent.data);
    if (!message) return;
    if ('ready' in message) {
      setShellReady(true);
      return;
    }
    // A late answer for content that has since been replaced must not resize the new one.
    if (message.id !== renderId.current || cacheKey === null) return;
    setCachedMathHeight(cacheKey, message.h);
    setMeasured((current) =>
      current !== null && current.key === cacheKey && Math.abs(current.height - message.h) < 1
        ? current
        : { key: cacheKey, height: message.h },
    );
  };

  const restart = () => {
    setShellReady(false);
    setGeneration((current) => current + 1);
  };

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      testID={testID}
      style={[styles.root, { height }]}
    >
      <WebView
        key={generation}
        ref={webView}
        source={source}
        originWhitelist={ORIGIN_WHITELIST}
        // Nothing but the shell itself may ever load: no links, no redirects, no new windows.
        onShouldStartLoadWithRequest={(request) => request.url === MATH_SHELL_BASE_URL}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled={false}
        onMessage={onMessage}
        onLoadEnd={() => setShellReady(true)}
        onContentProcessDidTerminate={restart}
        onRenderProcessGone={restart}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        // The OS font scale is applied through `--mc-font-size`, so the cached heights stay valid.
        textZoom={100}
        // Problem numbers and answers must not turn into phone-number links.
        dataDetectorTypes="none"
        allowsLinkPreview={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.webView}
        containerStyle={styles.webView}
      />
      {reported ? null : (
        <View style={styles.skeleton}>
          <Skeleton height={height} radius="sm" />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { alignSelf: 'stretch', overflow: 'hidden' },
  webView: { flex: 1, backgroundColor: 'transparent' },
  skeleton: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
}));
