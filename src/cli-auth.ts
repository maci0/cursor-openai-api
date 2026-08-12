/**
 * Cursor OAuth authentication for standalone CLI.
 * Handles PKCE-based login, polling, token refresh, and file-based storage.
 */
import {
  generateCursorAuthParams,
  pollCursorAuth,
  refreshCursorToken as refreshToken,
  getTokenExpiry,
  type CursorCredentials,
} from "./auth";

const CONFIG_DIR = `${process.env.HOME}/.config/cursor-openai-api`;
const CREDENTIALS_FILE = `${CONFIG_DIR}/credentials.json`;

function ensureConfigDir() {
  try {
    const { mkdirSync } = require("node:fs");
    mkdirSync(CONFIG_DIR, { recursive: true });
  } catch {}
}

export interface StoredCredentials {
  access: string;
  refresh: string;
  expires: number;
}

export function getStoredCredentials(): StoredCredentials | null {
  try {
    ensureConfigDir();
    const { readFileSync } = require("node:fs");
    const data = readFileSync(CREDENTIALS_FILE, "utf-8");
    const creds = JSON.parse(data) as StoredCredentials;
    if (!creds.access || !creds.refresh || !creds.expires) {
      return null;
    }
    return creds;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: CursorCredentials): void {
  ensureConfigDir();
  const { writeFileSync } = require("node:fs");
  writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify({
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
    }, null, 2)
  );
}

export function clearCredentials(): void {
  try {
    const { unlinkSync } = require("node:fs");
    unlinkSync(CREDENTIALS_FILE);
  } catch {}
}

export function isAuthenticated(): boolean {
  const creds = getStoredCredentials();
  if (!creds) return false;
  return creds.expires > Date.now();
}

export async function login(): Promise<{ accessToken: string; refreshToken: string }> {
  const { verifier, challenge, uuid, loginUrl } = await generateCursorAuthParams();

  console.log("📋 Opening browser for login...\n");
  console.log(`   If browser doesn't open, visit:`);
  console.log(`   ${loginUrl}\n`);

  try {
    const { execFile } = require("node:child_process");
    const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(openCmd, [loginUrl]);
  } catch {}

  console.log("⏳ Waiting for authentication...\n");

  const result = await pollCursorAuth(uuid, verifier);

  const credentials: CursorCredentials = {
    access: result.accessToken,
    refresh: result.refreshToken,
    expires: getTokenExpiry(result.accessToken),
  };

  saveCredentials(credentials);

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

export function logout(): void {
  clearCredentials();
}

export async function refreshCursorToken(refreshTokenVal: string): Promise<CursorCredentials> {
  return refreshToken(refreshTokenVal);
}

export { getTokenExpiry };
