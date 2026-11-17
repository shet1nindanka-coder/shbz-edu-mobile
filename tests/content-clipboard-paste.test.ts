// Reading the import JSON from the clipboard: an iOS paste refusal is told apart from an empty clipboard.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readClipboardText, type ClipboardReader } from "../src/screens/content/shared/clipboard-paste";

function clipboard(read: string | Error, hasText: boolean | Error): ClipboardReader & { hasCalls: number } {
  const fake = {
    hasCalls: 0,
    getStringAsync: () => (read instanceof Error ? Promise.reject(read) : Promise.resolve(read)),
    hasStringAsync: () => {
      fake.hasCalls += 1;
      return hasText instanceof Error ? Promise.reject(hasText) : Promise.resolve(hasText);
    },
  };
  return fake;
}

describe("readClipboardText", () => {
  it("returns the text when there is some", async () => {
    const board = clipboard('{"topics":[]}', true);
    assert.deepEqual(await readClipboardText("ios", board), { kind: "text", text: '{"topics":[]}' });
    assert.equal(board.hasCalls, 0, "no second call when the read worked");
  });

  it("iOS: an empty read while the clipboard holds text is a refused paste prompt", async () => {
    assert.deepEqual(await readClipboardText("ios", clipboard("", true)), { kind: "refused" });
  });

  it("iOS: an empty clipboard stays empty", async () => {
    assert.deepEqual(await readClipboardText("ios", clipboard("  ", false)), { kind: "empty" });
    assert.deepEqual(await readClipboardText("ios", clipboard("", new Error("x"))), { kind: "empty" });
  });

  it("iOS: a whitespace-only clipboard is empty, not a refused paste (the read worked)", async () => {
    const board = clipboard(" \n\t", true);
    assert.deepEqual(await readClipboardText("ios", board), { kind: "empty" });
    assert.equal(board.hasCalls, 0, "whitespace came from the clipboard: no refusal to detect");
  });

  it("other platforms: an empty read is an empty clipboard, a rejection is a denied access", async () => {
    const board = clipboard("", true);
    assert.deepEqual(await readClipboardText("android", board), { kind: "empty" });
    assert.equal(board.hasCalls, 0);
    assert.deepEqual(await readClipboardText("web", clipboard(new Error("NotAllowedError"), true)), { kind: "failed" });
    assert.deepEqual(await readClipboardText("ios", clipboard(new Error("boom"), true)), { kind: "failed" });
  });
});
