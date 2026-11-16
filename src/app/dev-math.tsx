// Verification-only page for the content subsystem: `MathContent` on real statements of every shape
// (docs/spec/09-data-i18n-math.md §2.4), the file cards, the photo grid and the full-screen viewer, in
// both themes and both languages. Not linked from the app. Plain English captions are fine in this one
// file; everything the components render themselves comes from the dictionaries.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  FileCard,
  FileViewerModal,
  PhotoGrid,
  PhotoSourceSheet,
  type PhotoGridItem,
  type PhotoSource,
  type ViewerFile,
} from '@/components/files';
import { MathContent, MathPreview } from '@/components/math';
import { I18nProvider, useI18n, type Locale } from '@/i18n';
import { createMockFileService, FileServiceProvider, registerLocalFile } from '@/services/files';
import { pickFromCamera, pickFromLibrary } from '@/services/photos';
import { ThemeProvider, useAppFonts, useTheme, type ThemeMode } from '@/theme';
import { AppBar, Button, Logo, Notice, PageHeader, Screen, SectionCard, Segmented, Text, TextArea } from '@/ui';

type Sample = { id: string; note: string; value: string };

const CONDITIONS: Sample[] = [
  { id: '112', note: 'inline math', value: 'Решите уравнение $3x - 7 = 11$.' },
  {
    id: '113',
    note: 'heading + labelled items row',
    value: 'Решите уравнение:\nа) $2x + 5 = 17$ б) $4 - 3x = 10$ в) $\\dfrac{x}{2} - 1 = 3$',
  },
  { id: '118', note: 'tall inline fractions', value: 'Решите уравнение $\\dfrac{2x - 1}{3} - \\dfrac{x + 2}{4} = 1$.' },
  {
    id: '120',
    note: 'plain text, soft-wrapped lines → native text (no WebView)',
    value:
      'Ученик задумал число. Если его умножить на 4, к произведению прибавить 8 и полученную\nсумму разделить на 2, то получится\n10. Какое число задумал ученик?',
  },
  { id: '121', note: '$$…$$ glued to a text line', value: 'Найдите корень уравнения:\n$$5(x - 2) - 3(2x + 1) = 4x - 28$$' },
  {
    id: '130',
    note: 'long display formula: wraps, operator repeats at the line start',
    value: 'Упростите выражение:\n$$(a+1)^2+(a+2)^2+(a+3)^2+(a+4)^2+(a+5)^2-5a^2-30a$$',
  },
  {
    id: '131',
    note: 'long inline formula inside a sentence',
    value: 'Докажите, что $a^3+b^3+c^3-3abc=(a+b+c)(a^2+b^2+c^2-ab-bc-ca)$ при любых значениях переменных.',
  },
  { id: '218', note: '\\[ … \\] as a whole block', value: 'Постройте график функции и найдите её нули:\n\n\\[ y = 2x^2 - 8x + 6 \\]' },
  { id: '220', note: 'broken LaTeX → inline error chip', value: 'Найдите значение выражения $\\frac{1}{x$ при $x = 2$.' },
  { id: '221', note: 'broken LaTeX → display error block', value: 'Вычислите:\n$$\\frac{1}{x + \\sqrt{2$$' },
  {
    id: '223',
    note: 'Cyrillic inside \\text{}',
    value:
      'Площадь прямоугольника $S_{\\text{пр}} = 48\\ \\text{см}^2$, одна сторона на $2$ см больше другой. Найдите стороны.',
  },
  { id: '226', note: 'cases environment', value: 'Решите систему:\n$$\\begin{cases} y = x^2 - 4 \\\\ y = x + 2 \\end{cases}$$' },
  { id: '305', note: 'multi-line $$', value: 'Вычислите.\n$$\\int_0^1\nx^2\\,dx$$' },
  {
    id: '308',
    note: 'labelled items inside display math → \\displaystyle items',
    value:
      'Найдите производную:\n$$\\text{А)}\\ f(x)=\\sin x \\quad \\text{Б)}\\ f(x)=e^{2x} \\quad \\text{В)}\\ f(x)=\\ln(x+1) \\quad \\text{Г)}\\ f(x)=\\dfrac{x^2+1}{x-1}$$',
  },
  { id: '540', note: 'plain labelled items → native rows', value: 'Выберите верные утверждения:\nа) число 7 простое б) число 9 простое в) число 2 чётное' },
];

const ANSWERS: Sample[] = [
  { id: '112', note: 'bare', value: '$x = 6$' },
  { id: '113', note: 'bare, items', value: 'а) $x=6$ б) $x=-2$ в) $x=8$' },
  { id: '302', note: 'bare, text + math', value: 'Возрастает на $(-\\infty;\\,-1]$ и $[1;\\,+\\infty)$, убывает на $[-1;\\,1]$.' },
  { id: '207', note: 'bare', value: '$x_1 = 2,\\ x_2 = 3$' },
];

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FILES = {
  theory: { id: 'file_quadratic_theory', originalName: 'quadratic-functions-theory.pdf', mimeType: 'application/pdf', size: 1_468_000 },
  homework: { id: 'file_quadratic_homework', originalName: 'quadratic-functions-homework.docx', mimeType: DOCX_MIME, size: 18_400 },
  cheatsheet: { id: 'file_derivative_cheatsheet', originalName: 'derivative-cheatsheet.png', mimeType: 'image/png', size: 412_000 },
} satisfies Record<string, ViewerFile>;

const INITIAL_PHOTOS: PhotoGridItem[] = [
  { key: 'p1', fileId: 'file_photo_01', name: 'IMG_2041.jpg' },
  { key: 'p2', fileId: 'file_photo_02', name: 'IMG_2042.jpg' },
  { key: 'p3', fileId: 'file_photo_03', name: 'IMG_2043.jpg' },
  { key: 'p4', fileId: 'file_photo_04', name: 'IMG_2044.jpg' },
  { key: 'p5', fileId: 'file_photo_05', name: 'IMG_2045.jpg', uploading: true },
];

/** Stands in for the mock store: what a file is, or null when it does not exist. */
function lookupDemoFile(fileId: string) {
  const known = Object.values(FILES).find((file) => file.id === fileId);
  if (known) return { mimeType: known.mimeType, originalName: known.originalName, size: known.size };
  if (fileId.startsWith('file_photo_')) return { mimeType: 'image/jpeg' };
  return null;
}

const MAX_PHOTOS = 10;

function Caption({ children }: { children: string }) {
  return <Text variant="kickerSm">{children}</Text>;
}

function Gallery({
  mode,
  onModeChange,
  onLocaleChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
  onLocaleChange: (locale: Locale) => void;
}) {
  const theme = useTheme();
  const { locale, dict, m } = useI18n();
  const [draft, setDraft] = useState('Найдите $x$, если $\\ln x = 2\\ln 3 - \\ln 6$.');
  const [photos, setPhotos] = useState(INITIAL_PHOTOS);
  const [viewer, setViewer] = useState<{ files: ViewerFile[]; index: number; title?: string } | null>(null);
  const [sourceSheet, setSourceSheet] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const photoFiles: ViewerFile[] = photos
    .filter((photo) => !photo.uploading)
    .map((photo) => ({ id: photo.fileId, originalName: photo.name, mimeType: 'image/jpeg', localUri: photo.localUri }));

  const addPhotos = async (source: PhotoSource) => {
    setPicking(true);
    setPickError(null);
    const free = MAX_PHOTOS - photos.length;
    const result =
      source === 'camera' ? await pickFromCamera({ locale }) : await pickFromLibrary({ multiple: true, limit: free, locale });
    setPicking(false);
    if (result.status === 'picked') {
      const added = result.files.map((file, index) => {
        const fileId = `file_local_${Date.now()}_${index}`;
        // What the mock backend does on upload: the picked file becomes resolvable under its file id.
        registerLocalFile(fileId, { uri: file.uri, mimeType: file.mimeType, originalName: file.name, size: file.size });
        return { key: fileId, fileId, name: file.name };
      });
      setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    } else if (result.status === 'invalid') {
      setPickError(result.message);
    } else if (result.status === 'denied') {
      setPickError(m.common.photos.permissionDenied);
    } else if (result.status === 'unavailable') {
      setPickError(m.common.photos.cameraUnavailable);
    } else if (result.status === 'failed') {
      setPickError(m.common.photos.pickFailed);
    }
  };

  return (
    <Screen testID="dev-math" header={<AppBar left={<Logo />} />}>
      <PageHeader
        kicker="Content subsystem"
        title="Math & files"
        gap={24}
        aside={
          <View style={{ gap: 10 }}>
            <Segmented
              fill
              accessibilityLabel="Theme"
              value={mode}
              onChange={onModeChange}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
            <Segmented
              fill
              accessibilityLabel="Language"
              value={locale}
              onChange={onLocaleChange}
              options={[
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
              ]}
            />
          </View>
        }
      />

      <View style={{ gap: theme.space.sectionGap }}>
        <SectionCard title="MathContent · card" card={{ padded: 16 }}>
          <View style={{ gap: 18 }}>
            {CONDITIONS.map((sample) => (
              <View key={sample.id} testID={`sample-${sample.id}`} style={{ gap: 6 }}>
                <Caption>{`№ ${sample.id} · ${sample.note}`}</Caption>
                <MathContent value={sample.value} />
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title="MathContent · bare" card={{ padded: 16 }}>
          <View style={{ gap: 14 }}>
            {ANSWERS.map((sample) => (
              <View key={sample.id} style={{ gap: 4 }}>
                <Caption>{`№ ${sample.id} · ${sample.note}`}</Caption>
                <MathContent value={sample.value} variant="bare" />
              </View>
            ))}
            <View style={{ gap: 4 }}>
              <Caption>maxCollapsedLines = 2 (math)</Caption>
              <MathContent value={CONDITIONS[6].value} variant="bare" maxCollapsedLines={2} />
            </View>
            <View style={{ gap: 4 }}>
              <Caption>maxCollapsedLines = 2 (plain text)</Caption>
              <MathContent value={CONDITIONS[3].value} variant="bare" maxCollapsedLines={2} />
            </View>
          </View>
        </SectionCard>

        <SectionCard title="MathPreview" card={{ padded: 16 }}>
          <View style={{ gap: 12 }}>
            <TextArea label={dict.topics.answerManager.conditionPreview} value={draft} onChangeText={setDraft} testID="draft" />
            <MathPreview value={draft} testID="preview" />
          </View>
        </SectionCard>

        <View style={{ gap: 16 }}>
          <FileCard
            testID="card-theory"
            title={dict.topics.view.theory}
            file={FILES.theory}
            onOpen={(file) => setViewer({ files: [file], index: 0, title: 'Квадратные функции' })}
          />
          <FileCard
            testID="card-homework"
            title={dict.topics.view.homework}
            file={FILES.homework}
            onOpen={(file) => setViewer({ files: [file], index: 0 })}
          />
          <FileCard
            testID="card-image"
            title={dict.topics.view.theory}
            description="Image file: fitted preview"
            file={FILES.cheatsheet}
            onOpen={(file) => setViewer({ files: [file], index: 0 })}
          />
          <FileCard testID="card-missing" title={dict.topics.view.homework} file={null} />
          <Button
            variant="outline"
            label="Open a file that does not exist (404)"
            onPress={() =>
              setViewer({ files: [{ id: 'file_gone', originalName: 'deleted.pdf', mimeType: 'application/pdf' }], index: 0 })
            }
          />
        </View>

        <SectionCard title={dict.student.photos.title} description={dict.student.photos.subtitle} card={{ padded: 16 }}>
          <View style={{ gap: 12 }}>
            {pickError ? (
              <Notice tone="error" text={pickError} onDismiss={() => setPickError(null)} dismissLabel={m.common.actions.close} />
            ) : null}
            <PhotoGrid
              testID="photo-grid"
              photos={photos}
              onOpen={(index) => setViewer({ files: photoFiles, index })}
              onRemove={(photo) => setPhotos((current) => current.filter((item) => item.key !== photo.key))}
              onAdd={() => setSourceSheet(true)}
              addDisabled={photos.length >= MAX_PHOTOS}
              addBusy={picking}
            />
            <Text variant="caption" tabular>{`${photos.length} / ${MAX_PHOTOS}`}</Text>
            <Button
              variant="outline"
              label="Read-only grid (teacher review)"
              onPress={() => setViewer({ files: photoFiles, index: 1 })}
            />
            <PhotoGrid photos={photos.slice(0, 4)} columns={4} onOpen={(index) => setViewer({ files: photoFiles, index })} />
          </View>
        </SectionCard>
      </View>

      <PhotoSourceSheet visible={sourceSheet} onClose={() => setSourceSheet(false)} onSelect={(source) => void addPhotos(source)} />
      <FileViewerModal
        visible={viewer !== null}
        files={viewer?.files ?? []}
        initialIndex={viewer?.index ?? 0}
        title={viewer?.title}
        onClose={() => setViewer(null)}
        testID="viewer"
      />
    </Screen>
  );
}

export default function DevMathRoute() {
  const { loaded, error } = useAppFonts();
  const [mode, setMode] = useState<ThemeMode>('system');
  const [locale, setLocale] = useState<Locale>('ru');
  const files = useMemo(() => createMockFileService({ lookup: lookupDemoFile, locale: () => locale }), [locale]);
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider mode={mode}>
        <I18nProvider locale={locale} onChangeLocale={setLocale}>
          <FileServiceProvider service={files}>
            <Gallery mode={mode} onModeChange={setMode} onLocaleChange={setLocale} />
          </FileServiceProvider>
        </I18nProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
