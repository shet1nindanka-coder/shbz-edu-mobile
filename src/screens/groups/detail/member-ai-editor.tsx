import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { AiProfileRequest, AiProfileResponse, GroupDetailResponse, GroupMember } from '@/api/types';
import { LIMITS } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Notice, Select, Text, TextField, type SelectOption } from '@/ui';

import { AI_NOTE_MAX_LENGTH, aiNoteForRequest } from '../logic';
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
  // A read of the group that is still in flight left before this write and would bring the older profile
  // back into the cache: it is restarted, so the new read is made after the write.
  const queryKey = qk('groups', 'getGroup', groupId);
  if (queryClient.isFetching({ queryKey, exact: true }) > 0) {
    void queryClient.invalidateQueries({ queryKey, exact: true });
  }
}

/**
 * The requests for one student's profile, shared by every editor of that student. A folded editor and the
 * one reopened in its place are two instances, and their requests must still go out one after another (an
 * earlier one can never overwrite a later one) and be numbered in one sequence, so that only the outcome
 * of the newest request decides what is shown or reported.
 */
type ProfileChannel = {
  queue: Promise<unknown>;
  latest: number;
  /** Requests of any editor of this student that have not settled yet. */
  inFlight: number;
  /**
   * The values of the newest request while any request runs. A read of the group can still land with the
   * older server state in that window (it left before the write), so an editor opened then starts from
   * these values, and no editor adopts the cached profile until every request has settled.
   */
  optimistic: { speed: number | null; aiNote: string | null } | null;
};
const channels = new Map<string, ProfileChannel>();

function channelOf(studentId: string): ProfileChannel {
  let channel = channels.get(studentId);
  if (!channel) {
    channel = { queue: Promise.resolve(), latest: 0, inFlight: 0, optimistic: null };
    channels.set(studentId, channel);
  }
  return channel;
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
 *
 * State machine (`live` holds it for the code that runs outside a render):
 * - `note` / `speed` — what the editor shows; `savedNote` / `savedSpeed` — what the server holds as far as
 *   this editor knows; `sendingNote` — the note of the request in flight; `pending` — its requests in flight.
 * - Send (speed pick, note commit, unmount hand-off): the request takes the next number of the student's
 *   channel and the cached group is patched at once with the values being sent, so the folded card and an
 *   editor reopened while the request runs start from them, not from the older cached ones.
 * - Success: `saved*` follow the server. Only the latest request of the channel writes the cache and the
 *   «Сохранено» flash (a later request already patched the cache with newer values).
 * - Failure of the latest request: the group is re-read, so the cache drops the refused optimistic values.
 *   While mounted, the select goes back to `savedSpeed`, the typed note stays for another try and the
 *   editor shows the reason. Once unmounted (folded, tab switched, gone back), the reason goes to the
 *   screen through `onDetachedError` — exactly once, because only the latest request reports. A failure of
 *   an earlier request says nothing: the later one carries the values on screen.
 * - Props: a changed `member` (the success of a request of an earlier instance, or the re-read after a
 *   failure) is adopted only once no request of the student runs (a group read landing earlier may predate
 *   the write) and nothing local is pending — the note while it equals `savedNote` and no
 *   note is being sent, the speed while it equals `savedSpeed` and no request is in flight — so a note
 *   being typed is never replaced and a later save never resends an older note than the stored one.
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
  // While a request of this student runs, the cache may hold an older profile (see `ProfileChannel.optimistic`).
  const [seed] = useState(() => channelOf(studentId).optimistic ?? { speed: member.speed, aiNote: member.aiNote });
  const [speed, setSpeed] = useState<number | null>(seed.speed);
  const [note, setNote] = useState(seed.aiNote ?? '');
  const [error, setError] = useState<string | null>(null);
  // The same values for the code that runs outside a render: request callbacks and the unmount hand-off.
  const live = useRef({
    note: seed.aiNote ?? '',
    speed: seed.speed,
    // What the server holds, as far as this editor knows: decides whether leaving the field saves anything.
    savedSpeed: seed.speed,
    savedNote: seed.aiNote ?? '',
    // The note of the request in flight: "Done" on the keyboard is followed by a blur, which must not send it twice.
    sendingNote: null as string | null,
    // Requests of this editor still in flight.
    pending: 0,
  });
  // Request callbacks run after an unmount too: they report a refusal to the screen when the editor is gone.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = (input: AiProfileRequest): Promise<AiProfileResponse> => {
    const channel = channelOf(studentId);
    channel.inFlight += 1;
    channel.optimistic = { speed: input.speed, aiNote: input.aiNote };
    const request = channel.queue.catch(() => undefined).then(() => api.groups.setStudentAiProfile(studentId, input));
    channel.queue = request;
    // Settled before the callbacks of the caller run, so their cache writes are adopted by every editor.
    return request.finally(() => {
      channel.inFlight -= 1;
      if (channel.inFlight === 0) channel.optimistic = null;
    });
  };

  const save = useMutation({
    mutationFn: ({ request }: { request: AiProfileRequest; seq: number }) => send(request),
    onMutate: () => {
      setError(null);
      flash.start();
    },
    onSuccess: (profile, { request, seq }) => {
      // What the server holds now, whichever request this was.
      live.current.savedSpeed = profile.speed;
      live.current.savedNote = request.aiNote ?? '';
      invalidateGroupLists(queryClient);
      // A later request is queued: it patched the cache with newer values and decides what is shown.
      if (seq !== channelOf(studentId).latest) return;
      patchMemberProfile(queryClient, groupId, profile.studentId, { speed: profile.speed, aiNote: profile.aiNote });
      if (!mounted.current) return;
      flash.finish(true);
      // The latest request carried everything on screen: an earlier refusal is no longer true.
      setError(null);
      live.current.speed = profile.speed;
      setSpeed(profile.speed);
    },
    onError: (failure, { seq }) => {
      // The student was deleted or moved to another teacher: the card itself is no longer true.
      if (isNotFoundError(failure)) invalidateGroupMembership(queryClient);
      // A later request is queued with the values on screen: it decides what is shown.
      if (seq !== channelOf(studentId).latest) return;
      // The cache was patched with the refused values: read back what the server holds.
      invalidateGroupMembership(queryClient);
      const reason = errorText(failure, saveFailedText);
      if (!mounted.current) {
        // The editor is gone (folded, tab switched, gone back): the screen shows the reason.
        handOff.current.onDetachedError?.(reason);
        return;
      }
      flash.finish(false);
      // The select must not show a speed the server refused: it goes back to the last speed the server
      // confirmed (the next note save sends that one). The typed note stays for another try.
      live.current.speed = live.current.savedSpeed;
      setSpeed(live.current.savedSpeed);
      setError(reason);
    },
    onSettled: (_profile, _failure, { request }) => {
      live.current.pending -= 1;
      if (live.current.sendingNote === (request.aiNote ?? '')) live.current.sendingNote = null;
    },
  });

  const submit = (request: AiProfileRequest) => {
    const channel = channelOf(studentId);
    channel.latest += 1;
    live.current.pending += 1;
    // An editor reopened while this request runs starts from these values, not from the older cached ones.
    patchMemberProfile(queryClient, groupId, studentId, { speed: request.speed, aiNote: request.aiNote });
    save.mutate({ request, seq: channel.latest });
  };

  // What the unmount hand-off and the detached report need, as of the last render.
  const handOff = useRef({ send, queryClient, groupId, studentId, saveFailedText, onDetachedError });
  useEffect(() => {
    handOff.current = { send, queryClient, groupId, studentId, saveFailedText, onDetachedError };
  });

  // A changed profile from outside (a request of an earlier editor of this student was saved, or the group
  // was re-read after a refusal) is shown while nothing local is pending.
  useEffect(() => {
    const state = live.current;
    // A request of this student still runs (possibly of an earlier editor): a group read landing now may
    // carry the profile from before it. Its outcome writes the cache again, and that is adopted.
    if (channelOf(studentId).inFlight > 0) return;
    const propNote = member.aiNote ?? '';
    const noteUntouched = (aiNoteForRequest(state.note) ?? '') === state.savedNote;
    if (state.sendingNote === null && noteUntouched && propNote !== state.savedNote) {
      state.note = propNote;
      state.savedNote = propNote;
      setNote(propNote);
    }
    if (state.pending === 0 && state.speed === state.savedSpeed && member.speed !== state.savedSpeed) {
      state.speed = member.speed;
      state.savedSpeed = member.speed;
      setSpeed(member.speed);
    }
  }, [member.aiNote, member.speed, studentId]);

  // The editor is going away with a note the server has not seen: send it without the editor.
  useEffect(
    () => () => {
      const state = live.current;
      const context = handOff.current;
      const next = aiNoteForRequest(state.note) ?? '';
      if (next === (state.sendingNote ?? state.savedNote)) return;
      const profile = { speed: state.speed, aiNote: next === '' ? null : next };
      state.sendingNote = next;
      const channel = channelOf(context.studentId);
      channel.latest += 1;
      const seq = channel.latest;
      // The folded card shows the note at once; a refusal reloads the group and brings the old one back.
      patchMemberProfile(context.queryClient, context.groupId, context.studentId, profile);
      context.send(profile).then(
        (result) => {
          if (seq === channel.latest) {
            patchMemberProfile(context.queryClient, context.groupId, result.studentId, {
              speed: result.speed,
              aiNote: result.aiNote,
            });
          }
          invalidateGroupLists(context.queryClient);
        },
        (failure: unknown) => {
          // A later request (a reopened editor) carries newer values and reports its own outcome.
          if (seq !== channel.latest) return;
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
    const aiNote = aiNoteForRequest(live.current.note);
    live.current.sendingNote = aiNote ?? '';
    submit({ speed: next, aiNote });
  };

  const commitNote = () => {
    const next = aiNoteForRequest(live.current.note) ?? '';
    if (next === (live.current.sendingNote ?? live.current.savedNote)) return;
    live.current.sendingNote = next;
    submit({ speed: live.current.speed, aiNote: next === '' ? null : next });
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
