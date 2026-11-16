// "Demo data" — screen M1 of docs/spec/90-addendum-6.md §9.3. Mock builds only.
//
// The texts of THIS screen are developer-facing by the spec's own rule ("not added to the site
// dictionaries"), so its control labels are plain English literals, like the two `dev-*` galleries. The
// title, the reset action and its confirmation are user-visible in demos and come from `m.shell.demo`.
import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { API_MEMBERS, API_METHODS } from '@/api/client';
import { CHECK_ERROR_CODES, type CheckErrorCode, type SolutionVerdict } from '@/api/types';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import {
  getDemoBackend,
  getDemoPersonas,
  setLoginPrefill,
  useSession,
  type DemoPersona,
  type ForcedError,
  type ForcedPlanOutcome,
  type MockControls,
} from '@/providers';
import { clearFileCache, forgetAllLocalFiles } from '@/services/files';
import { isSimulatedOffline, setSimulatedOffline } from '@/services/network';
import { useRealtimeState } from '@/services/realtime';
import { makeStyles } from '@/theme';
import {
  Button,
  Card,
  Dialog,
  ListRow,
  Notice,
  Screen,
  SectionCard,
  Segmented,
  Select,
  Switch,
  Text,
  type SelectOption,
} from '@/ui';

import { DetailAppBar } from './DetailAppBar';
import { NotFoundScreen } from './NotFoundScreen';

const LATENCY_PRESETS: Record<string, { minMs: number; maxMs: number }> = {
  none: { minMs: 0, maxMs: 0 },
  default: { minMs: 200, maxMs: 600 },
  slow: { minMs: 1200, maxMs: 2500 },
  verySlow: { minMs: 4000, maxMs: 6000 },
};
const LATENCY_OPTIONS: SelectOption<string>[] = [
  { value: 'none', label: 'No delay' },
  { value: 'default', label: '200–600 ms (default)' },
  { value: 'slow', label: '1.2–2.5 s' },
  { value: 'verySlow', label: '4–6 s' },
];

const FORCED_ERRORS: ForcedError[] = ['sessionExpired', 'unauthorized', 'notFound', 'rateLimited', 'serviceUnavailable', 'network'];
const PLAN_OUTCOMES: ForcedPlanOutcome[] = ['unavailable', 'studentMissing', 'noCandidates', 'homeworkNoCandidates', 'homeworkParams', 'emptyPlan', 'failed'];
const VERDICT_PRESETS: Record<string, SolutionVerdict[]> = {
  'verdicts:correct': ['CORRECT'],
  'verdicts:incorrect': ['INCORRECT'],
  'verdicts:uncertain': ['UNCERTAIN'],
  'verdicts:mixed': ['CORRECT', 'INCORRECT', 'UNCERTAIN'],
};

const METHOD_OPTIONS: SelectOption<string>[] = [
  { value: '*', label: 'Any method (*)' },
  ...API_MEMBERS.flatMap((member) => API_METHODS[member].map((method) => ({ value: `${member}.${method}`, label: `${member}.${method}` }))),
];

function latencyKey(latency: MockControls['latency']): string {
  const match = Object.entries(LATENCY_PRESETS).find(([, preset]) => preset.minMs === latency.minMs && preset.maxMs === latency.maxMs);
  return match?.[0] ?? 'default';
}

function checkOutcomeKey(outcome: MockControls['nextCheckOutcome']): string {
  if (outcome === null) return 'rule';
  if (outcome.kind === 'failed') return `failed:${outcome.errorClass}`;
  if (outcome.kind === 'doneEmpty') return 'doneEmpty';
  const preset = Object.entries(VERDICT_PRESETS).find(([, verdicts]) => verdicts.join() === outcome.verdicts.join());
  return preset?.[0] ?? 'verdicts:mixed';
}

function parseCheckOutcome(key: string): MockControls['nextCheckOutcome'] {
  if (key === 'rule') return null;
  if (key === 'doneEmpty') return { kind: 'doneEmpty' };
  if (key.startsWith('failed:')) return { kind: 'failed', errorClass: key.slice('failed:'.length) as CheckErrorCode };
  return { kind: 'verdicts', verdicts: VERDICT_PRESETS[key] ?? ['CORRECT'] };
}

const CHECK_OUTCOME_OPTIONS: SelectOption<string>[] = [
  { value: 'rule', label: 'Rule V (scripted by fixtures)' },
  { value: 'verdicts:correct', label: 'All correct' },
  { value: 'verdicts:incorrect', label: 'All incorrect' },
  { value: 'verdicts:uncertain', label: 'All uncertain' },
  { value: 'verdicts:mixed', label: 'Correct, incorrect, uncertain' },
  { value: 'doneEmpty', label: 'Done, nothing found (homework)' },
  ...CHECK_ERROR_CODES.map((code) => ({ value: `failed:${code}`, label: `Failed: ${code}` })),
];

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d`;
}

function formatRemaining(resetAt: string | null, now: number): string {
  if (!resetAt) return 'open';
  const seconds = Math.max(0, Math.ceil((new Date(resetAt).getTime() - now) / 1000));
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} min left` : `${seconds} s left`;
}

export function DemoDataScreen() {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const backend = getDemoBackend();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { status, user, signOut } = useSession();
  const realtime = useRealtimeState();

  // The controls live in the mock store, outside React: a counter re-reads them after every change.
  const [, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const [now, setNow] = useState(() => Date.now());
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [forcedMethod, setForcedMethod] = useState('*');
  const [forcedError, setForcedError] = useState<ForcedError>('serviceUnavailable');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // The stored dataset replaces the freshly seeded one once it has loaded.
    void backend?.ready().then(refresh);
  }, [backend]);

  if (!backend) return <NotFoundScreen />;

  const controls = backend.controls.get();
  const dataset = backend.controls.datasetInfo();
  const settings = backend.backend.store.settings;
  const limiters = backend.controls.listLimiters();
  const set = <K extends keyof MockControls>(key: K, value: MockControls[K]) => {
    backend.controls.set(key, value);
    refresh();
  };
  const patchSettings = (patch: Parameters<typeof backend.backend.store.patchSettings>[0]) => {
    backend.backend.store.patchSettings(patch);
    void backend.flush();
    refresh();
  };

  const reset = async () => {
    setResetting(true);
    try {
      await backend.controls.resetDemoData();
      // Everything cached describes the old dataset — the query cache, downloaded files, and the picked
      // files the old rows pointed at.
      queryClient.clear();
      clearFileCache();
      forgetAllLocalFiles();
      setNotice(m.shell.demo.resetDone);
    } finally {
      setResetting(false);
      setConfirmReset(false);
      refresh();
    }
  };

  const pickPersona = async (persona: DemoPersona) => {
    setLoginPrefill({ login: persona.login, password: persona.password });
    if (status === 'signedIn') {
      // The role's tree goes away with the session; this screen is replaced by the login form.
      await signOut();
      router.replace('/login' as Href);
    } else {
      // Opened from the login screen: go back to it.
      navigation.back();
    }
  };

  const externalStreams = user ? (controls.externalRealtimeConnections[user.id] ?? 0) : 0;
  const pinsOn = controls.limiterPins.length > 0;

  return (
    <Screen testID="demo-data-screen" header={<DetailAppBar title={m.shell.demo.title} />}>
      <View style={styles.sections}>
        {notice ? <Notice tone="success" text={notice} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} /> : null}

        <SectionCard title="Dataset">
          <View style={styles.stack}>
            <Text variant="small" color="textMuted" testID="demo-dataset-age">
              {`Seeded ${formatAge(Math.max(0, now - new Date(dataset.t0).getTime()))} ago · generation ${dataset.generation}`}
            </Text>
            <Switch
              trailing
              label="Re-seed automatically after 24 h"
              value={dataset.autoReseed}
              onValueChange={(value) => {
                backend.controls.setAutoReseed(value);
                refresh();
              }}
            />
            <Button label={m.shell.demo.resetData} variant="danger" onPress={() => setConfirmReset(true)} style={styles.button} testID="demo-reset" />
          </View>
        </SectionCard>

        <SectionCard title="Personas" card={{ padded: false }}>
          {getDemoPersonas().map((persona, index, all) => (
            <ListRow
              key={persona.login}
              title={`${persona.name || persona.login} · ${persona.role ? dict.roles[persona.role] : 'no account'}`}
              subtitle={`${persona.login} — ${persona.note}`}
              subtitleLines={4}
              chevron={false}
              onPress={() => void pickPersona(persona)}
              divider={index < all.length - 1}
              testID={`demo-persona-${persona.login}`}
            />
          ))}
        </SectionCard>

        <SectionCard title="Network">
          <View style={styles.stack}>
            <Select
              label="Latency of every call"
              options={LATENCY_OPTIONS}
              value={latencyKey(controls.latency)}
              onChange={(key) => set('latency', LATENCY_PRESETS[key] ?? LATENCY_PRESETS.default)}
              placeholder="Choose"
              closeLabel={m.common.actions.close}
            />
            <Switch
              trailing
              label="Simulate offline"
              description="Every call fails with the client-side network error; the offline strip appears."
              value={isSimulatedOffline()}
              onValueChange={(value) => {
                setSimulatedOffline(value);
                refresh();
              }}
              testID="demo-offline"
            />
            <Select
              label="Fail the next call of"
              options={METHOD_OPTIONS}
              value={forcedMethod}
              onChange={setForcedMethod}
              placeholder="Choose"
              closeLabel={m.common.actions.close}
            />
            <Select
              label="With the error"
              options={FORCED_ERRORS.map((value) => ({ value, label: value }))}
              value={forcedError}
              onChange={setForcedError}
              placeholder="Choose"
              closeLabel={m.common.actions.close}
            />
            <View style={styles.rowButtons}>
              <Button
                label="Arm (1 call)"
                variant="outline"
                size="sm"
                onPress={() => set('forceNextError', { method: forcedMethod, error: forcedError, times: 1 })}
                testID="demo-force-error"
              />
              <Button label="Arm (3 calls)" variant="outline" size="sm" onPress={() => set('forceNextError', { method: forcedMethod, error: forcedError, times: 3 })} />
              <Button label="Disarm" variant="outline" size="sm" disabled={controls.forceNextError === null} onPress={() => set('forceNextError', null)} />
            </View>
            <Text variant="caption" color="textMuted">
              {controls.forceNextError
                ? `Armed: ${controls.forceNextError.method} → ${controls.forceNextError.error} × ${controls.forceNextError.times}`
                : 'Nothing armed.'}
            </Text>
          </View>
        </SectionCard>

        <SectionCard title="AI checks">
          <View style={styles.stack}>
            <Select
              label="Outcome of the next check"
              options={CHECK_OUTCOME_OPTIONS}
              value={checkOutcomeKey(controls.nextCheckOutcome)}
              onChange={(key) => set('nextCheckOutcome', parseCheckOutcome(key))}
              placeholder="Choose"
              closeLabel={m.common.actions.close}
            />
            <Switch trailing label="Check queue is full (503 queueFull)" value={controls.checkQueueFull} onValueChange={(value) => set('checkQueueFull', value)} />
            <Switch trailing label="Setting: aiEnabled" value={settings.aiEnabled} onValueChange={(value) => patchSettings({ aiEnabled: value })} />
            <Switch
              trailing
              label="Setting: lessonCheckEnabled"
              value={settings.lessonCheckEnabled}
              onValueChange={(value) => patchSettings({ lessonCheckEnabled: value })}
            />
            <View style={styles.rowButtons}>
              <Button
                label="Exhaust homework-check budget"
                variant="outline"
                size="sm"
                onPress={() => {
                  backend.controls.exhaust('api:homework-checks:global', 'global');
                  refresh();
                }}
              />
              <Button
                label="Exhaust lesson-check budget"
                variant="outline"
                size="sm"
                onPress={() => {
                  backend.controls.exhaust('api:lesson-checks:global', 'global');
                  refresh();
                }}
              />
            </View>
          </View>
        </SectionCard>

        <SectionCard title="AI plans">
          <View style={styles.stack}>
            <Select
              label="Outcome of the next generated participant"
              options={[{ value: 'none', label: 'Scripted by fixtures' }, ...PLAN_OUTCOMES.map((value) => ({ value, label: value }))]}
              value={controls.nextPlanOutcome ?? 'none'}
              onChange={(value) => set('nextPlanOutcome', value === 'none' ? null : (value as ForcedPlanOutcome))}
              placeholder="Choose"
              closeLabel={m.common.actions.close}
            />
            <Switch trailing label="Plan queue is full" value={controls.planQueueFull} onValueChange={(value) => set('planQueueFull', value)} />
            <Switch
              trailing
              label="Setting: lessonPlanEnabled"
              value={settings.lessonPlanEnabled}
              onValueChange={(value) => patchSettings({ lessonPlanEnabled: value })}
            />
            <Switch
              trailing
              label="Setting: homeworkPlanEnabled"
              value={settings.homeworkPlanEnabled}
              onValueChange={(value) => patchSettings({ homeworkPlanEnabled: value })}
            />
            <Button
              label="Exhaust daily plan budget"
              variant="outline"
              size="sm"
              onPress={() => {
                backend.controls.exhaust('api:ai-plans:global', 'global');
                refresh();
              }}
              style={styles.button}
            />
          </View>
        </SectionCard>

        <SectionCard title="Limits">
          <View style={styles.stack}>
            <Switch
              trailing
              label="Pinned buckets"
              description="locked@example.com (login) and egor@example.com (password change) are always refused."
              value={pinsOn}
              onValueChange={(value) =>
                set(
                  'limiterPins',
                  value
                    ? [
                        { scope: 'login:ip-login', identifier: 'mock-device:locked@example.com', retryAfterMs: 420_000 },
                        { scope: 'profile:password-update', identifier: 'usr_egor' },
                      ]
                    : [],
                )
              }
            />
            {limiters.length === 0 ? (
              <Text variant="small" color="textMuted">
                No limiter buckets yet.
              </Text>
            ) : (
              limiters.map((bucket) => (
                <Card key={`${bucket.scope}|${bucket.identifier}`} variant="soft" padded={12}>
                  <Text variant="smallStrong">{bucket.scope}</Text>
                  <Text variant="caption" color="textMuted">
                    {`${bucket.identifier} · ${bucket.kind} · ${bucket.hits} hits · ${formatRemaining(bucket.resetAt, now)}${bucket.pinned ? ' · pinned' : ''}`}
                  </Text>
                </Card>
              ))
            )}
            <Button
              label="Clear limiter buckets"
              variant="outline"
              size="sm"
              onPress={() => {
                backend.controls.clearLimiters();
                refresh();
              }}
              style={styles.button}
              testID="demo-clear-limiters"
            />
          </View>
        </SectionCard>

        <SectionCard title="Realtime">
          <View style={styles.stack}>
            <Text variant="small" color="textMuted" testID="demo-realtime-state">
              {realtime.status === 'refused'
                ? `Connection: refused (${realtime.code}), retry at ${new Date(realtime.retryAt).toLocaleTimeString()}`
                : `Connection: ${realtime.status}`}
            </Text>
            {user ? (
              <>
                <Text variant="kickerSm">Streams held by other clients of this user</Text>
                <Segmented
                  fill
                  options={[
                    { value: '0', label: '0' },
                    { value: '1', label: '1' },
                    { value: '2', label: '2 (refused)' },
                  ]}
                  value={String(externalStreams)}
                  onChange={(value) =>
                    set('externalRealtimeConnections', { ...controls.externalRealtimeConnections, [user.id]: Number(value) as 0 | 1 | 2 })
                  }
                />
              </>
            ) : (
              <Text variant="small" color="textMuted">
                Sign in to change the streams of a user.
              </Text>
            )}
          </View>
        </SectionCard>

        <SectionCard title="Lesson">
          <Button
            label="Restart the lesson that starts in a minute"
            variant="outline"
            onPress={() => {
              backend.controls.rearmSoonLesson();
              void queryClient.invalidateQueries();
              setNotice('The lesson of dasha@example.com starts in one minute.');
            }}
            style={styles.button}
            testID="demo-rearm-lesson"
          />
        </SectionCard>
      </View>

      <Dialog
        visible={confirmReset}
        title={m.shell.demo.resetConfirmTitle}
        description={m.shell.demo.resetConfirmBody}
        confirmLabel={m.shell.demo.resetData}
        cancelLabel={m.common.actions.cancel}
        pending={resetting}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
        testID="demo-reset-dialog"
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  sections: { gap: t.space.sectionGap },
  stack: { gap: t.space.md },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  button: { alignSelf: 'flex-start' },
}));
