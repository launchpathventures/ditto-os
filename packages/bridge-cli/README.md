# ditto-bridge

Outbound-dial daemon that lets a cloud-hosted Ditto workspace run commands
on your laptop / Mac mini. **The daemon is a transport, not an agent.** No
LLM code runs on your machine; the daemon only executes commands the cloud
explicitly dispatched, which you pre-approved per trust tier.

> Brief 212 — Workspace Local Bridge.

## Trust boundary

The daemon connects out to a Ditto workspace using a **device JWT** issued
once at pairing. The cloud:

1. Generates a short-lived 6-char **pairing code** (15-minute TTL,
   single-use) and shows it once in the Devices admin page.
2. You paste the code into `ditto-bridge pair <code> <workspace-url>` on
   the device.
3. The daemon exchanges the code for a JWT + persists it locally at
   `~/.ditto/bridge.json` (mode 0600).
4. From then on, the daemon dials out and keeps the WebSocket open;
   reconnects with exponential backoff (capped at 60s).

To **revoke** a device: open the Devices admin page in the workspace and
click Revoke. The cloud closes the WebSocket immediately, marks the
device's status, and any in-flight or queued jobs transition to `revoked`.

## Install

This package ships in the Ditto monorepo. **Local-dev invocation:**

```sh
# Build once
pnpm --filter ditto-bridge build

# Pair (interactive prompts for code + URL)
pnpm --filter ditto-bridge exec ditto-bridge pair

# Or one-shot
pnpm --filter ditto-bridge exec ditto-bridge pair ABC123 https://workspace.example.com

# Start the daemon
pnpm --filter ditto-bridge exec ditto-bridge start
```

For convenience: `pnpm link --global --dir packages/bridge-cli` to expose
the bare `ditto-bridge` command system-wide.

> **Publishing to npm so `npx ditto-bridge` works** is a follow-on
> operations brief (versioning policy + CI publish step + npm package
> ownership). See Brief 212 §Non-Goals.

## Subcommands

```
ditto-bridge pair [code] [url]   Exchange a pairing code for a JWT.
ditto-bridge start                Dial the cloud and stay connected.
ditto-bridge revoke               Clear local state. Use the Workspace UI
                                  to revoke the cloud-side device row.
```

## Run as a managed service

### macOS (launchd)

`~/Library/LaunchAgents/you.ditto.bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>you.ditto.bridge</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/ditto-bridge</string>
      <string>start</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/Users/YOUR_USERNAME/Library/Logs/ditto-bridge/out.log</string>
    <key>StandardErrorPath</key><string>/Users/YOUR_USERNAME/Library/Logs/ditto-bridge/err.log</string>
  </dict>
</plist>
```

Load with `launchctl load ~/Library/LaunchAgents/you.ditto.bridge.plist`.

### Linux (systemd user service)

`~/.config/systemd/user/ditto-bridge.service`:

```ini
[Unit]
Description=Ditto Bridge daemon
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ditto-bridge start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Enable with `systemctl --user enable --now ditto-bridge`.

## Subprocess defaults

| Field | Default |
|---|---|
| Working directory | `cwd` payload field, else `~` |
| Environment | inherits daemon env; payload `env` merged additively |
| Stdin | `/dev/null` (non-interactive) |
| Stdout/stderr cap | 4 MB per stream; truncation marker appended |
| Timeout | 10 minutes (configurable per-job via `timeoutMs`) |
| Termination | SIGTERM on timeout; SIGKILL after 5s |

## tmux requirements

`tmux.send` jobs require `tmux` on `$PATH`. The daemon emits a startup
warning if it isn't installed, and `tmux.send` jobs return a clear error
to the cloud.

The daemon does **not** auto-create tmux sessions — your intended shell,
working directory, and environment are unknowable. Create the session
manually with `tmux new -s <name>` before dispatching to it.

## Caffeinate (macOS)

The daemon does not call `caffeinate(8)`. If you want the machine to stay
awake while the daemon runs, wrap it: `caffeinate -is ditto-bridge start`.

## Known limitations

- **No in-band JWT rotation at MVP.** Rotating a device's JWT today means
  revoking + re-pairing with a fresh code.
- **No live PTY streaming.** The wire is line-buffered stdout/stderr only.
  Live xterm.js view in `/review` is a follow-on brief.
- **No daemon-side LLM.** All LLM decisions happen in the cloud workspace.
- **Windows support is deferred.** macOS 14+ and Ubuntu 22.04 LTS only.
- **Cancel is partially implemented.** The daemon acks `cancel` requests
  but does not currently kill the in-flight subprocess (full cancel
  semantics tracked in a follow-on).
