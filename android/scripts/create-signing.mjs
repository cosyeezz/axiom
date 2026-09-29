// Run manually from a trusted maintainer machine. Never run on pull requests.
// Creates a persistent release key OUTSIDE the repository, then sends it to
// GitHub Actions encrypted secrets over stdin. No key/password is logged.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const repo = 'cosyeezz/axiom';
const windows = process.platform === 'win32';
const openssl = process.env.OPENSSL_BIN || (windows ? 'C:/Program Files/Git/mingw64/bin/openssl.exe' : 'openssl');
const gh = process.env.GH_BIN || (windows ? 'C:/Program Files/GitHub CLI/gh.exe' : 'gh');
const root = join(homedir(), '.axiom', 'signing');
const dir = join(root, 'android-release');
const password = randomBytes(36).toString('base64url');
const alias = 'axiom-android';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error || result.status !== 0) {
    // Do not print process options or stdin (may contain signing secrets).
    throw new Error(`${command} failed (${result.status ?? result.error?.code}). Signing backup, if created, remains at ${dir}.`);
  }
  return result.stdout;
}

mkdirSync(root, { recursive: true, mode: 0o700 });
// Deliberately fail if a signing identity already exists. Never rotate silently.
mkdirSync(dir, { mode: 0o700 });
if (windows) {
  const account = run('whoami.exe', []).trim();
  run('icacls.exe', [dir, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`]);
}
const key = join(dir, 'private.pem');
const cert = join(dir, 'certificate.pem');
const store = join(dir, 'release.p12');
try {
  run(openssl, ['req', '-x509', '-newkey', 'rsa:4096', '-sha256', '-days', '10000', '-noenc', '-keyout', key, '-out', cert, '-subj', '/CN=Axiom Android/O=Axiom']);
  run(openssl, ['pkcs12', '-export', '-inkey', key, '-in', cert, '-out', store, '-name', alias, '-passout', 'env:AXIOM_SIGNING_PASSWORD'], {
    env: { ...process.env, AXIOM_SIGNING_PASSWORD: password },
  });
  writeFileSync(join(dir, 'credentials.json'), JSON.stringify({ alias, password, storeType: 'PKCS12', repository: repo }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  rmSync(key);
  for (const [name, value] of Object.entries({
    ANDROID_KEYSTORE_BASE64: readFileSync(store).toString('base64'),
    ANDROID_KEYSTORE_PASSWORD: password,
    ANDROID_KEY_ALIAS: alias,
    ANDROID_KEY_PASSWORD: password,
  })) {
    run(gh, ['secret', 'set', name, '--repo', repo], { input: value });
    console.log(`Configured ${name}`);
  }
  console.log(run(openssl, ['x509', '-in', cert, '-noout', '-fingerprint', '-sha256']).trim());
  console.log(`Signing backup: ${dir}\nKeep this directory private and back it up securely. GitHub cannot return secret values.`);
} catch (error) {
  // Preserve backup for recovery; never regenerate a different key on retry.
  console.error(error.message);
  process.exitCode = 1;
}
