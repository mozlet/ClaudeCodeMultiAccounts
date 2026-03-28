#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function backupFile(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return;
  ensureDir(backupDir);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  fs.copyFileSync(filePath, path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`));
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function uninstallCommands() {
  const home = os.homedir();
  const installRoot = path.join(home, '.claude', 'multi-account-switch');
  const userBinDir = process.platform === 'win32' ? path.join(home, 'bin') : path.join(home, '.local', 'bin');
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const backupDir = path.join(home, '.claude', 'backups', 'multi-account-switch-installer');
  const hookCommand = process.platform === 'win32'
    ? `& '${path.join(userBinDir, 'cc-sync-oauth.cmd')}'`
    : path.join(userBinDir, 'cc-sync-oauth');

  if (fs.existsSync(settingsPath)) {
    backupFile(settingsPath, backupDir);
    const settings = readJson(settingsPath, {});
    if (settings.hooks && Array.isArray(settings.hooks.Notification)) {
      settings.hooks.Notification = settings.hooks.Notification
        .map((entry) => {
          if (!entry || entry.matcher !== 'auth_success' || !Array.isArray(entry.hooks)) {
            return entry;
          }
          const nextHooks = entry.hooks.filter((hook) => !(hook && hook.type === 'command' && hook.command === hookCommand));
          return nextHooks.length > 0 ? { ...entry, hooks: nextHooks } : null;
        })
        .filter(Boolean);
      writeJson(settingsPath, settings);
    }
  }

  for (const name of ['cc-switch', 'cc-sync-oauth', 'cc-switch.cmd', 'cc-sync-oauth.cmd']) {
    const target = path.join(userBinDir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }

  if (fs.existsSync(installRoot)) {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }

  console.log('Uninstalled multi-account switcher.');
}

uninstallCommands();
