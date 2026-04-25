/**
 * Daemon state persistence — Brief 212.
 *
 * Persists the device JWT + dialUrl + protocolVersion at
 * ~/.ditto/bridge.json with mode 0o600. The file is the daemon's "I'm
 * paired" signal — `start` reads it; `pair` writes it; `revoke` deletes it.
 */
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export interface DaemonState {
  deviceId: string;
  jwt: string;
  dialUrl: string;
  protocolVersion: string;
  pairedAt: string;
}

export function stateDir(): string {
  return path.join(os.homedir(), ".ditto");
}

export function statePath(): string {
  return path.join(stateDir(), "bridge.json");
}

export async function readState(): Promise<DaemonState | null> {
  try {
    const text = await fs.readFile(statePath(), "utf8");
    return JSON.parse(text) as DaemonState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeState(state: DaemonState): Promise<void> {
  await fs.mkdir(stateDir(), { recursive: true, mode: 0o700 });
  // Open with explicit mode 0o600 so the file is created with the right
  // permissions atomically. (writeFile alone can leave a brief 0o644
  // window before chmod on some filesystems.)
  const tmp = statePath() + ".tmp";
  const fh = await fs.open(tmp, "w", 0o600);
  try {
    await fh.write(JSON.stringify(state, null, 2));
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, statePath());
  // Belt-and-braces — ensure permissions are 0o600 even if mkdir/rename
  // reset them on some platforms.
  await fs.chmod(statePath(), 0o600);
}

export async function clearState(): Promise<void> {
  try {
    await fs.unlink(statePath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
