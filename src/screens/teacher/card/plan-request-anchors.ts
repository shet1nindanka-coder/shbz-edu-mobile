// Device-time anchors of the accepted "Retry" requests, as the student card sees them. The shared memory in
// `@/components/lessons` keeps the server's `planRequestedAt` (the lesson board compares it with its
// server-corrected clock); the card has no server clock of its own (`listStudentLessons` carries no
// `serverNow`), so it keeps the same moments on the device clock here. Module-level like that memory: it
// survives leaving and re-opening the card for as long as the app runs.
import { planRequestDeviceAnchor, type PlanRequestAnchor } from './lessons-logic';

const anchors = new Map<string, PlanRequestAnchor>();

/** A Retry accepted on the card: `deviceMs` is the device time at which the response arrived. */
export function noteCardPlanRequest(participantId: string, raw: string, deviceMs: number): void {
  anchors.set(participantId, { raw, deviceMs });
}

/**
 * Device time of the latest accepted Retry of a participant (`raw` = `planRequestedAtOf(participantId)`),
 * converted once per request; see `planRequestDeviceAnchor`.
 */
export function cardPlanRequestMs(participantId: string, raw: string | null, serverOffsetMs: number | null, observedAt: number): number | undefined {
  const anchor = planRequestDeviceAnchor(anchors.get(participantId), raw, serverOffsetMs, observedAt);
  if (anchor) anchors.set(participantId, anchor);
  else anchors.delete(participantId);
  return anchor?.deviceMs;
}
