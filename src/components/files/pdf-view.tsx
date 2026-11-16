// In-app PDF page (native). iOS: WKWebView renders a local PDF natively — paging, zoom and text
// selection for free. Android: the system WebView cannot display PDF and Expo Go has no native PDF
// module, so the page explains that and offers "open in another app" (docs/spec/09-data-i18n-math.md
// §5.2, the "Fallbacks" of the PDF row). Metro picks `pdf-view.web.tsx` on web.
import { Platform, View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';

import { FileHandOff } from './file-hand-off';
import type { PdfViewProps } from './pdf-view.types';

// See math-view.tsx: the package's default generic collapses the props to `never` under strict TS.
const WebView = RNWebView<object>;
const ORIGIN_WHITELIST = ['*'];

export function PdfView({ uri, name, onOpenExternally, opening }: PdfViewProps) {
  const styles = useStyles();
  const { m } = useI18n();

  if (Platform.OS !== 'ios') {
    return (
      <FileHandOff
        name={name}
        typeLabel="PDF"
        hint={m.common.files.pdfExternalOnly}
        onOpenExternally={onOpenExternally}
        opening={opening}
      />
    );
  }

  return (
    <View style={styles.root}>
      <WebView
        source={{ uri }}
        originWhitelist={ORIGIN_WHITELIST}
        // Local files only: a link inside the PDF must not navigate the viewer to the network. (The
        // system may report the same file under a normalised path, so the URL is not compared exactly.)
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('file://')}
        allowingReadAccessToURL={uri}
        javaScriptEnabled={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        dataDetectorTypes="none"
        accessibilityLabel={name}
        style={styles.webView}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.softBg },
  webView: { flex: 1, backgroundColor: 'transparent' },
}));
