import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { isNotFoundError, qk, useApi } from '@/api';
import type { AiProfileRequest, AiProfileResponse, GroupDetailResponse, GroupMember } from '@/api/types';
import { LIMITS } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Notice, Select, Text, TextField, type SelectOption } from '@/ui';

import { AI_NOTE_MAX_LENGTH, aiNoteForRequest } from '../logic';
import { errorText } from '../shared/error-text';
import { invalidateGroupLists, invalidateGroupMembership } from '../shared/invalidate';
import { useFlash } from '../shared/use-flash';
import { FlashText } from './flash-text';

/** The site flashes «Сохранено» / «Ошибка» next to the member editor for 2200 ms. */
const EDITOR_FLASH_MS = 2200;
/** "Not set" in the speed select; a real speed is 1..10. */
const SPEED_NOT_SET = 0;

export type MemberAiEditorProps = {
  groupId: string;
  member: GroupMember;
  /**
   * A note that was sent while the editor was closing could not be saved: the editor is gone, so the
   * screen shows the reason.
   */
  onDetachedError?: (text: string) => void;
};

/** Writes a student's profile into the cached group, where the folded card and other screens read it. */
function patchMemberProfile(
  queryClient: QueryClient,
  groupId: string,
  studentId: string,
  profile: { speed: number | null; aiNote: string | null },
): void {
  queryClient.setQueryData<GroupDetailResponse>(qk('groups', 'getGroup', groupId), (current) =>
    current
      ? {
          ...current,
          group: {
            ...current.group,
            members: current.group.members.map((row) => (row.id === studentId ? { ...row, ...profile } : row)),
          },
        }
      : current,
  );
}

/**
 * AI profile of a student (06 §1.2 `GroupMemberEditor`, §3.6): speed 1..10 or "not set" and a one-line
 * note for the AI planner. There is no save button: the speed is saved as soon as it is picked, the note
 * when the user leaves the field and only if it changed. Both fields always travel together (full
 * overwrite).
 *
 * "Leaves the field" includes the routes that never deliver a blur on a phone: folding the editor,
 * switching the tab and going back all unmount the field while it is still focused (taps are handled
 * with the keyboard up, and React Native does not call `onBlur` of a removed input). A changed note is
 * therefore also sent when the editor unmounts.
 */
export function MemberAiEditor({ groupId, member, onDetachedError }: MemberAiEditorProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.planner.groups.memberEditor;
  const saveFailedText = dict.planner.groups.detail.notices.save;
  const flash = useFlash(EDITOR_FLASH_MS);
  const studentId = member.id;
  const [speed, setSpeed] = useState<number | null>(member.speed);
  const [note, setNote] = useState(member.aiNote ?? '');
  const [error, setError] = useState<string | null>(null);
  // The same values for the code that runs outside a render: request callbacks and the unmount hand-off.
  const live = useRef({
    note: member.aiNote ?? '',
    speed: member.speed,
    // What the server holds, as far as this editor knows: decides whether leaving the field saves anything.
    savedSpeed: member.speed,
    savedNote: member.aiNote ?? '',
    // The note of the request in flight: "Done" on the keyboard is followed by a blur, which must not send it twice.
    sendingNote: null as string | null,
  });
  // Requests of one editor go out one after another, so an earlier one can never overwrite a later one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const send = (input: AiProfileRequest): Promise<AiProfileResponse> => {
    const request = queue.current.catch(() => undefined).then(() => api.groups.setStudentAiProfile(studentId, input));
    queue.current = request;
    return request;
  };

  const save = useMutation({
    mutationFn: send,
    onMutate: () => {
      setError(null);
      flash.start();
    },
    onSuccess: (profile, input) => {
      flash.finish(true);
      live.current.savedSpeed = profile.speed;
      live.current.savedNote = input.aiNote ?? '';
      patchMemberProfile(queryClient, groupId, profile.studentId, { speed: profile.speed, aiNote: profile.aiNote });
      invalidateGroupLists(queryClient);
    },
    onError: (failure) => {
      flash.finish(false);
      // The select must not show a speed the server refused; the typed note stays for another try.
      live.current.speed = live.current.savedSpeed;
      setSpeed(live.current.savedSpeed);
      setError(errorText(failure, saveFailedText));
      // The student was deleted or moved to another teacher: the card itself is no longer true.
      if (isNotFoundError(failure)) invalidateGroupMembership(queryClient);
    },
    onSettled: (_profile, _failure, input) => {
      if (live.current.sendingNote === (input.aiNote ?? '')) live.current.sendingNote = null;
    },
  });

  // What the unmount hand-off needs, as of the last render (it must not re-run when a prop changes).
  const handOff = useRef({ send, queryClient, groupId, studentId, saveFailedText, onDetachedError });
  useEffect(() => {
    handOff.current = { send, queryClient, groupId, studentId, saveFailedText, onDetachedError };
  });

  // The editor is going away with a note the server has not seen: send it without the editor.
  useEffect(
    () => () => {
      const state = live.current;
      const context = handOff.current;
      const next = aiNoteForRequest(state.note) ?? '';
      if (next === (state.sendingNote ?? state.savedNote)) return;
      const profile = { speed: state.speed, aiNote: next === '' ? null : next };
      state.sendingNote = next;
      // The folded card shows the note at once; a refusal reloads the group and brings the old one back.
      patchMemberProfile(context.queryClient, context.groupId, context.studentId, profile);
      context.send(profile).then(
        (result) => {
          patchMemberProfile(context.queryClient, context.groupId, result.studentId, {
            speed: result.speed,
            aiNote: result.aiNote,
          });
          invalidateGroupLists(context.queryClient);
        },
        (failure: unknown) => {
          invalidateGroupMembership(context.queryClient);
          context.onDetachedError?.(errorText(failure, context.saveFailedText));
        },
      );
    },
    [],
  );

  const options: SelectOption<number>[] = [
    { value: SPEED_NOT_SET, label: t.speedNotSet },
    ...Array.from({ length: LIMITS.speed.max - LIMITS.speed.min + 1 }, (_, index) => {
      const value = LIMITS.speed.min + index;
      return { value, label: format(t.speedOf, { n: value }) };
    }),
  ];

  const changeNote = (text: string) => {
    live.current.note = text;
    setNote(text);
  };

  const changeSpeed = (value: number) => {
    const next = value === SPEED_NOT_SET ? null : value;
    live.current.speed = next;
    setSpeed(next);
    const aiNote = aiNoteForRequest(note);
    live.current.sendingNote = aiNote ?? '';
    save.mutate({ speed: next, aiNote });
  };

  const commitNote = () => {
    const next = aiNoteForRequest(note) ?? '';
    if (next === (live.current.sendingNote ?? live.current.savedNote)) return;
    live.current.sendingNote = next;
    save.mutate({ speed, aiNote: next === '' ? null : next });
  };

  return (
    <View style={styles.editor}>
      {error ? (
        <Notice
          tone="error"
          text={error}
          onDismiss={() => setError(null)}
          dismissLabel={m.common.actions.close}
          testID={`member-ai-error-${member.id}`}
        />
      ) : null}
      <Select
        label={t.speed}
        accessibilityLabel={t.speedAria}
        options={options}
        value={speed ?? SPEED_NOT_SET}
        onChange={changeSpeed}
        placeholder={t.speedNotSet}
        closeLabel={m.common.actions.close}
        size="sm"
        disabled={save.isPending}
        testID={`member-speed-${member.id}`}
      />
      <TextField
        label={t.aiNote}
        labelAside={<FlashText state={flash.state} testID={`member-ai-flash-${member.id}`} />}
        value={note}
        onChangeText={changeNote}
        onBlur={commitNote}
        onSubmitEditing={commitNote}
        placeholder={t.aiNotePlaceholder}
        maxLength={AI_NOTE_MAX_LENGTH}
        returnKeyType="done"
        testID={`member-note-${member.id}`}
      />
      <Hint>
        <Text variant="hint" color="textMuted">
          {m.groups.members.aiProfileHint}
        </Text>
      </Hint>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  editor: { gap: t.space.md },
}));
