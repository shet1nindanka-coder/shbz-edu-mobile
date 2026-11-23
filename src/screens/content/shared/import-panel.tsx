import { View } from 'react-native';

import type { ImportNumber, ImportPreview } from '@/api/types';
import { MathContent } from '@/components/math';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, Icon, Notice, PressableScale, Switch, Text, TextArea, TextButton } from '@/ui';

import { ImportPromptButton } from './import-prompt-button';
import type { ImportPanelState } from './use-import-panel';

/** Placeholder of the «JSON текстом» field — a format sample, not a sentence (the site hard-codes it too). */
const JSON_PLACEHOLDER = '{"formatVersion": 1, "topic": {...}, "numbers": [...]}';

export type ImportPanelViewProps = {
  state: ImportPanelState;
  /** The topics list shows the prompt button next to the AI / manual switch. */
  hidePromptButton?: boolean;
  /**
   * The panel shares the screen with another main action (the editor's «Сохранить» on a tablet): its own
   * steps are then ordinary buttons — a screen has one gradient action.
   */
  secondary?: boolean;
  testID?: string;
};

/**
 * Import panel (site: `TopicImportPanel`, docs/spec/07-developer-content.md §1.5): load the AI's JSON
 * reply (file, clipboard or typed), check it, read the preview of what will change, apply. The app never
 * calls a model here. Drag & drop becomes a tap on the slot. Rendered inside a card or a sheet.
 */
export function ImportPanelView({ state, hidePromptButton = false, secondary = false, testID = 'import-panel' }: ImportPanelViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.topics.importPanel;
  const busy = state.checking || state.applying;
  const hasText = state.text.trim().length > 0;
  const loaded = hasText && !state.textOpen;
  const done = state.justLoaded || loaded;

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
        style={[styles.drop, done ? styles.dropLoaded : null]}
        testID="import-pick-file"
      >
        <Icon name={done ? 'check' : 'upload'} size={theme.sizes.icon.lg} color={done ? 'greenText' : 'textMuted'} />
        <Text variant="bodyBold" color={done ? 'greenText' : 'textStrong'} align="center" numberOfLines={2}>
          {tileTitle}
        </Text>
        <Text variant="small" color={done ? 'greenText' : 'textMuted'} align="center" numberOfLines={2}>
          {tileSubtitle}
        </Text>
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
          variant={secondary ? 'outline' : 'primary'}
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

      {state.preview ? <ImportPreviewBlock state={state} preview={state.preview} secondary={secondary} /> : null}
    </View>
  );
}

function ImportPreviewBlock({ state, preview, secondary }: { state: ImportPanelState; preview: ImportPreview; secondary: boolean }) {
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
      <Text variant="bodyStrong">{format(t.fileSummary, { title: preview.fileTitle, count: preview.totalInFile })}</Text>

      {preview.willCreateTopic ? (
        <Card style={styles.create} testID="import-will-create">
          <Text variant="small" color="textMuted">
            {t.willCreate}
          </Text>
          <Text variant="cardTitle">{preview.fileTitle}</Text>
          {preview.fileDescription ? (
            <Text variant="small" color="textMuted">
              {preview.fileDescription}
            </Text>
          ) : null}
          {preview.duplicateTitle ? (
            <Text variant="small" color="redText" testID="import-duplicate-title">
              {t.duplicateTitle}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {/* What the import will change: the number first, its caption under it. */}
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Card key={tile.key} style={styles.tileCell} accessibilityLabel={`${tile.label}: ${tile.value}`} testID={`import-tile-${tile.key}`}>
            <Text variant="metric" tabular color={tile.danger ? 'redText' : 'textStrong'}>
              {String(tile.value)}
            </Text>
            <Text variant="small" color="textMuted">
              {tile.label}
            </Text>
          </Card>
        ))}
      </View>

      {!state.createMode && preview.willOverwrite > 0 ? (
        <View style={styles.overwrite}>
          <Switch
            trailing
            label={t.overwriteLabel}
            value={state.overwriteFilled}
            onValueChange={state.setOverwriteFilled}
            disabled={state.applying}
            testID="import-overwrite"
          />
          {/* Not the switch's own sub-line: this warning is about lost work and must stand out. */}
          <Text variant="small" color="redText" testID="import-overwrite-warning">
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
          <Text variant="smallStrong" color="textMuted" accessibilityRole="header">
            {t.sample}
          </Text>
          {preview.sample.map((entry) => (
            <SampleCard key={entry.number} entry={entry} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={state.applying ? t.applying : state.createMode ? t.applyCreate : t.apply}
          variant={secondary ? 'dark' : 'primary'}
          leftIcon="upload"
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
      <Text variant="smallStrong" color={danger ? 'redText' : 'textMuted'}>
        {label}
      </Text>
      {lines.map((line, index) => (
        // The same sentence can repeat (two entries rejected for the same reason).
        <Text key={`${index}-${line}`} variant="small" color={danger ? 'redText' : 'label'}>
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
    <Card style={styles.sampleCard}>
      <Text variant="bodyBold">
        {format(t.sampleNumber, { number: entry.number })}
      </Text>
      <MathContent value={entry.conditionLatex} variant="bare" />
      {entry.answerLatex ? (
        <>
          <Text variant="small" color="textMuted">
            {t.answer}
          </Text>
          <MathContent value={entry.answerLatex} variant="bare" />
        </>
      ) : (
        <Hint>
          <Text variant="hint">{t.noAnswer}</Text>
        </Hint>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  // The slot for the AI's reply (`.drop`): dashed while empty, solid green once something is loaded.
  drop: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xxs,
    paddingVertical: t.space.xl,
    paddingHorizontal: t.space.lg,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.interactive,
    borderStyle: 'dashed',
    borderColor: t.colors.line2,
    backgroundColor: t.colors.softBg,
  },
  dropLoaded: { borderStyle: 'solid', borderColor: t.colors.greenSolid, backgroundColor: t.colors.greenSoft },
  // The text link drops under the button on a narrow phone: no extra air between the two then.
  sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.md },
  toggle: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  mono: { ...t.typography.mono },
  preview: { gap: t.space.md },
  create: { gap: t.space.xxs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  tileCell: { flexGrow: 1, flexBasis: '45%', gap: t.space.xxxs },
  overwrite: { gap: t.space.xxs },
  messages: { gap: t.space.xxs },
  sample: { gap: t.space.sm },
  sampleCard: { gap: t.space.sm },
  actions: { gap: t.space.md },
}));
