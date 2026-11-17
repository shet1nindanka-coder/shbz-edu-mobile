import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorText, qk, useApi } from '@/api';
import type { DeveloperPanelData, SiteSettings } from '@/api/types';
import { useI18n } from '@/i18n';

import type { PanelResult } from './result-line';
import { draftToSettings, invalidFields, isDraftDirty, toDraft, type NumberSettingKey, type SettingsDraft } from './settings-form';
import { useRetryLock } from './use-retry-lock';

export type SettingsFormState = {
  draft: SettingsDraft;
  /** Numeric fields that cannot be saved as typed. */
  invalid: ReadonlySet<NumberSettingKey>;
  /** The form differs from the stored settings. */
  dirty: boolean;
  pending: boolean;
  /** Outcome of the last save; cleared by the next edit. */
  result: PanelResult | null;
  /** Rate-limit wait after a refused save. */
  waitSeconds: number;
  set: <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => void;
  reset: () => void;
  save: () => void;
};

/**
 * State of the Settings tab (07 §1.9, §4.5). It lives in the screen, not in the tab, so the sticky save
 * bar and the form share it and an unfinished edit survives a look at another inner tab.
 *
 * Until the first edit the form follows the server (a background refresh updates it); after it the typed
 * values win until they are saved or discarded. A save sends all 25 values, like the site's form, and the
 * form then shows the values the server really stored (it clamps).
 */
export function useSettingsForm(settings: SiteSettings | undefined): SettingsFormState | null {
  const api = useApi();
  const queryClient = useQueryClient();
  const { m } = useI18n();
  const [edited, setEdited] = useState<SettingsDraft | null>(null);
  const [result, setResult] = useState<PanelResult | null>(null);
  const lock = useRetryLock();

  const save = useMutation({
    mutationFn: (values: SiteSettings) => api.developer.saveSettings(values),
    onSuccess: (answer) => {
      setResult({ ok: answer.ok, message: answer.message });
      lock.lockFor(null);
      if (!answer.ok) return;
      queryClient.setQueryData<DeveloperPanelData>(qk('developer', 'getPanel'), (panel) =>
        panel ? { ...panel, settings: answer.settings } : panel,
      );
      setEdited(null);
      // Settings switch features on and off for every role's screens (availability flags, photo limits,
      // the login help line): everything cached is stale now.
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      setResult({ ok: false, message: errorText(error, m.common.errors.generic) });
      lock.lockFor(error);
    },
  });

  if (!settings) return null;
  const draft = edited ?? toDraft(settings);
  const invalid = new Set(invalidFields(draft));

  return {
    draft,
    invalid,
    dirty: edited !== null && isDraftDirty(edited, settings),
    pending: save.isPending,
    result,
    waitSeconds: lock.seconds,
    set: (key, value) => {
      setEdited({ ...draft, [key]: value });
      setResult(null);
    },
    reset: () => {
      setEdited(null);
      setResult(null);
    },
    save: () => {
      const values = draftToSettings(draft);
      if (values && !save.isPending) save.mutate(values);
    },
  };
}
