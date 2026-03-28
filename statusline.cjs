#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function getClaudeConfigPath() {
  return path.join(os.homedir(), '.claude.json');
}

function getInstallRoot() {
  return path.join(os.homedir(), '.claude', 'multi-account-switch');
}

function getStatuslineTargetPath() {
  return path.join(getInstallRoot(), 'hooks', 'statusline-target.json');
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getAccountKey(account) {
  if (account?.accountUuid && String(account.accountUuid).trim()) {
    return `uuid:${String(account.accountUuid).trim().toLowerCase()}`;
  }
  if (account?.emailAddress && String(account.emailAddress).trim()) {
    return `email:${String(account.emailAddress).trim().toLowerCase()}`;
  }
  return null;
}

function isSuspiciousDisplayName(value) {
  return value.includes('\uFFFD') || (value.match(/\?/g) || []).length >= 2;
}

function getPreferredDisplayName(account) {
  if (account?.displayName && String(account.displayName).trim()) {
    const displayName = String(account.displayName).trim();
    if (!isSuspiciousDisplayName(displayName)) {
      return displayName;
    }
  }

  if (account?.emailAddress && String(account.emailAddress).trim()) {
    const email = String(account.emailAddress).trim();
    const atIndex = email.indexOf('@');
    return atIndex > 0 ? email.slice(0, atIndex) : email;
  }

  return 'unknown';
}

function inferPlanType(account) {
  const hasOrgScope = Boolean(account?.organizationRole) || Boolean(account?.workspaceRole);
  if (hasOrgScope) {
    return account.billingType === 'stripe_subscription' ? 'Teams' : 'Enterprise';
  }
  if (account?.hasExtraUsageEnabled === true) {
    return 'Max';
  }
  if (account?.billingType === 'stripe_subscription') {
    return 'Pro';
  }
  return 'Unknown';
}

function getStatuslineLabel() {
  const config = readJsonIfExists(getClaudeConfigPath(), {});
  const account = config?.oauthAccount || (Array.isArray(config?.oauthList) ? config.oauthList.find((entry) => getAccountKey(entry)) : null);
  if (!account) {
    return 'acct: unavailable';
  }
  return `acct: ${getPreferredDisplayName(account)} | plan: ${inferPlanType(account)}`;
}

function runDownstream(input) {
  const target = readJsonIfExists(getStatuslineTargetPath(), null);
  if (!target || target.type !== 'command' || !target.command) {
    return '';
  }

  const result = spawnSync(target.command, {
    input,
    encoding: 'utf8',
    shell: true,
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    return '';
  }

  return (result.stdout || '').trimEnd();
}

function prependLabel(label, downstream) {
  if (!downstream) {
    return label;
  }

  const lines = downstream.split(/\r?\n/);
  lines[0] = lines[0] ? `${label} │ ${lines[0]}` : label;
  return lines.join('\n');
}

const stdin = fs.readFileSync(0, 'utf8');
const label = getStatuslineLabel();
const downstream = runDownstream(stdin);
process.stdout.write(`${prependLabel(label, downstream)}\n`);
