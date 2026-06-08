#!/usr/bin/env node
/**
 * Guards against the pdfjs-dist / react-pdf version mismatch that causes
 * "Failed to load PDF document" on the review page.
 *
 * react-pdf bundles a specific pdf.js API version and `PDFViewer.tsx` loads the
 * worker from the standalone `pdfjs-dist` install. If those two versions differ,
 * PDF.js refuses to run. This script fails the build when the `pdfjs-dist`
 * version declared in package.json does not exactly match the version that the
 * installed `react-pdf` depends on.
 *
 * Run via `npm run check:pdfjs` (also wired into CI).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(`\u2717 pdfjs version check failed:\n  ${message}`);
  process.exit(1);
}

const pkg = readJSON(resolve(root, "package.json"));
const declared = (pkg.dependencies && pkg.dependencies["pdfjs-dist"]) || null;

if (!declared) {
  fail('"pdfjs-dist" is not declared in package.json dependencies.');
}

// An exact pin (no ^ or ~) is required so npm cannot resolve a different major
// than react-pdf's bundled API.
if (/^[\^~]/.test(declared)) {
  fail(
    `"pdfjs-dist" must be pinned to an exact version (found "${declared}"). ` +
      "A range lets npm install a copy whose worker mismatches react-pdf's API."
  );
}

let required;
try {
  const reactPdfPkg = readJSON(
    resolve(root, "node_modules", "react-pdf", "package.json")
  );
  required =
    (reactPdfPkg.dependencies && reactPdfPkg.dependencies["pdfjs-dist"]) || null;
} catch {
  // node_modules not installed (e.g. lint-only context); skip the cross-check.
  console.log(
    `\u26a0 react-pdf not installed; skipped cross-check. Declared pdfjs-dist=${declared}.`
  );
  process.exit(0);
}

if (!required) {
  fail("Could not read react-pdf's required pdfjs-dist version from node_modules.");
}

if (declared !== required) {
  fail(
    `package.json pins pdfjs-dist@${declared} but react-pdf requires ` +
      `pdfjs-dist@${required}. Update package.json to "${required}" so the ` +
      "self-hosted worker matches react-pdf's pdf.js API version."
  );
}

console.log(
  `\u2713 pdfjs-dist@${declared} matches react-pdf's required pdfjs-dist@${required}.`
);
