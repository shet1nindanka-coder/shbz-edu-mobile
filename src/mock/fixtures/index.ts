/**
 * The ONE mock dataset (docs/spec/09-data-i18n-math.md §2 as extended by 90-addendum-6 §6 – §8):
 * `buildFixtures(t0)` returns a complete store snapshot whose every timestamp is an offset from `t0`.
 *
 * Order matters: lessons first (their results are mirrored onto the statuses chronologically), then the
 * pinned progress rows, then the homeworks (whose deadlines are mirrored onto the status rows at the end).
 */
import { defaultMockControls } from "../controls";
import { MOCK_STORE_VERSION, type MockSnapshot } from "../store/schema";
import { FixtureBuilder } from "./builder";
import { addCalls } from "./calls";
import { addContent } from "./content";
import { addDrafts } from "./drafts";
import { addHomeworks } from "./homeworks";
import { addJournal, defaultSiteSettings } from "./journal";
import { addLessons } from "./lessons";
import { addNotifications } from "./notifications";
import { addPeople } from "./people";
import { addProgress } from "./progress";

/**
 * Bump whenever the fixture rows change: a dataset stored on a device by an older build is then replaced
 * at the next start instead of living on until the 24-hour re-seed.
 */
export const FIXTURES_REVISION = 2;

export type BuildFixturesOptions = {
  /** `store.meta.generation` of the new dataset (the previous one + 1 on a reset). */
  generation?: number;
  /** Default latency of a fresh dataset (tests pass `{ minMs: 0, maxMs: 0 }`). */
  latency?: { minMs: number; maxMs: number };
  /** Whether the automatic 24-hour re-seed stays enabled. */
  autoReseed?: boolean;
};

/** Builds the freshly seeded dataset anchored at `t0` (epoch ms). Pure and deterministic. */
export function buildFixtures(t0: number, options: BuildFixturesOptions = {}): MockSnapshot {
  const b = new FixtureBuilder(t0);

  addPeople(b);
  addContent(b);
  addLessons(b);
  addProgress(b);
  addHomeworks(b);
  addDrafts(b);
  addCalls(b);
  addNotifications(b);
  addJournal(b);
  b.finishStatuses();

  return {
    meta: {
      version: MOCK_STORE_VERSION,
      t0,
      fixtures: FIXTURES_REVISION,
      generation: options.generation ?? 1,
      idCounter: 0,
      autoReseed: options.autoReseed ?? true,
    },
    settings: defaultSiteSettings(),
    controls: defaultMockControls(options.latency),
    tables: b.tables,
  };
}

export { FixtureBuilder, PHOTO_ASSETS } from "./builder";
export { DEMO_PASSWORDS, GROUP, TOPIC, USER, numberId, userKey } from "./ids";
export { defaultSiteSettings } from "./journal";
export { PLAN_ERROR_LEGACY_EMPTY } from "./lessons";
export { DEMO_PERSONAS } from "./personas";
export type { DemoPersona } from "./personas";
export { MOCK_COVERAGE } from "./coverage";
export type { MockCoverageRow, MockStateKind } from "./coverage";
