// In-app PDF page (web): the browser's built-in viewer in an iframe, as on the site's desktop modal. On
// a touch device, or in a browser without a PDF viewer, an iframe cannot page through the document — the
// site opens the file in a new tab there (`FileFullscreenPreview`), and so does this page.
import { useI18n } from '@/i18n';
import { format } from '@/lib/i18n/format';

import { FileHandOff } from './file-hand-off';
import type { PdfViewProps } from './pdf-view.types';

function canEmbedPdf(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (navigator.pdfViewerEnabled === false) return false;
  return !window.matchMedia?.('(pointer: coarse)').matches;
}

export function PdfView({ uri, name, onOpenExternally, opening }: PdfViewProps) {
  const { dict, m } = useI18n();

  if (!canEmbedPdf()) {
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
    <iframe
      src={uri}
      title={format(dict.student.fullscreen.iframeTitle, { name })}
      style={{ flex: 1, width: '100%', height: '100%', border: 0 }}
    />
  );
}
