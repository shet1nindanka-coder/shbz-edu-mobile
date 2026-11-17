// Lesson pieces shared by the planner boards and the «Занятия» tab of the student card: the printable
// handout (`useHandout()` + `<HandoutNotice />`) and the "plan requested at" anchors of a regeneration.
export { handoutFileId, handoutFileName, handoutMimeType, type HandoutVariant } from './handout-file';
export { HandoutNotice } from './handout-notice';
export { notePlanRequested, planRequestedAtOf } from './plan-anchors';
export { useHandout, type Handout, type HandoutFailure, type HandoutRequest } from './use-handout';
