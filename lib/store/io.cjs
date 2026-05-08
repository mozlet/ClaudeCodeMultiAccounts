const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const KEYCHAIN_SERVICE = 'Claude Code-credentials';

function getDefaultConfigPath() {
  return path.join(os.homedir(), '.claude.json');
}

function getDefaultCredentialsPath() {
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

function getDefaultStorePath() {
  return path.join(os.homedir(), '.ClaudeCodeMultiAccounts.json');
}

function getDefaultBackupDir() {
  return path.join(os.homedir(), '.claude', 'backups', 'multi-account-switch');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return readJson(filePath);
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function backupFile(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return;
  ensureDir(backupDir);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const base = path.basename(filePath);
  fs.copyFileSync(filePath, path.join(backupDir, `${base}.${timestamp}.bak`));

  const backups = fs.readdirSync(backupDir)
    .filter((name) => name.endsWith('.bak'))
    .sort()
    .reverse();

  for (const stale of backups.slice(3)) {
    fs.rmSync(path.join(backupDir, stale), { force: true });
  }
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function isMac() {
  return process.platform === 'darwin';
}

// On macOS, Claude Code stores its OAuth credentials in the login Keychain
// under the service name "Claude Code-credentials" rather than in
// ~/.claude/.credentials.json. We shell out to the `security` CLI because
// Node has no built-in Keychain bindings; this matches what Claude Code
// itself does internally.
function readKeychainCredentials() {
  if (!isMac()) return null;
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function getKeychainAccountName() {
  // Reuse the existing Keychain entry's account name when present so we
  // upsert in place instead of accumulating duplicate items per user.
  try {
    const out = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    const match = out.match(/"acct"<blob>="([^"]+)"/);
    if (match) return match[1];
  } catch (_) { /* no existing entry */ }
  try {
    return os.userInfo().username;
  } catch (_) {
    return process.env.USER || 'claude';
  }
}

function writeKeychainCredentials(credentials) {
  if (!isMac()) return false;
  try {
    const account = getKeychainAccountName();
    const json = JSON.stringify(credentials);
    // -U upserts an existing item. The token is passed via argv (briefly
    // visible to local `ps`); the credentials file already holds the same
    // plaintext on disk, and Claude Code itself goes through the same
    // `security` API, so this doesn't widen the threat surface.
    execFileSync('security', [
      'add-generic-password',
      '-U',
      '-a', account,
      '-s', KEYCHAIN_SERVICE,
      '-w', json,
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) {
    return false;
  }
}

// Read credentials for the live Claude install.
//   * If the file exists, just read it.
//   * Otherwise, on macOS, fall back to the login Keychain (which is where
//     the official Claude CLI puts them by default) and materialize the
//     file so subsequent reads — including from Claude Code itself, which
//     accepts both — work without a special case.
//   * On other platforms, surface the original ENOENT.
function readCredentials(filePath) {
  if (fs.existsSync(filePath)) return readJson(filePath);

  const fromKeychain = readKeychainCredentials();
  if (fromKeychain) {
    writeJson(filePath, fromKeychain);
    try { fs.chmodSync(filePath, 0o600); } catch (_) { /* best effort */ }
    return fromKeychain;
  }

  return readJson(filePath);
}

function writeLiveState(config, credentials, options) {
  backupFile(options.configPath, options.backupDir);
  backupFile(options.credentialsPath, options.backupDir);
  writeJson(options.configPath, config);
  writeJson(options.credentialsPath, credentials);
  try { fs.chmodSync(options.credentialsPath, 0o600); } catch (_) { /* best effort */ }
  // Mirror to Keychain so the next `claude` launch on macOS — which reads
  // from Keychain, not the file — sees the freshly switched account.
  writeKeychainCredentials(credentials);
}

function writeStore(store, options) {
  backupFile(options.storePath, options.backupDir);
  writeJson(options.storePath, store);
}

module.exports = {
  getDefaultConfigPath,
  getDefaultCredentialsPath,
  getDefaultStorePath,
  getDefaultBackupDir,
  ensureDir,
  readJson,
  readJsonIfExists,
  readCredentials,
  readKeychainCredentials,
  writeKeychainCredentials,
  writeJson,
  backupFile,
  deepCopy,
  writeLiveState,
  writeStore,
};
