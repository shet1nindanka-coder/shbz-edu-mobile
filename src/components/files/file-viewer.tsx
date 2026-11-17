// Full-screen file viewer — the `shared.fileViewer` screen (site: `FileFullscreenPreview`;
// docs/spec/02-student-study.md S2a, docs/spec/09-data-i18n-math.md §5.2). One file, or the photos of one
// set with a swipe pager. Images zoom and pan; a PDF is shown in-app where the platform can (iOS, web)
// and handed to another app elsewhere; DOCX is always handed off. Render it inside a route or inside
// `FileViewerModal`.
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { format } from '@/lib/i18n/format';
import { SHARE_IS_DOWNLOAD } from '@/services/files/file-actions';
import { useFileService } from '@/services/files/file-service-context';
import { makeStyles } from '@/theme';
import { Button, IconButton, Notice, ProgressBar, Spinner, Text } from '@/ui';

import { FileHandOff } from './file-hand-off';
import { PdfView } from './pdf-view';
import { useFileDownload } from './use-file-download';
import { useFileActions, type FileActions } from './use-file-share';
import { fileTypeLabel, viewerFileKind, type ViewerFile } from './viewer-file';
import { ZoomableImage } from './zoomable-image';

export type FileViewerProps = {
  /** One file, or the files of one set (the photos of a homework) in display order. */
  files: ViewerFile[];
  /** Which file to show first. Default 0. */
  initialIndex?: number;
  /** Header title instead of the file name (the student's theory viewer shows the topic title). */
  title?: string;
  onClose: () => void;
  testID?: string;
};

function clampIndex(index: number, count: number): number {
  return Math.min(Math.max(0, Math.floor(index) || 0), Math.max(0, count - 1));
}

export function FileViewer({ files, initialIndex = 0, title, onClose, testID }: FileViewerProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { dict, m } = useI18n();
  const actions = useFileActions();
  const pager = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, files.length));
  const [zoomed, setZoomed] = useState(false);
  // `contentOffset` is an initial position only. Native scroll views apply every CHANGE of the prop as an
  // immediate programmatic scroll (iOS sets `contentOffset`, Android calls `scrollTo`), so feeding the live
  // index back into it would yank the pager to the next page half-way through a swipe — and on Android
  // make one swipe skip a photo. Later moves go through `scrollTo` (rotation effect, `goTo`).
  const [initialOffset] = useState(() => ({ x: clampIndex(initialIndex, files.length) * window.width, y: 0 }));

  // Pages are sized from the measured body: a horizontal ScrollView does not stretch its children to its
  // own height, and on a wide web window the viewer is narrower than the window.
  const [body, setBody] = useState<{ width: number; height: number } | null>(null);
  const pageWidth = body?.width ?? window.width;
  const safeIndex = clampIndex(index, files.length);
  const current = files[safeIndex];
  const many = files.length > 1;

  // Web has no `contentOffset`, and a rotation changes the page width: put the pager back on its page.
  useEffect(() => {
    pager.current?.scrollTo({ x: safeIndex * pageWidth, animated: false });
    // Only the page width re-aligns the pager; the index is moved by the user or by `goTo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const next = clampIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth), files.length);
    if (next !== safeIndex) {
      setIndex(next);
      setZoomed(false);
    }
  };

  const onBodyLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!body || Math.abs(body.width - width) >= 1 || Math.abs(body.height - height) >= 1) setBody({ width, height });
  };

  const goTo = (next: number) => {
    const target = clampIndex(next, files.length);
    pager.current?.scrollTo({ x: target * pageWidth, animated: true });
    setIndex(target);
    setZoomed(false);
  };

  if (!current) return null;

  const sharing = actions.pending?.action === 'share';

  return (
    <View
      testID={testID}
      accessibilityViewIsModal
      accessibilityLabel={format(dict.student.fullscreen.dialogAria, { name: title ?? current.originalName })}
      style={styles.root}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text variant="smallBold" numberOfLines={1} accessibilityRole="header">
              {title ?? current.originalName}
            </Text>
            {many ? (
              <Text variant="caption" tabular>
                {format(m.common.files.fileOf, { current: safeIndex + 1, total: files.length })}
              </Text>
            ) : null}
          </View>
          {sharing ? (
            <View style={styles.headerSpinner}>
              <Spinner size={18} accessibilityLabel={m.common.files.preparing} />
            </View>
          ) : (
            <IconButton
              icon={SHARE_IS_DOWNLOAD ? 'download' : 'share'}
              accessibilityLabel={SHARE_IS_DOWNLOAD ? dict.student.fullscreen.download : m.common.files.share}
              disabled={actions.pending !== null}
              onPress={() => void actions.share(current)}
              testID={testID ? `${testID}-share` : undefined}
            />
          )}
          <IconButton
            icon="close"
            accessibilityLabel={dict.student.fullscreen.closeAria}
            onPress={onClose}
            testID={testID ? `${testID}-close` : undefined}
          />
        </View>
      </View>

      <View style={styles.body} onLayout={onBodyLayout}>
        {many ? (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            // A zoomed picture owns the horizontal drag.
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            contentOffset={initialOffset}
            onScroll={onScroll}
            scrollEventThrottle={16}
            bounces={false}
            overScrollMode="never"
            keyboardShouldPersistTaps="handled"
          >
            {files.map((file, fileIndex) => (
              <View key={file.id} style={{ width: pageWidth, height: body?.height ?? 0 }}>
                {/* Only the page on screen and its neighbours load anything. */}
                {Math.abs(fileIndex - safeIndex) <= 1 ? (
                  <FileViewerPage
                    file={file}
                    active={fileIndex === safeIndex}
                    actions={actions}
                    onZoomChange={fileIndex === safeIndex ? setZoomed : undefined}
                  />
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : (
          <FileViewerPage file={current} active actions={actions} onZoomChange={setZoomed} />
        )}

        {many && Platform.OS === 'web' && !zoomed ? (
          <>
            {safeIndex > 0 ? (
              <IconButton
                icon="chevronLeft"
                accessibilityLabel={m.common.files.previousFile}
                onPress={() => goTo(safeIndex - 1)}
                style={[styles.arrow, styles.arrowLeft]}
              />
            ) : null}
            {safeIndex < files.length - 1 ? (
              <IconButton
                icon="chevronRight"
                accessibilityLabel={m.common.files.nextFile}
                onPress={() => goTo(safeIndex + 1)}
                style={[styles.arrow, styles.arrowRight]}
              />
            ) : null}
          </>
        ) : null}
      </View>

      {actions.error ? (
        <View style={[styles.notice, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Notice
            tone="error"
            text={actions.error}
            onDismiss={actions.dismissError}
            dismissLabel={m.common.actions.close}
          />
        </View>
      ) : (
        <View style={{ height: insets.bottom }} />
      )}
    </View>
  );
}

type FileViewerPageProps = {
  file: ViewerFile;
  active: boolean;
  actions: FileActions;
  onZoomChange?: (zoomed: boolean) => void;
};

function FileViewerPage({ file, active, actions, onZoomChange }: FileViewerPageProps) {
  const kind = viewerFileKind(file);
  return kind === 'image' ? (
    <ImagePage file={file} active={active} onZoomChange={onZoomChange} />
  ) : (
    <DocumentPage file={file} kind={kind} actions={actions} />
  );
}

function ImagePage({ file, active, onZoomChange }: Omit<FileViewerPageProps, 'actions'>) {
  const styles = useStyles();
  const files = useFileService();
  const { m } = useI18n();
  // `attempt` remounts the image for a retry; the status belongs to that attempt.
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<{ attempt: number; value: 'loaded' | 'error' } | null>(null);
  const state = status !== null && status.attempt === attempt ? status.value : 'loading';
  const source = file.localUri ? { uri: file.localUri } : files.source(file.id, 'original');

  if (state === 'error') {
    return (
      <PageMessage
        text={m.common.files.imageFailed}
        actionLabel={m.common.actions.retry}
        onAction={() => setAttempt((value) => value + 1)}
      />
    );
  }

  return (
    <View style={styles.page}>
      <ZoomableImage
        key={attempt}
        source={source}
        accessibilityLabel={file.originalName}
        active={active}
        onZoomChange={onZoomChange}
        onLoad={() => setStatus({ attempt, value: 'loaded' })}
        onError={() => setStatus({ attempt, value: 'error' })}
      />
      {state === 'loading' ? (
        <View style={styles.pageOverlay}>
          <Spinner size={22} accessibilityLabel={m.common.states.loading} />
        </View>
      ) : null}
    </View>
  );
}

function DocumentPage({ file, kind, actions }: { file: ViewerFile; kind: 'pdf' | 'docx' | 'other'; actions: FileActions }) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const download = useFileDownload(file);
  const opening = actions.pending?.action === 'open' && actions.pending.fileId === file.id;
  const openExternally = () => void actions.openExternally(file);

  if (download.status === 'error') {
    return (
      <PageMessage
        text={download.message ?? m.common.files.downloadFailed}
        actionLabel={m.common.actions.retry}
        onAction={download.retry}
      />
    );
  }

  if (download.status !== 'ready') {
    const progress = download.status === 'loading' ? download.progress : null;
    return (
      <View style={[styles.page, styles.centered]}>
        <Text variant="smallMedium" color="textMuted" align="center">
          {kind === 'pdf' ? dict.student.pdf.loading : m.common.files.downloading}
        </Text>
        {progress === null ? (
          <Spinner size={20} />
        ) : (
          <View style={styles.progress}>
            <ProgressBar
              value={Math.round(progress * 100)}
              transition="linear"
              accessibilityLabel={m.common.files.downloading}
            />
          </View>
        )}
      </View>
    );
  }

  if (kind === 'pdf') {
    return (
      <View style={styles.page}>
        <PdfView uri={download.uri} name={file.originalName} onOpenExternally={openExternally} opening={opening} />
      </View>
    );
  }

  return (
    <FileHandOff
      name={file.originalName}
      typeLabel={fileTypeLabel(file)}
      hint={kind === 'docx' ? m.common.files.docxHint : m.common.files.previewUnavailable}
      onOpenExternally={openExternally}
      opening={opening}
    />
  );
}

function PageMessage({ text, actionLabel, onAction }: { text: string; actionLabel: string; onAction: () => void }) {
  const styles = useStyles();
  return (
    <View style={[styles.page, styles.centered]}>
      <Text variant="small" color="textMuted" align="center" accessibilityRole="alert">
        {text}
      </Text>
      <Button variant="outline" label={actionLabel} onPress={onAction} style={styles.retry} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.cardBg },
  header: {
    backgroundColor: t.colors.cardBg,
    borderBottomWidth: t.borders.hairline,
    borderBottomColor: t.colors.rowBorder,
  },
  headerRow: {
    minHeight: t.sizes.appBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: t.space.gutter,
  },
  titleBlock: { flex: 1, gap: 1 },
  headerSpinner: { width: t.sizes.iconCircle, height: t.sizes.iconCircle, alignItems: 'center', justifyContent: 'center' },
  // The site's viewer body: the file sits on the soft surface.
  body: { flex: 1, backgroundColor: t.colors.softBg },
  page: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: t.space.md, padding: 24 },
  pageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  progress: { width: '100%', maxWidth: 280, alignSelf: 'center' },
  retry: { alignSelf: 'center' },
  arrow: { position: 'absolute', top: '50%', marginTop: -t.sizes.iconCircle / 2 },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  notice: { paddingHorizontal: t.space.gutter, paddingTop: 10, backgroundColor: t.colors.softBg },
}));
