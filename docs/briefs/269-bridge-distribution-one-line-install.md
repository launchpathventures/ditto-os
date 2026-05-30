# Brief 269: Bridge Distribution — One-Line Install + Self-Contained Binaries + Hosted Installer

**Date:** 2026-05-13
**Status:** draft
**Depends on:**
- Brief 212 (complete) — `ditto-bridge` daemon source, pair flow, JWT issuance, WebSocket dispatch. This brief packages and distributes that artifact; it does not change the daemon's protocol.

**Unlocks:**
- Brief 268 (draft) — managed-workspace first-run onboarding. The "use your own LLM" path in onboarding hands the user a single curl|sh command; that command is what this brief defines and ships. Without 269, 268's bridge path is functionally broken for any user who is not already a Ditto monorepo developer.
- Future: per-deployment customization (white-label workspaces shipping a branded bridge installer), bridge auto-update.

## Goal

- **Roadmap phase:** Phase 16 — Productization / Managed Workspace UX (distribution layer)
- **Capabilities:** Make the ditto-bridge daemon installable on a fresh, brand-new user's macOS or Linux machine with a single terminal command — no Node prerequisite, no monorepo clone, no pnpm, no "build from source." Specifically:

  1. **One-line install + pair.** A user who picks the "bring your own LLM" path in onboarding (Brief 268) is given a single command:

     ```sh
     curl -fsSL https://ditto.partners/install | DITTO_PAIR=ABC123 DITTO_WS=https://workspace.example.com sh
     ```

     They copy, paste, hit enter. The script: detects OS + arch, downloads the right self-contained binary, places it on `$PATH`, runs `ditto-bridge pair <code> <url>` with the env-var-injected pair code, starts the daemon. The workspace's polling endpoint sees the daemon connect and progresses the onboarding state machine. Total time from copy to paired: under 60 seconds on a typical broadband connection.

  2. **Self-contained binaries.** Ship platform binaries that bundle the Node runtime so the user doesn't need Node installed. Targets:
     - macOS x64 (Intel)
     - macOS arm64 (Apple Silicon)
     - Linux x64 (glibc, covers Ubuntu 22.04+, Debian 12+, Fedora 39+)
     - Linux arm64 (covers Raspberry Pi 5, AWS Graviton, etc.)
     - **Windows is out of scope** — matches the bridge daemon's existing platform support (README.md "Windows support is deferred").

  3. **Hosted installer endpoint at `https://ditto.partners/install`.** A static shell script served from the Network deployment. The script is small (under 200 lines), auditable (no obfuscation, no telemetry, comments explain every step), and resilient (works with no `DITTO_PAIR` set — just installs the daemon; works with both `bash` and `zsh`; survives spaces in paths; falls back to `~/.local/bin` if `/usr/local/bin` isn't writable).

  4. **Versioning + CI publish step.** Tagged release in the monorepo triggers a CI workflow that builds all four binaries, uploads them to a versioned location (e.g. `https://ditto.partners/install/bridge/v0.2.0/macos-arm64`), updates the `latest` pointer, and re-publishes the install script. Reproducibility: users can pin with `DITTO_BRIDGE_VERSION=0.2.0` if they want.

The bar is **"a non-developer can paste one line and be paired in a minute."** Anything that fails this bar (needing Node first, needing Homebrew, needing sudo to install, needing a second `pair` command after install) is a defect.

## Context

Three forcing functions:

1. **Brief 268 promises a UX that 212 doesn't yet enable.** Brief 268's "use your own LLM" path renders a pair command and polls for the daemon to come up. But the bridge daemon today is only installable by Ditto developers (clone monorepo → `pnpm install` → `pnpm --filter ditto-bridge build` → `pnpm link --global`). For an external user, the bridge path in onboarding is broken on arrival. 269 is the contract that 268 depends on.

2. **The "BYO LLM" segment is a first-class positioning move.** The metered path is friction-free but reveals Ditto's cost-of-goods and exposes us to runaway usage. The bridge path is the segment that says "you already pay Anthropic — keep using your subscription, we add value on top." That segment cannot exist if installing the bridge takes more than one command. The first 30 seconds of the bridge path decides whether this segment is reachable at scale.

3. **Self-contained binaries are the only honest "no prerequisites" path.** Every alternative leaks complexity onto the user:
   - `npm i -g ditto-bridge` requires Node, which non-developers may not have.
   - `brew install ditto-bridge` requires Homebrew, which Linux users don't have and many Mac users don't have either.
   - "Install Node, then run npm install" — that's a two-step prerequisite ladder, not one line.
   - A curl|sh script that itself installs Node is two installs deep — fragile and slow.

   The standard set by Bun, Deno, Ollama, Rust's rustup, and many others: a single curl|sh that drops a self-contained binary on `$PATH` is the well-understood pattern. We adopt it.

## Design — what ships

### Artifact A — Self-contained binaries

Built via `bun build --compile` (or `pkg`, or `caxa` — Builder picks during scout) targeting four platform/arch combinations. Each binary:

- Embeds the Node runtime (or Bun runtime) and all `dependencies` from `packages/bridge-cli/package.json`.
- Single file, statically linked where possible. macOS targets are signed (Developer ID) to avoid Gatekeeper warnings — see Constraint 4 below for the v1 stance on signing.
- Size budget: under 70 MB per binary. Larger if signing/notarization forces it, but flag in review.
- Same surface as the existing CLI: `ditto-bridge pair`, `ditto-bridge start`, `ditto-bridge revoke`.

Built artifacts are uploaded to durable, versioned URLs:

```
https://ditto.partners/install/bridge/v0.2.0/macos-arm64
https://ditto.partners/install/bridge/v0.2.0/macos-x64
https://ditto.partners/install/bridge/v0.2.0/linux-x64
https://ditto.partners/install/bridge/v0.2.0/linux-arm64
```

`latest` is a symlink (or 302 redirect) to the most recent stable version:

```
https://ditto.partners/install/bridge/latest/macos-arm64
```

Each artifact has an adjacent `.sha256` file. The install script verifies the checksum before placing the binary.

### Artifact B — The install script

Served at `https://ditto.partners/install` (Content-Type: `text/x-shellscript`). Single shell script, POSIX-sh compatible (no bash-isms in the install path, since we can't assume bash). Behavior:

```sh
#!/bin/sh
set -eu

# 1. Detect OS + arch
#    OS: uname -s → Darwin | Linux | * (refuse)
#    ARCH: uname -m → arm64/aarch64 → arm64 | x86_64 → x64 | * (refuse)
#    Refusal copy: clear, names the segment, points to ditto.partners/install/manual

# 2. Resolve version
#    DITTO_BRIDGE_VERSION env var if set, else "latest"

# 3. Choose install location
#    Prefer /usr/local/bin if writable (no sudo escalation)
#    Else $HOME/.local/bin (creating if needed, adding to PATH instructions)
#    Else $HOME/bin
#    Print where we're putting it; let the user override with DITTO_INSTALL_DIR

# 4. Download binary + checksum
#    curl -fsSL --retry 3 → tmp file
#    sha256 verify
#    chmod +x
#    mv to install location

# 5. (Optional) PATH setup
#    If install dir isn't on $PATH, write a one-liner export to ~/.zshrc or ~/.bashrc
#    Print instructions either way

# 6. Auto-pair if DITTO_PAIR and DITTO_WS are set
#    Run: ditto-bridge pair "$DITTO_PAIR" "$DITTO_WS"
#    On success: print "Paired. Starting daemon..."
#    Run: ditto-bridge start &  (or print start instructions; see Open Question 2)

# 7. (Optional) Auto-start service install
#    Only if DITTO_INSTALL_SERVICE=1
#    macOS: write launchd plist (per existing README)
#    Linux: write systemd user unit (per existing README)
```

The script is **dry-run-able** with `DITTO_DRY_RUN=1` — prints what it would do without doing it. Useful for cautious users and CI.

### Artifact C — Static manual-install page

At `https://ditto.partners/install/manual`. For:
- Users who refuse to `curl|sh` (legitimate stance).
- Users on platforms the script doesn't support (Windows, NetBSD, etc.).
- Auditors who want to see what the script does before running it.

Contents: copy of the script with syntax highlighting, links to all four versioned binaries, the SHA256s, and step-by-step manual instructions.

### Artifact D — CI release pipeline

GitHub Actions workflow on push of a `bridge-cli-v*` tag:

1. Build all four binaries on appropriate runners (`macos-latest` for Darwin, `ubuntu-latest` for Linux; arm64 may need cross-compile or QEMU).
2. Sign macOS binaries with Developer ID (if cert is in CI secrets — else flag for manual sign).
3. Generate SHA256s.
4. Upload to ditto.partners hosting (S3? Railway volume? Decided per Open Question 1).
5. Update `latest` pointer.
6. Update `https://ditto.partners/install` script to reference new version.

CI fails loud if any step fails — no silent partial releases.

## Constraints

1. **No sudo by default.** The install script must succeed for a user with no admin privileges. Install location precedence: `/usr/local/bin` (only if already writable, never `sudo`), then `~/.local/bin`, then `~/bin`. Print a clear note about PATH if we land in a non-default location.

2. **No telemetry from the install script.** No "install completed" beacon, no install counter ping, nothing. The script is what the user reads in `curl ... | sh` — it must not phone home. The bridge daemon itself separately reports back to the cloud workspace as part of the normal pair flow (that's expected); the installer does not.

3. **Checksum-verified downloads.** Every binary download is verified against its `.sha256` companion before the script touches `$PATH`. A checksum mismatch aborts with a loud error and leaves the system untouched.

4. **macOS signing — strong default, ship-without-blocking fallback.** v1 ships with Developer ID-signed binaries if the Apple cert is available in CI. If not, v1 ships **unsigned with explicit Gatekeeper bypass instructions** in the install output ("macOS may say the binary is from an unidentified developer — open System Settings > Privacy & Security and click Allow"). Notarization is a v2 hardening. The point is: don't let signing complexity block v1; users on managed Macs can use the metered path instead.

5. **Reproducibility.** A user pinning `DITTO_BRIDGE_VERSION=0.2.0` and re-running the installer in 12 months must get the byte-identical binary, with checksum verifiable against what's documented. Don't delete old versions.

6. **Idempotent re-runs.** Running the installer a second time replaces the binary at the install location. It does NOT touch the existing `~/.ditto/bridge.json` (the device JWT survives reinstalls). It does NOT re-pair if already paired (the user must explicitly `ditto-bridge revoke` first).

7. **Match the bridge daemon's platform stance.** macOS 14+ and Linux x64/arm64 only. Windows is refused with a clear pointer to the metered path (in concert with Brief 268's bridge_install state).

8. **Safe failure modes.** Network blip mid-download → no partial binary on disk. Wrong checksum → no binary on disk. Auto-pair failure → daemon is installed but unpaired; user can manually retry without re-installing.

9. **Auditable.** Script is < 200 lines, commented, with one obvious entry-point. Anyone reading the curl|sh command can `curl https://ditto.partners/install` (without `| sh`) and read every line before deciding to run it.

## Acceptance criteria

- **AC1 — One-line install on macOS arm64.** On a fresh macOS 14+ Apple Silicon machine with no Node, no Homebrew, no Ditto monorepo:

  ```sh
  curl -fsSL https://ditto.partners/install | sh
  ```

  Within 60 seconds, `which ditto-bridge` returns a path on `$PATH` and `ditto-bridge --version` prints the expected version.

- **AC2 — One-line install + pair.** Same fresh machine, with a workspace already running and a pair code in hand:

  ```sh
  curl -fsSL https://ditto.partners/install | DITTO_PAIR=ABC123 DITTO_WS=https://workspace.example.com sh
  ```

  Within 90 seconds, the workspace's `GET /api/v1/onboarding/bridge-status` returns `{ paired: true, deviceId, capabilities }`. The daemon process is running.

- **AC3 — Linux x64 install.** Same as AC1 but on a fresh Ubuntu 22.04 container with only `curl` pre-installed.

- **AC4 — Linux arm64 install.** Same as AC1 but on Raspberry Pi 5 (or AWS Graviton). Verifies arm64 binary builds and runs.

- **AC5 — Checksum verification.** If the script downloads a binary whose SHA256 doesn't match the `.sha256` companion, it aborts with a clear error and leaves no artifact on disk. (Tested by deliberately corrupting the binary in a staging mirror and re-running.)

- **AC6 — Refusal on Windows.** On Windows (Git Bash, WSL, or PowerShell with curl), the script detects the platform and exits with: "ditto-bridge isn't packaged for Windows yet. Use the metered LLM option in your workspace, or follow ditto.partners/install/manual for a developer setup." Exit code: non-zero.

- **AC7 — No-sudo install.** As a user with no admin privileges (`whoami` ≠ `root`, no `sudo` in `$PATH`), the install completes. Binary lands in `~/.local/bin` and PATH instructions are printed.

- **AC8 — Idempotent re-run.** Running the installer twice on the same machine results in: binary updated to latest, `~/.ditto/bridge.json` unchanged (if it existed), no duplicate launchd plists or systemd units. Daemon, if running, is gracefully restarted.

- **AC9 — Pin to version.** `DITTO_BRIDGE_VERSION=0.2.0 curl -fsSL ... | sh` installs the v0.2.0 binary, not the latest. The downloaded URL is the `/v0.2.0/` versioned path.

- **AC10 — Dry run.** `DITTO_DRY_RUN=1 curl -fsSL ... | sh` prints every action ("Would download X", "Would install to Y") and exits with no side effects. No binary on disk, no PATH modifications.

- **AC11 — Reproducibility.** A binary downloaded today and a binary downloaded one week from now from the same versioned URL have byte-identical SHA256s.

- **AC12 — Manual install page.** `https://ditto.partners/install/manual` returns a static page with the script source, all four versioned binary links, their SHA256s, and human-readable install instructions. Loads in under 1 second.

- **AC13 — CI release pipeline.** Pushing a tag `bridge-cli-v0.2.1` to main triggers a workflow that builds all four binaries, uploads them, updates `latest`, and refreshes the install script. End-to-end build + publish completes in under 15 minutes. A failing build halts the release — no partial publishes.

## Open design questions (for the Designer / Architect pass during build)

1. **Hosting.** Three reasonable options for serving binaries:
   - **Railway static volume** — same deployment as the rest of ditto.partners, simplest ops, but binaries on a Railway volume don't get CDN benefits.
   - **S3 + CloudFront** — best CDN profile, requires AWS account + IAM for CI publish, separate billing.
   - **GitHub Releases as origin** — free, durable, but URL shape (`github.com/launchpathventures/.../releases/download/v0.2.0/macos-arm64`) leaks the project structure; we'd want ditto.partners/install/bridge as a 302 redirect layer.

   Builder picks during scout. My lean: GitHub Releases as origin + ditto.partners 302 layer. Free, durable, and the install script URL stays pretty.

2. **Auto-start at end of install.** When auto-pair succeeds, should the install script also background-start the daemon (`ditto-bridge start &`)? Trade-off: cleaner UX vs. less control. My lean: yes, start it, and print a one-liner to install the launchd/systemd service for persistence.

3. **Binary builder.** `bun build --compile`, `pkg`, `caxa`, `vercel/ncc + nexe` — multiple ways to produce self-contained Node binaries. Builder evaluates during scout, picks one, documents the trade-off. Constraint: must produce all four target binaries from a Linux CI runner (with cross-compile or QEMU for arm64 if needed).

4. **Install script hosting / freshness.** The install script at `https://ditto.partners/install` references specific version URLs. When a new release lands, the script must update atomically. Trade-off: serve script from a CDN with cache-busting query strings, vs. serve script from the API server with no caching, vs. ship a "latest" alias. My lean: API server with `Cache-Control: max-age=60` — fresh enough, won't hammer the server.

5. **Telemetry stance.** I called out "no telemetry from the installer" as a constraint. But: do we want to know install success/failure rates? My lean: no — keep the installer clean; gather signal from the bridge's first pair event in the cloud instead (we know pair succeeded, that's the install-success proxy we actually need).

6. **Update strategy.** Should the daemon self-update? Or only update when the user re-runs the installer? My lean: v1 = re-run installer to update; v2 = optional self-update with user consent.

## Out of scope (explicitly deferred)

- **Windows support.** Matches bridge daemon's existing stance.
- **Self-update inside the daemon.** v1 = installer re-run.
- **Apple notarization** (we sign, but don't notarize in v1).
- **Multi-architecture universal binaries on macOS** (we ship separate x64 and arm64; universal is a v2 nice-to-have).
- **Linux musl variants** (Alpine, etc.) — v1 covers glibc, which is the dominant case.
- **Package manager submissions** (Homebrew tap, AUR, apt repo) — these are nice-to-have v2 paths once the curl|sh path is stable.
- **Bridge auto-launch on system boot without explicit user opt-in** — the launchd/systemd installs require an explicit `DITTO_INSTALL_SERVICE=1` flag.

## Inputs (read before implementing)

- `docs/briefs/complete/212-workspace-local-bridge.md` — bridge daemon source, pair flow contract.
- `packages/bridge-cli/README.md` — existing CLI surface, launchd/systemd templates.
- `packages/bridge-cli/package.json` — runtime + dependencies that need to be bundled.
- `docs/briefs/268-managed-workspace-first-run-onboarding.md` — the consumer surface that calls `curl|sh` and polls for the daemon.

## Output

- `packages/bridge-cli/scripts/build-binary.{macos,linux}.sh` — build scripts per platform.
- `.github/workflows/bridge-release.yml` — CI release pipeline.
- `apps/network/install/route.ts` (or wherever ditto.partners serves API routes) — endpoint that returns the install script.
- `apps/network/install/manual/page.tsx` — static manual-install page.
- `apps/network/install/bridge/[version]/[platform]/route.ts` — versioned binary download endpoint (302 to GitHub Releases or S3).
- `docs/distribution/bridge-install.md` — operator-facing doc covering release process, version pinning, rollback.

## Review process

- **Builder smoke test:** spin up fresh VMs / containers for each of the four target platforms, run the one-line install + pair, capture asciinema recordings. The recordings are the proof.
- **Reviewer (fresh context):** challenge against the 12-point checklist plus the constraints above. Specifically verify: (a) no sudo path (AC7); (b) checksum verification works end-to-end (AC5); (c) Windows refusal is clear and unhelpful-to-defeat (AC6); (d) reproducibility holds across rebuilds (AC11).
- **Human approval:** Tim signs off on the install-script source (security-critical — it's executed via curl|sh on user machines) and the hosting choice before the brief is moved to `docs/briefs/complete/`.
