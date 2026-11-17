import { View } from 'react-native';

import type { ImportNumber, ImportPreview } from '@/api/types';
import { MathContent } from '@/components/math';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Card, Checkbox, Icon, Notice, PressableScale, Text, TextArea, TextButton } from '@/ui';

import { ImportPromptButton } from './import-prompt-button';
import { useImportPanel, type ImportPanelOptions, type ImportPanelState } from './use-import-panel';

/** Placeholder of the «JSON текстом» field — a format sample, not a sentence (the site hard-codes it too). */
const JSON_PLACEHOLDER = '{"formatVersion": 1, "topic": {...}, "numbers": [...]}';

export type ImportPanelViewProps = {
  state: ImportPanelState;
  /** The topics list shows the prompt button next to the AI / manual switch. */
  hidePromptButton?: boolean;
  testID?: string;
};

/**
 * Import panel (site: `TopicImportPanel`, docs/spec/07-developer-content.md §1.5): load the AI's JSON
 * reply (file, clipboard or typed), check it, read the preview, apply. The app never calls a model here.
 * Drag & drop becomes a tap on the tile (08 §5.15).
 */
export function ImportPanelView({ state, hidePromptButton = false, testID = 'import-panel' }: ImportPanelViewProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.topics.importPanel;
  const busy = state.checking || state.applying;
  const hasText = state.text.trim().length > 0;
  const loaded = hasText && !state.textOpen;

  const tileTitle = state.justLoaded ? t.successTitle : (state.fileName ?? m.content.importPanel.loadTitle);
  const tileSubtitle = state.fileName ? t.fileRead : loaded ? m.content.importPanel.textLoaded : m.content.importPanel.chooseJsonFile;

  return (
    <View style={styles.root} testID={testID}>
      {hidePromptButton ? null : <ImportPromptButton />}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${m.content.importPanel.chooseJsonFile}. ${tileTitle}`}
        accessibilityState={{ disabled: busy || state.picking, busy: state.picking }}
        disabled={busy || state.picking}
        onPress={state.pickFile}
        scaleTo={0.99}
        style={[styles.tile, state.justLoaded || loaded ? styles.tileLoaded : null]}
        testID="import-pick-file"
      >
        <View style={styles.tileIcon}>
          <Icon name={state.justLoaded || loaded ? 'check' : 'upload'} size={20} color="greenText" />
        </View>
        <View style={styles.tileTexts}>
          <Text variant="smallBold" color={state.justLoaded ? 'greenText' : 'textStrong'} numberOfLines={2}>
            {tileTitle}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {tileSubtitle}
          </Text>
        </View>
      </PressableScale>

      <View style={styles.sources}>
        <Button
          label={m.content.importPanel.pasteFromClipboard}
          variant="outline"
          size="sm"
          leftIcon="clipboard"
          disabled={busy}
          onPress={state.pasteFromClipboard}
          testID="import-paste"
        />
        <TextButton
          label={state.textOpen ? m.content.importPanel.hideText : t.pasteText}
          onPress={state.toggleText}
          style={styles.toggle}
          testID="import-toggle-text"
        />
      </View>

      {state.textOpen ? (
        <TextArea
          label={t.jsonLabel}
          value={state.text}
          onChangeText={state.changeText}
          placeholder={JSON_PLACEHOLDER}
          numberOfLines={5}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          disabled={busy}
          inputStyle={styles.mono}
          testID="import-text"
        />
      ) : null}

      <Hint>
        <Text variant="hint">{state.createMode ? t.hintCreate : t.hintAdd}</Text>
      </Hint>

      {state.preview === null ? (
        <Button
          label={state.checking ? t.checking : t.check}
          loading={state.checking}
          disabled={!hasText || state.wait.waiting}
          onPress={state.check}
          testID="import-check"
        />
      ) : null}

      {state.error ? <Notice tone="error" text={state.error} testID="import-error" /> : null}
      <RetryWaitLine seconds={state.wait.seconds} testID="import-wait" />

      {state.result ? (
        <Notice
          tone="success"
          text={`${format(t.done, { created: state.result.created, filled: state.result.filled, overwritten: state.result.overwritten })}${
            state.result.skipped > 0 ? format(t.doneSkipped, { skipped: state.result.skipped }) : ''
          }.`}
          onDismiss={state.dismissResult}
          dismissLabel={m.common.actions.close}
          testID="import-result"
        />
      ) : null}

      {state.preview ? <ImportPreviewBlock state={state} preview={state.preview} /> : null}
    </View>
  );
}

function ImportPreviewBlock({ state, preview }: { state: ImportPanelState; preview: ImportPreview }) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.topics.importPanel;
  const tiles: { key: string; label: string; value: number; danger: boolean }[] = [
    { key: 'add', label: t.tiles.add, value: preview.willAddNumbers, danger: false },
    { key: 'fill', label: t.tiles.fill, value: preview.willFillEmpty, danger: false },
    { key: 'overwrite', label: t.tiles.overwrite, value: preview.willOverwrite, danger: preview.willOverwrite > 0 },
    { key: 'untouched', label: t.tiles.untouched, value: preview.untouched, danger: false },
  ];

  return (
    <View style={styles.preview} testID="import-preview">
      <Text variant="smallStrong">{format(t.fileSummary, { title: preview.fileTitle, count: preview.totalInFile })}</Text>

      {preview.willCreateTopic ? (
        <Card variant="soft" padded={14} testID="import-will-create">
          <Text variant="cardKicker">{t.willCreate}</Text>
          <Text variant="cardTitle" style={styles.createTitle}>
            {preview.fileTitle}
          </Text>
          {preview.fileDescription ? (
            <Text variant="small" color="textMuted">
              {preview.fileDescription}
            </Text>
          ) : null}
          {preview.duplicateTitle ? (
            <Text variant="small" color="dangerText" style={styles.duplicate} testID="import-duplicate-title">
              {t.duplicateTitle}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Card key={tile.key} variant="soft" padded={12} style={styles.tileCell} testID={`import-tile-${tile.key}`}>
            <Text variant="statLabel">{tile.label}</Text>
            <Text variant="metric" tabular color={tile.danger ? 'dangerText' : 'textStrong'}>
              {String(tile.value)}
            </Text>
          </Card>
        ))}
      </View>

      {!state.createMode && preview.willOverwrite > 0 ? (
        // A plain checkbox, not a `CheckRow`: the row cuts both lines to one, and this warning must be read whole.
        <View style={styles.overwrite}>
          <Checkbox
            label={t.overwriteLabel}
            checked={state.overwriteFilled}
            onChange={state.setOverwriteFilled}
            disabled={state.applying}
            testID="import-overwrite"
          />
          <Text variant="caption" color="dangerText" style={styles.overwriteWarning} testID="import-overwrite-warning">
            {format(t.overwriteWarning, { count: preview.willOverwrite })}
          </Text>
        </View>
      ) : null}

      {preview.issues.length > 0 ? <MessageList label={t.issues} lines={preview.issues} danger testID="import-issues" /> : null}
      {/* The site styles this list as a hint, which leaves a bare label when hints are off; the model's
          warnings are data of the file, so they stay visible. */}
      {preview.warnings.length > 0 ? <MessageList label={t.warnings} lines={preview.warnings} testID="import-warnings" /> : null}

      {preview.sample.length > 0 ? (
        <View style={styles.sample}>
          <Text variant="kickerSm">{t.sample}</Text>
          {preview.sample.map((entry) => (
            <SampleCard key={entry.number} entry={entry} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={state.applying ? t.applying : state.createMode ? t.applyCreate : t.apply}
          loading={state.applying}
          disabled={state.wait.waiting}
          onPress={state.apply}
          testID="import-apply"
        />
        <Button label={t.cancel} variant="outline" disabled={state.applying} onPress={state.cancelPreview} testID="import-cancel" />
      </View>
    </View>
  );
}

function MessageList({ label, lines, danger = false, testID }: { label: string; lines: string[]; danger?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.messages} testID={testID}>
      <Text variant="kickerSm" color={danger ? 'dangerText' : 'kicker'}>
        {label}
      </Text>
      {lines.map((line, index) => (
        // The same sentence can repeat (two entries rejected for the same reason).
        <Text key={`${index}-${line}`} variant="small" color={danger ? 'dangerText' : 'label'}>
          {`— ${line}`}
        </Text>
      ))}
    </View>
  );
}

function SampleCard({ entry }: { entry: ImportNumber }) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.topics.importPanel;
  return (
    <Card variant="outline" padded={14} style={styles.sampleCard}>
      <Text variant="smallBold">{format(t.sampleNumber, { number: entry.number })}</Text>
      <MathContent value={entry.conditionLatex} />
      {entry.answerLatex ? (
        <>
          <Text variant="kickerSm">{t.answer}</Text>
          <MathContent value={entry.answerLatex} />
        </>
      ) : (
        <Hint>
          <Text variant="hint">{t.noAnswer}</Text>
        </Hint>
      )}
    </Card>
  );
}

/** The panel with its own state — for screens that keep it mounted (the topic's edit screen). */
export function ImportPanel({ hidePromptButton, testID, ...options }: ImportPanelOptions & Omit<ImportPanelViewProps, 'state'>) {
  const state = useImportPanel(options);
  return <ImportPanelView state={state} hidePromptButton={hidePromptButton} testID={testID} />;
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    minHeight: 72,
    padding: t.space.md,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.interactive,
    borderStyle: 'dashed',
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.dropzoneBg,
  },
  tileLoaded: { borderStyle: 'solid', borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenSoft },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: t.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.greenSoft,
  },
  tileTexts: { flex: 1, gap: 2 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  toggle: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  mono: { ...t.typography.mono },
  preview: { gap: t.space.md },
  createTitle: { marginTop: t.space.xxs },
  duplicate: { marginTop: t.space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  tileCell: { flexGrow: 1, flexBasis: '45%', gap: 2 },
  overwrite: { gap: t.space.xxs },
  // Aligned with the label: checkbox box + its gap.
  overwriteWarning: { marginLeft: t.sizes.checkbox + 10 },
  messages: { gap: t.space.xxs },
  sample: { gap: t.space.sm },
  sampleCard: { gap: t.space.sm },
  actions: { gap: t.space.md },
}));
