/**
 * Runner Registry — in-process Map<RunnerKind, RunnerAdapter>.
 *
 * Brief 215 §"What Changes" / file `runner-registry.ts`. The dispatcher looks
 * up adapters here. Sub-briefs 216-218 register their adapters at engine boot.
 *
 * This brief seeds the registry with `bridgeCliAdapter` for `local-mac-mini`
 * — the local arm of the runner abstraction (Brief 212's bridge primitive).
 */

import type { RunnerAdapter, RunnerKind } from "@ditto/core";

const registry = new Map<RunnerKind, RunnerAdapter>();

export function registerAdapter(adapter: RunnerAdapter): void {
  if (registry.has(adapter.kind)) {
    throw new Error(
      `Runner adapter for kind '${adapter.kind}' is already registered.`
    );
  }
  registry.set(adapter.kind, adapter);
}

export function getAdapter(kind: RunnerKind): RunnerAdapter {
  const adapter = registry.get(kind);
  if (!adapter) {
    throw new Error(
      `No runner adapter registered for kind '${kind}'. Register one at engine boot.`
    );
  }
  return adapter;
}

export function hasAdapter(kind: RunnerKind): boolean {
  return registry.has(kind);
}

export function listRegisteredKinds(): RunnerKind[] {
  return Array.from(registry.keys());
}

/** Reset the registry — test-only. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
