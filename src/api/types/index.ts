/**
 * Canonical type catalogue of the app (docs/spec/00-unified-contract.md §1).
 * Feature folders import from `@/api/types` (or `@/api`) and never re-declare these shapes.
 *
 * Files by owner: primitives (§1.1) · entities (§1.2) · shared (§1.3) · shell (§1.4.1, owner 01) ·
 * student-study (§1.4.2, 02) · student-homework-lesson (§1.4.3, 03) · teacher-students (§1.4.4, 04) ·
 * developer-accounts (§1.4.5, 04 S9) · planner (§1.4.6, 05) · groups-calls-stats (§1.4.7, 06) ·
 * content (§1.4.8, 07) · developer (§1.4.9, 07) · limits (§2.14, 09 §1.7).
 */
export * from "./primitives";
export * from "./entities";
export * from "./shared";
export * from "./shell";
export * from "./student-study";
export * from "./student-homework-lesson";
export * from "./teacher-students";
export * from "./developer-accounts";
export * from "./planner";
export * from "./groups-calls-stats";
export * from "./content";
export * from "./developer";
export * from "./limits";
