// Import hygiene of the mock backend: `src/mock` is pure TypeScript (no React, no React Native, no Expo, no
// Node built-ins) so it runs in the app, on the web export and under `tsx --test` alike; and it reads time
// only through the mock clock.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
/// <reference path="../node_modules/@types/node/fs.d.ts" />
/// <reference path="../node_modules/@types/node/path.d.ts" />
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

declare const __dirname: string;

const ROOT = path.resolve(__dirname, "..");
const MOCK = path.join(ROOT, "src", "mock");

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/gms),
    ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
    ...source.matchAll(/\b(?:import|require)\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1] ?? "");
}

const relative = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

/** Without comments, so that documentation may mention the forbidden calls. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The React-free entry points of the other layers. `@/api` and `@/i18n` (the barrels) load React.
const ALLOWED = [/^@\/api\/(client|errors|types)$/, /^@\/domain\/[a-z-]+$/, /^@\/i18n\/(get-dictionary|mobile)$/, /^@\/lib\/i18n(\/[a-z-]+)?$/, /^@\/navigation\/(registry|targets)$/];

describe("mock backend: purity", () => {
  const files = listSources(MOCK);

  it("imports only itself and the React-free modules of the contract, domain and i18n layers", () => {
    assert.ok(files.length > 30);
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        if (specifier.startsWith(".")) {
          const target = path.resolve(path.dirname(file), specifier);
          if (!target.startsWith(MOCK)) offenders.push(`${relative(file)} → ${specifier} (leaves src/mock)`);
        } else if (!ALLOWED.some((pattern) => pattern.test(specifier))) {
          offenders.push(`${relative(file)} → ${specifier}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("reads the time only through the mock clock and uses no randomness outside the session token", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const name = relative(file);
      const source = code(readFileSync(file, "utf8"));
      if (name !== "src/mock/clock/index.ts" && /\bDate\.now\s*\(|new Date\(\s*\)|(?<![.\w])setTimeout\s*\(|(?<![.\w])setInterval\s*\(/.test(source)) {
        // The persistence debounce is the one real timer: it only delays a save, never a state change.
        if (name !== "src/mock/store/persistence.ts") offenders.push(`${name}: device clock or timer`);
      }
      if (name !== "src/mock/rules/auth.ts" && /\bMath\.random\s*\(/.test(source)) offenders.push(`${name}: Math.random`);
    }
    assert.deepEqual(offenders, []);
  });
});
