/**
 * Seed projects — pure function returning the two boot-time rows.
 *
 * Brief 215 §"What Changes" / file `projects/seed-data.ts`. NO DB writes;
 * pure function. seed-on-boot.ts handles persistence and idempotence.
 *
 * The github_repo owner is read from env (`SEED_GITHUB_OWNER`) so the seed
 * remains workspace-friendly without hardcoding a username.
 */

import type {
  RunnerKindValue,
  HarnessTypeValue,
  BriefSourceValue,
  DeployTargetValue,
  ProjectStatusValue,
} from "../../db/schema";

export interface SeedProject {
  slug: string;
  name: string;
  githubRepo: string;
  defaultBranch: string;
  harnessType: HarnessTypeValue;
  briefSource: BriefSourceValue | null;
  briefPath: string | null;
  defaultRunnerKind: RunnerKindValue | null;
  fallbackRunnerKind: RunnerKindValue | null;
  runnerChain: RunnerKindValue[] | null;
  deployTarget: DeployTargetValue | null;
  status: ProjectStatusValue;
}

export function getSeedProjects(opts: { githubOwner?: string } = {}): SeedProject[] {
  const owner =
    opts.githubOwner ??
    process.env.SEED_GITHUB_OWNER ??
    "launchpathventures";

  return [
    {
      slug: "agent-crm",
      name: "Agent CRM",
      githubRepo: `${owner}/agent-crm`,
      defaultBranch: "main",
      harnessType: "catalyst",
      briefSource: "filesystem",
      briefPath: "docs/briefs",
      defaultRunnerKind: "claude-code-routine",
      fallbackRunnerKind: "local-mac-mini",
      runnerChain: null,
      deployTarget: "vercel",
      status: "active",
    },
    {
      slug: "ditto",
      name: "Ditto",
      githubRepo: `${owner}/ditto`,
      defaultBranch: "main",
      harnessType: "native",
      briefSource: "ditto_native",
      briefPath: null,
      defaultRunnerKind: "local-mac-mini",
      fallbackRunnerKind: null,
      runnerChain: null,
      deployTarget: "manual",
      status: "active",
    },
  ];
}
