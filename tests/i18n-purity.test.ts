// Import hygiene of the pure layers. `src/domain` and the non-React i18n modules are imported by the mock
// API and by unit tests that run in plain Node, so they must not pull React, React Native, Expo or any
// other app layer; and the verbatim site copy must stay self-contained.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
/// <reference path="../node_modules/@types/node/fs.d.ts" />
/// <reference path="../node_modules/@types/node/path.d.ts" />
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

declare const __dirname: string;

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = path.join(dir, name);

    if (statSync(full).isDirectory()) {
      return listSources(full);
    }

    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Module specifiers of every import / re-export in a file (type-only ones included). */
function importSpecifiers(file: string): string[] {
  const source: string = readFileSync(file, "utf8");

  return [
    ...source.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/gms),
    ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
    ...source.matchAll(/\b(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)
  ].map((match) => match[1] ?? "");
}

/** Absolute path a specifier resolves to inside `src`, or null for a package. */
function resolveInSrc(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;

  if (!base) {
    return null;
  }

  return [".ts", ".tsx", "/index.ts", "/index.tsx"].map((ext) => base + ext).find((candidate) => existsSync(candidate)) ?? base;
}

function relative(file: string) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function isInside(file: string, dir: string) {
  return file === dir || file.startsWith(dir + path.sep);
}

const DOMAIN_DIR = path.join(SRC, "domain");
const SITE_I18N_DIR = path.join(SRC, "lib", "i18n");
const APP_I18N_DIR = path.join(SRC, "i18n");
/** The only React module of the i18n layer (and the barrel that re-exports it). */
const REACT_I18N_FILES = new Set([path.join(APP_I18N_DIR, "i18n-provider.tsx"), path.join(APP_I18N_DIR, "index.ts")]);

describe("pure layers import nothing they must not", () => {
  it("src/domain: no packages at all, only itself and the pure i18n modules", () => {
    const files = listSources(DOMAIN_DIR);
    const problems: string[] = [];

    assert.ok(files.length > 40, `domain files found: ${files.length}`);

    for (const file of files) {
      assert.match(path.basename(file), /^[a-z0-9-]+\.ts$/, `${relative(file)}: kebab-case .ts only (no JSX in the domain)`);

      for (const specifier of importSpecifiers(file)) {
        const resolved = resolveInSrc(specifier, file);

        if (resolved === null) {
          problems.push(`${relative(file)} imports the package "${specifier}"`);
          continue;
        }

        const allowed =
          isInside(resolved, DOMAIN_DIR) ||
          isInside(resolved, SITE_I18N_DIR) ||
          (isInside(resolved, APP_I18N_DIR) && !REACT_I18N_FILES.has(resolved));

        if (!allowed) {
          problems.push(`${relative(file)} imports "${specifier}" (outside the pure layers)`);
        }
      }
    }

    assert.deepEqual(problems, []);
  });

  it("src/lib/i18n (verbatim site copy): self-contained", () => {
    const files = listSources(SITE_I18N_DIR);
    const problems: string[] = [];

    assert.ok(files.length >= 14, `copied files found: ${files.length}`);

    for (const file of files) {
      for (const specifier of importSpecifiers(file)) {
        const resolved = resolveInSrc(specifier, file);

        if (resolved === null || !isInside(resolved, SITE_I18N_DIR) || !existsSync(resolved)) {
          problems.push(`${relative(file)} imports "${specifier}"`);
        }
      }
    }

    assert.deepEqual(problems, []);
    // Next-specific / re-implemented site modules are never copied.
    assert.equal(existsSync(path.join(SITE_I18N_DIR, "server.ts")), false);
    assert.equal(existsSync(path.join(SITE_I18N_DIR, "get-dictionary.ts")), false);
  });

  it("src/i18n: only the provider (and the barrel) touch React", () => {
    const problems: string[] = [];

    for (const file of listSources(APP_I18N_DIR)) {
      if (REACT_I18N_FILES.has(file)) {
        continue;
      }

      for (const specifier of importSpecifiers(file)) {
        const resolved = resolveInSrc(specifier, file);

        if (resolved === null) {
          problems.push(`${relative(file)} imports the package "${specifier}"`);
        } else if (REACT_I18N_FILES.has(resolved) || !(isInside(resolved, APP_I18N_DIR) || isInside(resolved, SITE_I18N_DIR))) {
          problems.push(`${relative(file)} imports "${specifier}"`);
        }
      }
    }

    assert.deepEqual(problems, []);
  });

  it("the provider imports React only (no React Native, no Expo) so it renders on every platform", () => {
    const provider = path.join(APP_I18N_DIR, "i18n-provider.tsx");
    const packages = importSpecifiers(provider).filter((specifier) => resolveInSrc(specifier, provider) === null);

    assert.deepEqual(packages, ["react"]);
  });

  it("no hard-coded colours in src/domain", () => {
    const offenders = listSources(DOMAIN_DIR).filter((file) => {
      const source: string = readFileSync(file, "utf8");

      // The print / WebView line-break script and LaTeX helpers never contain colours either.
      return /#[0-9a-fA-F]{6}\b|\brgba?\(/.test(source);
    });

    assert.deepEqual(offenders.map(relative), []);
  });
});
