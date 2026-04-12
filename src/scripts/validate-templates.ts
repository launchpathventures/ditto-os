/**
 * Validate all process templates load without errors.
 * Usage: pnpm ditto:sync
 *
 * Provenance: Brief 130 — smoke test for template validation
 */

import path from "path";
import { loadAllProcesses, flattenSteps, validateDependencies, validateSubProcessSteps } from "../engine/process-loader.js";

const processDir = path.join(process.cwd(), "processes");
const templateDir = path.join(process.cwd(), "processes", "templates");
const cycleDir = path.join(process.cwd(), "processes", "cycles");

console.log("Loading all process definitions...\n");

const all = loadAllProcesses(processDir, templateDir, cycleDir);
const allSlugs = new Set(all.map((d) => d.id));
let errorCount = 0;

for (const def of all) {
  const steps = flattenSteps(def);
  const depErrors = validateDependencies(def);
  const subErrors = validateSubProcessSteps(def, allSlugs);
  const errors = [...depErrors, ...subErrors];

  if (errors.length > 0) {
    console.error(`FAIL  ${def.id} (${def.name})`);
    for (const e of errors) {
      console.error(`      ${e}`);
    }
    errorCount += errors.length;
  } else {
    console.log(`  OK  ${def.id} — ${steps.length} steps`);
  }
}

console.log(`\nLoaded ${all.length} definitions. ${errorCount === 0 ? "All valid." : `${errorCount} errors found.`}`);

if (errorCount > 0) {
  process.exit(1);
}
