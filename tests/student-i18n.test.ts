// The student's mobile-only strings (`m.student`, `m.studentWork`): every key is used by a student screen,
// no key repeats a text the site dictionary already has (those are read from `dict.*`), and one state has
// one wording across the two files.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
/// <reference path="../node_modules/@types/node/fs.d.ts" />
/// <reference path="../node_modules/@types/node/path.d.ts" />
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { student } from "@/i18n/mobile/student";
import { studentWork } from "@/i18n/mobile/student-work";
import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";

declare const __dirname: string;

const SCREENS = path.resolve(__dirname, "..", "src", "screens", "student");

type Leaf = { path: string; value: string };

/** String leaves; a plural-forms array is one leaf (its forms are used together). */
function collectLeaves(node: unknown, prefix: string): Leaf[] {
  if (typeof node === "string") return [{ path: prefix, value: node }];
  if (Array.isArray(node)) return [{ path: prefix, value: node.join(" | ") }];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => collectLeaves(value, `${prefix}.${key}`));
  }
  return [];
}

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const sources: string[] = listSources(SCREENS).map((file) => readFileSync(file, "utf8"));

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A key is used when a screen file names it in full (`m.student.note.queued`), or takes its section into a
 * local (`const t = m.studentWork.lesson;`) and reads the key from that local (`t.closedOf`).
 */
function isUsed(leafPath: string): boolean {
  const full = new RegExp(`\\b${escapeRegExp(leafPath)}\\b`);
  const dot = leafPath.lastIndexOf(".");
  const section = leafPath.slice(0, dot);
  const key = leafPath.slice(dot + 1);
  const alias = new RegExp(`const (\\w+) = ${escapeRegExp(section)};`);
  return sources.some((source) => {
    if (full.test(source)) return true;
    const local = alias.exec(source)?.[1];
    return local !== undefined && new RegExp(`\\b${local}\\.${key}\\b`).test(source);
  });
}

const areas = { "m.student": student, "m.studentWork": studentWork };

describe("student mobile strings", () => {
  it("has no key that no student screen reads", () => {
    const unused = Object.entries(areas)
      .flatMap(([prefix, pair]) => collectLeaves(pair.ru, prefix))
      .filter((leaf) => !isUsed(leaf.path))
      .map((leaf) => leaf.path);
    assert.deepEqual(unused, []);
  });

  it("does not repeat a text of the site dictionary", () => {
    for (const [locale, site] of [["ru", ru], ["en", en]] as const) {
      const siteTexts = new Set(collectLeaves(site, "dict").map((leaf) => leaf.value));
      const copies = Object.entries(areas)
        .flatMap(([prefix, pair]) => collectLeaves(pair[locale], prefix))
        .filter((leaf) => siteTexts.has(leaf.value))
        .map((leaf) => `${locale} ${leaf.path}: ${leaf.value}`);
      assert.deepEqual(copies, []);
    }
  });

  it("keeps one copy of a string across the two files", () => {
    for (const locale of ["ru", "en"] as const) {
      const leaves = [...collectLeaves(student[locale], "m.student"), ...collectLeaves(studentWork[locale], "m.studentWork")];
      const seen = new Map<string, string>();
      const repeated: string[] = [];
      for (const leaf of leaves) {
        const first = seen.get(leaf.value);
        if (first) repeated.push(`${locale} ${first} = ${leaf.path}`);
        else seen.set(leaf.value, leaf.path);
      }
      assert.deepEqual(repeated, []);
    }
  });

  it("names the 'note waits for the connection' state once", () => {
    assert.equal("note" in studentWork.ru, false);
    assert.equal(typeof student.ru.note.queued, "string");
  });
});
