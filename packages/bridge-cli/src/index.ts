#!/usr/bin/env node
/**
 * ditto-bridge — CLI entrypoint. Subcommands:
 *   pair <code> <workspace-url>   Exchange a pairing code for a JWT.
 *   start                         Dial the cloud and stay connected.
 *   revoke                        Clear local state (cloud-side revoke is via UI).
 *
 * Brief 212. The daemon is a transport, not an agent.
 */
import { defineCommand, runMain } from "citty";
import * as p from "@clack/prompts";
import os from "os";
import { readState, writeState, clearState } from "./state.js";
import { startDaemon } from "./daemon.js";

const pair = defineCommand({
  meta: {
    name: "pair",
    description:
      "Exchange a 6-char pairing code for a JWT and persist it at ~/.ditto/bridge.json (mode 0600).",
  },
  args: {
    code: { type: "positional", description: "6-char pairing code from the workspace UI", required: false },
    url: { type: "positional", description: "Workspace URL (e.g. https://ditto.you/<slug>)", required: false },
    deviceName: { type: "string", description: "Device name (defaults to hostname)" },
  },
  async run({ args }) {
    let code = args.code as string | undefined;
    let url = args.url as string | undefined;
    if (!code) {
      const ans = await p.text({ message: "Pairing code (6 chars):" });
      if (typeof ans === "string") code = ans;
    }
    if (!url) {
      const ans = await p.text({ message: "Workspace URL (e.g. https://workspace.example.com):" });
      if (typeof ans === "string") url = ans;
    }
    if (!code || !url) {
      console.error("ditto-bridge pair: code and URL are required");
      process.exit(1);
    }
    const deviceName = (args.deviceName as string | undefined) ?? os.hostname();

    // POST to /api/v1/bridge/pair.
    const pairUrl = url.replace(/\/$/, "") + "/api/v1/bridge/pair";
    const resp = await fetch(pairUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceName }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`ditto-bridge pair: HTTP ${resp.status} from ${pairUrl}\n${text}`);
      process.exit(1);
    }
    const body = (await resp.json()) as {
      deviceId: string;
      jwt: string;
      dialUrl: string;
      protocolVersion: string;
    };

    await writeState({
      deviceId: body.deviceId,
      jwt: body.jwt,
      dialUrl: body.dialUrl,
      protocolVersion: body.protocolVersion,
      pairedAt: new Date().toISOString(),
    });

    console.log(`ditto-bridge: paired as device ${body.deviceId}.`);
    console.log(`State written to ~/.ditto/bridge.json (mode 0600).`);
    console.log(`Run 'ditto-bridge start' to dial.`);
  },
});

const start = defineCommand({
  meta: {
    name: "start",
    description: "Dial the workspace and stay connected; reconnect with backoff on drops.",
  },
  async run() {
    await startDaemon();
  },
});

const revoke = defineCommand({
  meta: {
    name: "revoke",
    description:
      "Clear local pairing state. Cloud-side revoke must be done via the workspace UI; this just removes the local credential.",
  },
  async run() {
    const state = await readState();
    if (!state) {
      console.log("ditto-bridge: no paired state to clear.");
      return;
    }
    await clearState();
    console.log("ditto-bridge: local state cleared.");
    console.log(
      "Note: the cloud-side device row is NOT revoked by this command — open the Devices page to revoke it.",
    );
  },
});

const main = defineCommand({
  meta: {
    name: "ditto-bridge",
    version: "0.1.0",
    description:
      "Outbound-dial daemon that lets a cloud-hosted Ditto workspace run commands on your laptop. Transport only — no agent code runs locally.",
  },
  subCommands: { pair, start, revoke },
});

runMain(main);
