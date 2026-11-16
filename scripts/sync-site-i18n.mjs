#!/usr/bin/env node
// Re-copies the web site's dictionaries and i18n helpers VERBATIM into `src/lib/i18n/`.
//
//   node scripts/sync-site-i18n.mjs <path-to-site-repo>            copy
//   node scripts/sync-site-i18n.mjs <path-to-site-repo> --check    exit 1 if the copy is stale (writes nothing)
//
// The copied files keep the site's relative layout, so the `@/lib/i18n/...` imports inside them resolve
// through the app alias `@/*` → `src/*` without a single edit. They are never hand-edited (and are excluded
// from lint): mobile-only strings live in `src/i18n/mobile/<area>.ts`.
//
// The site repository is only read. Site modules that need Next.js (`server.ts`) or that the app
// re-implements (`get-dictionary.ts` → `src/i18n/get-dictionary.ts`) are deliberately not copied.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_I18N_DIR = "lib/i18n";
const DICTIONARIES_DIR = "dictionaries";
/** Top-level helper modules of `lib/i18n` that are pure (no Next.js, no Node APIs). */
const HELPER_FILES = ["dictionary.ts", "format.ts", "locale.ts", "index.ts"];
/** Never copied: Next-specific or replaced by an app module. */
const EXCLUDED_FILES = new Set(["server.ts", "get-dictionary.ts"]);

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = join(appRoot, "src", SITE_I18N_DIR);

function fail(message) {
  console.error(`sync-site-i18n: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const siteArg = args.find((arg) => !arg.startsWith("--"));

if (!siteArg) {
  fail("usage: node scripts/sync-site-i18n.mjs <path-to-site-repo> [--check]");
}

const siteRoot = resolve(siteArg);
const sourceRoot = join(siteRoot, SITE_I18N_DIR);

if (!existsSync(join(sourceRoot, DICTIONARIES_DIR))) {
  fail(`"${sourceRoot}" has no ${DICTIONARIES_DIR}/ folder — is "${siteRoot}" the site repository?`);
}

if (resolve(siteRoot) === resolve(appRoot)) {
  fail("the site repository path points at this repository");
}

/** Relative paths (posix) of every file to copy. */
function listSourceFiles() {
  const dictionaries = readdirSync(join(sourceRoot, DICTIONARIES_DIR))
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => `${DICTIONARIES_DIR}/${name}`);

  if (dictionaries.length === 0) {
    fail(`no dictionaries found in "${join(sourceRoot, DICTIONARIES_DIR)}"`);
  }

  for (const name of HELPER_FILES) {
    if (!existsSync(join(sourceRoot, name))) {
      fail(`expected helper "${SITE_I18N_DIR}/${name}" is missing in the site repository`);
    }
  }

  return [...dictionaries, ...HELPER_FILES];
}

/**
 * The copy must stay self-contained and platform-neutral: every import has to point back into `lib/i18n`
 * (at a file that is copied too). Anything else — `next/*`, `react`, another `lib/` module — means the site
 * changed shape and a human has to decide how to port it; the script stops instead of copying a broken tree.
 */
function assertSelfContained(files, contents) {
  const copied = new Set(files.map((file) => file.replace(/\.ts$/, "")));
  const problems = [];

  for (const file of files) {
    const source = contents.get(file);
    const specifiers = [
      ...source.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/gms),
      ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
      ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      const inside = specifier.startsWith("@/lib/i18n/")
        ? specifier.slice("@/lib/i18n/".length)
        : specifier === "@/lib/i18n"
          ? "index"
          : null;

      if (inside === null) {
        problems.push(`${file}: imports "${specifier}" (outside ${SITE_I18N_DIR})`);
      } else if (EXCLUDED_FILES.has(`${inside}.ts`)) {
        problems.push(`${file}: imports "${specifier}", which is not copied (Next-specific / re-implemented)`);
      } else if (!copied.has(inside)) {
        problems.push(`${file}: imports "${specifier}", which is not in the copy list`);
      }
    }
  }

  if (problems.length > 0) {
    fail(
      `the site's i18n modules are no longer self-contained:\n  ${problems.join("\n  ")}\n` +
        "Copy the pure dependency under src/lib/ (same relative path) or write a shim, then extend this script."
    );
  }
}

function listTargetFiles(dir = targetRoot) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);

    return entry.isDirectory() ? listTargetFiles(full) : [relative(targetRoot, full).split("\\").join("/")];
  });
}

const files = listSourceFiles();
const contents = new Map(files.map((file) => [file, readFileSync(join(sourceRoot, file), "utf8")]));

assertSelfContained(files, contents);

const existing = listTargetFiles();
const stale = existing.filter((file) => !contents.has(file));
const changed = files.filter((file) => {
  const target = join(targetRoot, file);

  return !existsSync(target) || readFileSync(target, "utf8") !== contents.get(file);
});

if (checkOnly) {
  if (changed.length === 0 && stale.length === 0) {
    console.log(`sync-site-i18n: src/${SITE_I18N_DIR} is up to date (${files.length} files).`);
    process.exit(0);
  }

  for (const file of changed) console.error(`  differs: src/${SITE_I18N_DIR}/${file}`);
  for (const file of stale) console.error(`  not on the site any more: src/${SITE_I18N_DIR}/${file}`);
  fail(`src/${SITE_I18N_DIR} is out of date — run: node scripts/sync-site-i18n.mjs ${siteArg}`);
}

for (const file of stale) {
  rmSync(join(targetRoot, file));
}

for (const file of files) {
  const target = join(targetRoot, file);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents.get(file));
}

const digest = createHash("sha256");

for (const file of files) {
  digest.update(file).update("\0").update(contents.get(file)).update("\0");
}

console.log(
  `sync-site-i18n: copied ${files.length} files into src/${SITE_I18N_DIR} ` +
    `(${changed.length} changed, ${stale.length} removed), sha256 ${digest.digest("hex").slice(0, 12)}.`
);
