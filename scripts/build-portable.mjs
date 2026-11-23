#!/usr/bin/env node
// Build an unsigned, portable OBS Retro-BH candidate for one target.
//
//   node scripts/build-portable.mjs --target windows-x64|macos-x64|macos-arm64|linux-x64|linux-arm64 [--out-dir PATH]
//   node scripts/build-portable.mjs --verify PATH --target <target>
//
// Fail-closed: refuses to run without required payloads/notices/launchers,
// refuses to trust a partial or inconsistent runtime lock for the requested
// target, verifies the pinned archive hash against the official nodejs.org
// SHASUMS256.txt and confirms the release is an official LTS entry in
// index.json, then requires the downloaded bytes to match before extraction.
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {chmod, copyFile, lstat, mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Git Bash may put GNU tar (no ZIP support) ahead of Windows' bsdtar.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar';
const LOCK_PATH = path.join(ROOT, 'packaging', 'runtime-lock.json');
const TARGET_NAMES = ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64', 'linux-arm64'];
const REQUIRED_SOURCES = [
  'LICENSE',
  'package.json',
  'scripts/portable.mjs',
  'docs/PORTABLE.md',
  'server/index.mjs',
  'server/store.mjs',
  'server/obs-bridge.mjs',
  'public/config.html',
  'public/scene.html',
  'public/overlay.html',
  'public/js/config-schema.mjs',
  'public/js/config.mjs',
  'public/js/live.mjs',
  'public/js/overlay.mjs',
  'public/js/scene.mjs',
  'public/js/timers.mjs',
  'public/celestial/audio-reactive.js',
  'public/celestial/NOTICE.md',
  'public/celestial/assets/ATTRIBUTION.md',
  'public/fonts/jost/OFL.txt',
  'public/fonts/spectral/OFL.txt',
  'public/fonts/jost/Jost-Variable.ttf', 'public/fonts/spectral/Spectral-Regular.ttf',
  ...['config', 'overlay', 'scene'].map(name => 'public/css/' + name + '.css'),
  ...['blackhole-grain', 'blackhole/physics', 'blackhole/raytracer-worker', 'celestial-ink', 'orbits', 'solar-model'].map(name => 'public/celestial/' + name + '.js'),
  ...['earth', 'jupiter', 'mars', 'mercury', 'moon', 'neptune', 'saturn', 'uranus', 'venus_atmosphere'].map(name => 'public/celestial/assets/' + name + '.jpg')
];

const launcherFor = target => target.startsWith('windows') ? 'windows/Start.cmd'
  : target.startsWith('macos') ? 'macos/Start.command'
  : 'linux/start.sh';

function fail(message) { throw new Error(message); }

function parseArgs(argv) {
  const args = {target: null, outDir: null, verify: null, help: false};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--target') args.target = argv[++index] ?? null;
    else if (arg === '--out-dir') args.outDir = argv[++index] ?? null;
    else if (arg === '--verify') args.verify = argv[++index] ?? null;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else fail('Unknown argument: ' + arg);
  }
  if (args.help) return args;
  if (!args.target) fail('--target is required: ' + TARGET_NAMES.join(', '));
  if (!TARGET_NAMES.includes(args.target)) fail('Unknown target: ' + args.target);
  if (args.outDir != null && (typeof args.outDir !== 'string' || !args.outDir)) fail('--out-dir requires a path');
  if (args.verify != null && (typeof args.verify !== 'string' || !args.verify)) fail('--verify requires a path');
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/build-portable.mjs --target <target> [--out-dir PATH]',
    '  node scripts/build-portable.mjs --verify <archive-or-extracted-dir> --target <target>',
    '',
    'Targets: ' + TARGET_NAMES.join(', '),
    'Default output directory: dist/ (Git-ignored).'
  ].join('\n');
}

function assertOfficialUrl(url, label = 'URL') {
  let parsed;
  try { parsed = new URL(url); } catch { fail('Invalid official Node ' + label + ': ' + url); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'nodejs.org' || !parsed.pathname.startsWith('/dist/')) {
    fail('Refusing non-official Node ' + label + ' (expected https://nodejs.org/dist/...): ' + url);
  }
}

function isHexSha256(value) { return /^[0-9a-f]{64}$/.test(value || ''); }

async function readJson(file, label) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { fail('Cannot read ' + label + ': ' + error.message); }
}

async function loadLock(target) {
  const lock = await readJson(LOCK_PATH, LOCK_PATH);
  if (!lock || lock.lockVersion !== 1) fail('runtime-lock.json: unsupported or missing lockVersion (expected 1)');
  const runtime = lock.runtime;
  if (!runtime || typeof runtime !== 'object') fail('runtime-lock.json: missing runtime object (partial lock)');
  if (!/^v\d+\.\d+\.\d+$/.test(runtime.version || '')) fail('runtime-lock.json: runtime.version must be a pinned vX.Y.Z Node release');
  if (typeof runtime.lts !== 'string' || !runtime.lts.trim()) fail('runtime-lock.json: runtime.lts must name the pinned LTS line (partial lock)');
  if (!runtime.distBase) fail('runtime-lock.json: missing runtime.distBase (partial lock)');
  if (!runtime.shasumsUrl) fail('runtime-lock.json: missing runtime.shasumsUrl (partial lock)');
  if (!runtime.indexUrl) fail('runtime-lock.json: missing runtime.indexUrl (partial lock)');
  assertOfficialUrl(runtime.distBase, 'distBase');
  assertOfficialUrl(runtime.shasumsUrl, 'shasumsUrl');
  assertOfficialUrl(runtime.indexUrl, 'indexUrl');

  const expectedDistBase = 'https://nodejs.org/dist/' + runtime.version;
  if (runtime.distBase !== expectedDistBase) fail('runtime-lock.json: runtime.distBase does not match runtime.version');
  if (runtime.shasumsUrl !== expectedDistBase + '/SHASUMS256.txt') fail('runtime-lock.json: runtime.shasumsUrl does not match runtime.version');

  const targetLock = lock.targets?.[target];
  if (!targetLock || typeof targetLock !== 'object') fail('runtime-lock.json: missing target entry for ' + target + ' (partial lock)');
  for (const field of ['archive', 'url', 'sha256', 'format', 'nodePath', 'licensePath', 'nodeName', 'launcher', 'label']) {
    if (!targetLock[field] || typeof targetLock[field] !== 'string') fail('runtime-lock.json: target ' + target + ' is missing/invalid ' + field + ' (partial lock)');
  }
  if (!isHexSha256(targetLock.sha256)) fail('runtime-lock.json: target ' + target + ' has an invalid sha256');
  if (!['zip', 'tar.gz'].includes(targetLock.format)) fail('runtime-lock.json: target ' + target + ' has unsupported format ' + targetLock.format);
  assertOfficialUrl(targetLock.url, 'archive URL for ' + target);
  const expectedArchiveUrl = runtime.distBase + '/' + targetLock.archive;
  if (targetLock.url !== expectedArchiveUrl) fail('runtime-lock.json: target ' + target + ' url does not match distBase/archive');
  if (path.posix.basename(targetLock.archive) !== targetLock.archive) fail('runtime-lock.json: target ' + target + ' archive must be a basename');

  const expectedLauncher = target.startsWith('windows') ? 'Start.cmd' : target.startsWith('macos') ? 'Start.command' : 'start.sh';
  if (targetLock.launcher !== expectedLauncher) fail('runtime-lock.json: target ' + target + ' launcher must be ' + expectedLauncher);
  const expectedNodeName = target.startsWith('windows') ? 'node.exe' : 'node';
  if (targetLock.nodeName !== expectedNodeName) fail('runtime-lock.json: target ' + target + ' nodeName must be ' + expectedNodeName);
  if (!targetLock.nodePath.startsWith(targetLock.archive.replace(/\.tar\.gz$|\.zip$/, '') + '/')) {
    fail('runtime-lock.json: target ' + target + ' nodePath must be inside the archive root');
  }
  if (!targetLock.licensePath.startsWith(targetLock.archive.replace(/\.tar\.gz$|\.zip$/, '') + '/')) {
    fail('runtime-lock.json: target ' + target + ' licensePath must be inside the archive root');
  }

  return {lock, runtime, targetLock};
}

async function assertSources(target) {
  const missing = [];
  for (const relative of REQUIRED_SOURCES) if (!existsSync(path.join(ROOT, relative))) missing.push(relative);
  const launcher = 'packaging/' + launcherFor(target);
  if (!existsSync(path.join(ROOT, launcher))) missing.push(launcher);
  if (missing.length) fail('Missing required portable sources/notices (fail-closed):\n  ' + missing.join('\n  '));
}

function parseShasums(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/);
    if (match) map.set(match[2], match[1].toLowerCase());
  }
  return map;
}

async function fetchText(url, label = url) {
  assertOfficialUrl(url, label);
  const response = await fetch(url, {redirect: 'follow'});
  if (!response.ok) fail('HTTP ' + response.status + ' fetching ' + label + ': ' + url);
  const finalUrl = response.url || url;
  assertOfficialUrl(finalUrl, label + ' final URL');
  return response.text();
}

async function fetchJson(url, label = url) {
  const text = await fetchText(url, label);
  try { return JSON.parse(text); } catch (error) { fail('Invalid JSON from ' + label + ': ' + error.message); }
}

async function verifyOfficialRelease(runtime, targetLock) {
  const index = await fetchJson(runtime.indexUrl, 'runtime.indexUrl');
  if (!Array.isArray(index)) fail('Official Node index.json is not an array');
  const entry = index.find(item => item && item.version === runtime.version);
  if (!entry) fail('Official Node index.json has no entry for ' + runtime.version);
  if (entry.lts !== runtime.lts) fail('Pinned runtime is not the expected official LTS release: index lts=' + JSON.stringify(entry.lts) + ' lock lts=' + JSON.stringify(runtime.lts));
  if (runtime.releaseDate && entry.date && runtime.releaseDate !== entry.date) fail('Pinned runtime releaseDate mismatch: index=' + entry.date + ' lock=' + runtime.releaseDate);

  const shasumsText = await fetchText(runtime.shasumsUrl, 'runtime.shasumsUrl');
  const official = parseShasums(shasumsText);
  const officialSha = official.get(targetLock.archive);
  if (!officialSha) fail('Official SHASUMS256.txt has no entry for ' + targetLock.archive);
  if (officialSha !== targetLock.sha256) {
    fail('Pinned SHA256 mismatch for ' + targetLock.archive + ': lock=' + targetLock.sha256 + ' official=' + officialSha + ' (refusing to extract)');
  }
  const shasumsSha = createHash('sha256').update(shasumsText).digest('hex');
  return {
    officialSha256: officialSha,
    officialIndexLts: entry.lts,
    officialIndexDate: entry.date || null,
    shasumsSha256: shasumsSha,
    shasumsUrl: runtime.shasumsUrl,
    indexUrl: runtime.indexUrl,
    verifiedAt: new Date().toISOString()
  };
}

async function downloadVerified(url, destination, expectedSha256) {
  assertOfficialUrl(url, 'archive URL');
  const handle = await open(destination, 'w');
  const hash = createHash('sha256');
  try {
    const response = await fetch(url, {redirect: 'follow'});
    if (!response.ok) fail('HTTP ' + response.status + ' downloading ' + url);
    const finalUrl = response.url || url;
    assertOfficialUrl(finalUrl, 'archive final URL');
    for await (const chunk of response.body) { hash.update(chunk); await handle.write(chunk); }
  } finally { await handle.close(); }
  const actual = hash.digest('hex');
  if (actual !== expectedSha256) {
    await rm(destination, {force: true});
    fail('SHA256 mismatch for ' + path.basename(url) + ': pinned ' + expectedSha256 + ', downloaded ' + actual + ' (nothing was extracted)');
  }
  return actual;
}

async function sha256File(file) {
  const hash = createHash('sha256');
  const handle = await open(file, 'r');
  try { for await (const chunk of handle.createReadStream()) hash.update(chunk); }
  finally { await handle.close(); }
  return hash.digest('hex');
}

function runChecked(command, args, label) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  if (result.error) fail(label + ' failed to start: ' + result.error.message);
  if (result.status !== 0) fail(label + ' failed: ' + (result.stderr || result.stdout || '').trim());
  return result;
}

function tarList(archive) {
  const result = runChecked(TAR, ['-tf', archive], 'tar -tf ' + archive);
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function extractArchive(archive, destination, members = null) {
  const args = ['-xf', archive, '-C', destination];
  if (members && members.length) args.push(...members);
  runChecked(TAR, args, 'tar extract ' + archive);
}

async function extractRuntime(archive, destination, targetLock) {
  await mkdir(destination, {recursive: true});
  const members = tarList(archive);
  for (const member of [targetLock.nodePath, targetLock.licensePath]) {
    if (!members.includes(member)) fail('Node archive is missing expected member ' + member + ' (fail-closed)');
  }
  extractArchive(archive, destination, [targetLock.nodePath, targetLock.licensePath]);
  const nodeFile = path.join(destination, targetLock.nodePath);
  const licenseFile = path.join(destination, targetLock.licensePath);
  if (!(await lstat(nodeFile)).isFile() || !(await lstat(licenseFile)).isFile()) fail('Runtime members must be regular files');
  return {node: nodeFile, license: licenseFile};
}



function packagedPackageJson(pkg) {
  if (!pkg || pkg.private !== true) fail('Root package.json must keep "private": true');
  if (!pkg.name || !pkg.version) fail('Root package.json is missing name/version');
  const packaged = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    description: pkg.description,
    license: pkg.license,
    engines: pkg.engines,
    // The platform launcher selects bundled Node; there are no packaged npm scripts.
  };
  if (pkg.type) packaged.type = pkg.type;
  return packaged;
}

async function stageBundle(bundle, {target, targetLock, pkg, runtimeFiles}) {
  await mkdir(path.join(bundle, 'runtime'), {recursive: true});
  await mkdir(path.join(bundle, 'app', 'scripts'), {recursive: true});

  await copyFile(runtimeFiles.node, path.join(bundle, 'runtime', targetLock.nodeName));
  await copyFile(runtimeFiles.license, path.join(bundle, 'runtime', 'LICENSE'));
  await chmod(path.join(bundle, 'runtime', targetLock.nodeName), 0o755);

  for (const rel of REQUIRED_SOURCES.filter(rel => rel.startsWith('server/') || rel.startsWith('public/'))) {
    const from = path.join(ROOT, rel), to = path.join(bundle, 'app', rel);
    if (!(await lstat(from)).isFile()) fail('Expected a regular payload file: ' + rel);
    await mkdir(path.dirname(to), {recursive: true}); await copyFile(from, to);
  }
  await copyFile(path.join(ROOT, 'scripts', 'portable.mjs'), path.join(bundle, 'app', 'scripts', 'portable.mjs'));
  await writeFile(path.join(bundle, 'app', 'package.json'), JSON.stringify(packagedPackageJson(pkg), null, 2) + '\n');

  await copyFile(path.join(ROOT, 'LICENSE'), path.join(bundle, 'LICENSE'));
  await copyFile(path.join(ROOT, 'docs', 'PORTABLE.md'), path.join(bundle, 'PORTABLE.md'));
  const launcherDest = path.join(bundle, targetLock.launcher);
  await copyFile(path.join(ROOT, 'packaging', launcherFor(target)), launcherDest);
  await chmod(launcherDest, 0o755);

  // Sanity: only intended root entries.
  const allowedRoot = new Set(['runtime', 'app', 'LICENSE', 'PORTABLE.md', targetLock.launcher, 'BUILD-METADATA.json']);
  const rootEntries = await readdir(bundle);
  const extras = rootEntries.filter(name => !allowedRoot.has(name));
  if (extras.length) fail('Bundle staging produced unexpected root entries: ' + extras.join(', '));
}

function gitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'});
  return result.status === 0 ? result.stdout.trim() : null;
}

async function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const full = path.join(dir, name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    const info = await stat(full);
    if (info.isDirectory()) out.push(...await listFilesRecursive(full, base));
    else if (info.isFile()) out.push(rel);
  }
  return out;
}

async function writeMetadata(bundle, {target, runtime, targetLock, lock, pkg, archiveName, format, officialVerification}) {
  const proposed = (lock.proposedTargets || []).find(entry => entry.target === target);
  const keyFiles = [
    ['LICENSE', path.join(bundle, 'LICENSE')],
    ['runtime/' + targetLock.nodeName, path.join(bundle, 'runtime', targetLock.nodeName)],
    ['runtime/LICENSE', path.join(bundle, 'runtime', 'LICENSE')],
    ['app/scripts/portable.mjs', path.join(bundle, 'app', 'scripts', 'portable.mjs')],
    ['app/package.json', path.join(bundle, 'app', 'package.json')],
    ['PORTABLE.md', path.join(bundle, 'PORTABLE.md')],
    [targetLock.launcher, path.join(bundle, targetLock.launcher)]
  ];
  const metadata = {
    schemaVersion: 1,
    name: pkg.name,
    version: pkg.version,
    target,
    targetLabel: targetLock.label,
    support: proposed?.support || 'CI smoke only - not native OBS support',
    unsigned: true,
    runtime: {
      name: runtime.name || 'Node.js',
      version: runtime.version,
      lts: runtime.lts,
      releaseDate: runtime.releaseDate || null,
      license: runtime.license || 'MIT',
      distBase: runtime.distBase,
      shasumsUrl: runtime.shasumsUrl,
      indexUrl: runtime.indexUrl,
      archive: targetLock.archive,
      archiveUrl: targetLock.url,
      pinnedSha256: targetLock.sha256,
      officialVerification
    },
    entry: 'app/scripts/portable.mjs',
    launcher: targetLock.launcher,
    archive: archiveName,
    archiveFormat: format,
    layout: {
      root: ['LICENSE', 'PORTABLE.md', targetLock.launcher, 'runtime/', 'app/', 'BUILD-METADATA.json'],
      runtime: ['runtime/' + targetLock.nodeName, 'runtime/LICENSE'],
      app: ['app/server/', 'app/public/', 'app/package.json', 'app/scripts/portable.mjs']
    },
    builtAt: new Date().toISOString(),
    builtWith: 'Node.js ' + process.version + ' on ' + process.platform + '/' + process.arch,
    gitCommit: gitCommit(),
    gitDirty: (() => { const status = spawnSync('git', ['status', '--porcelain'], {cwd: ROOT, encoding: 'utf8'}); return status.status === 0 ? Boolean(status.stdout.trim()) : null; })(),
    hashes: Object.fromEntries(await Promise.all(keyFiles.map(async ([name, file]) => [name, await sha256File(file)])))
  };
  await writeFile(path.join(bundle, 'BUILD-METADATA.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}

// ---------------------------------------------------------------------------
// Minimal dependency-free ZIP writer (deflate + store), portable across hosts.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) c = CRC_TABLE[(c ^ buffer[index]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

async function collectZipEntries(directory, base = '') {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    const full = path.join(directory, name);
    const relative = base ? base + '/' + name : name;
    const info = await stat(full);
    if (info.isDirectory()) {
      entries.push({name: relative + '/', full, info, directory: true});
      entries.push(...await collectZipEntries(full, relative));
    } else if (info.isFile()) {
      entries.push({name: relative, full, info, directory: false});
    }
  }
  return entries;
}

async function createZip(directory, output) {
  const entries = await collectZipEntries(directory);
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.directory ? Buffer.alloc(0) : await readFile(entry.full);
    const crc = crc32(data);
    const {time, date} = dosDateTime(entry.info.mtime);
    let method = 0;
    let payload = data;
    if (!entry.directory && data.length > 0) {
      const compressed = zlib.deflateRawSync(data, {level: 9});
      if (compressed.length < data.length) { method = 8; payload = compressed; }
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, payload);

    const mode = entry.directory ? 0o40755 : ((entry.info.mode & 0o111) ? 0o100755 : 0o100644);
    const externalAttrs = (((mode << 16) >>> 0) | (entry.directory ? 0x10 : 0)) >>> 0;
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt16LE(time, 12);
    record.writeUInt16LE(date, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(payload.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(externalAttrs, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += local.length + name.length + payload.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  await writeFile(output, Buffer.concat([...chunks, centralBuffer, end]));
}

async function createArchive(bundle, output, format) {
  if (format === 'zip') { await createZip(bundle, output); return; }
  // tar preserves file modes on POSIX hosts; matching runner builds are expected.
  runChecked(TAR, ['-czf', output, '-C', bundle, '.'], 'tar.gz creation');
}

async function resolveVerifyDirectory(input, temp) {
  const info = await stat(input);
  if (info.isDirectory()) return {directory: input, cleanup: null};
  const destination = path.join(temp, 'extracted');
  await mkdir(destination, {recursive: true});
  if (input.toLowerCase().endsWith('.zip')) {
    extractArchive(input, destination);
  } else {
    runChecked(TAR, ['-xf', input, '-C', destination], 'archive extraction for verify');
  }
  return {directory: destination, cleanup: destination};
}

async function pollJson(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(1000)});
      if (response.ok) return await response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  fail('Timed out waiting for ' + url);
}

async function verifyBundle(directory, target, runtime, targetLock) {
  const node = path.join(directory, 'runtime', targetLock.nodeName);
  const entry = path.join(directory, 'app', 'scripts', 'portable.mjs');
  const launcher = path.join(directory, targetLock.launcher);
  const required = [node, entry, launcher, path.join(directory, 'LICENSE'), path.join(directory, 'PORTABLE.md'), path.join(directory, 'app', 'package.json'), path.join(directory, 'BUILD-METADATA.json'), path.join(directory, 'runtime', 'LICENSE')];
  for (const file of required) if (!existsSync(file)) fail('Artifact is missing required file ' + path.relative(directory, file).replace(/\\/g, '/'));

  if (process.platform !== 'win32') {
    for (const file of [node, launcher]) {
      const mode = (await stat(file)).mode;
      if (!(mode & 0o111)) fail(path.relative(directory, file).replace(/\\/g, '/') + ' is not executable');
    }
  }

  const version = spawnSync(node, ['--version'], {encoding: 'utf8'});
  if (version.status !== 0) fail('Bundled Node failed to run: ' + (version.stderr || '').trim());
  if (version.stdout.trim() !== runtime.version) fail('Bundled Node version ' + version.stdout.trim() + ' does not match pinned ' + runtime.version);

  // Smoke test: run packaged entry with external home and clean cwd.
  const home = await mkdtemp(path.join(os.tmpdir(), 'obs-retro-bh-home-'));
  const work = await mkdtemp(path.join(os.tmpdir(), 'obs-retro-bh-cwd-'));
  // On Windows use owned Node directly for cleanup; the CMD wrapper is tested separately.
  const isWindows = process.platform === 'win32';
  const child = spawn(isWindows ? node : launcher, isWindows ? [entry, '--no-open'] : ['--no-open'], {
    cwd: work,
    env: {...process.env, OBS_RETRO_BH_HOME: home, PORT: '0', OBS_PASSWORD: ''},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  child.stderr.on('data', chunk => output += chunk);
  const exited = new Promise(resolve => {
    child.once('error', error => { output += error.message; });
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  try {
    let ready;
    const deadline = Date.now() + 20000;
    while (!(ready = output.match(/OBS Retro-BH: (http:\/\/127\.0\.0\.1:\d+)\/config/))) {
      if (child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline) fail('Packaged entry did not become ready: ' + output);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const base = ready[1];
    const state = await pollJson(base + '/api/state', 20000);
    if (state.revision !== 0) fail('Fresh portable state should have revision 0, got ' + state.revision);
    if (state.config?.audio?.enabled !== false) fail('Fresh portable state should start with audio off');
    const session = await fetch(base + '/api/session');
    if (!session.ok) fail('GET /api/session failed with ' + session.status);
    const {writeToken} = await session.json();
    const headers = {'Content-Type': 'application/json', 'X-Config-Token': writeToken};
    state.config.scenes.starting.title.text = 'Portable smoke';
    let response = await fetch(base + '/api/config', {method: 'PUT', headers, body: JSON.stringify({revision: state.revision, config: state.config})});
    if (response.status !== 200) fail('Save with current revision failed: ' + response.status + ' ' + (await response.text()));
    const saved = await response.json();
    if (saved.revision !== 1) fail('Save should produce revision 1, got ' + saved.revision);
    response = await fetch(base + '/api/config', {method: 'PUT', headers, body: JSON.stringify({revision: 0, config: state.config})});
    if (response.status !== 409) fail('Stale revision should conflict with 409, got ' + response.status);
    const homeFiles = await readdir(home);
    if (!homeFiles.some(name => name.endsWith('.json'))) fail('No state file was written to the external OBS_RETRO_BH_HOME directory');
    if (existsSync(path.join(directory, 'app', '.local'))) fail('Portable bundle wrote state into app/.local instead of the external home');

    for (const route of ['/config','/scene/starting','/scene/brb','/scene/goodbye']) {
      const response = await fetch(base + route, {signal: AbortSignal.timeout(5000)});
      if (!response.ok) fail(route + ' returned ' + response.status);
      await response.text();
    }
    child.kill('SIGTERM');
    let timer;
    const result = await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => resolve(null), 10000); })]).finally(() => clearTimeout(timer));
    if (!result) { try { child.kill('SIGKILL'); } catch {} await exited; fail('Packaged entry did not stop'); }
    if (process.platform !== 'win32' && result.code !== 0) fail('Packaged entry did not shut down cleanly (exit ' + result.code + ', signal ' + result.signal + ')');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await rm(home, {recursive: true, force: true});
    await rm(work, {recursive: true, force: true});
  }
  return output;
}

async function updateSha256Sums(sumsFile, archiveName, archiveSha) {
  const existing = existsSync(sumsFile) ? await readFile(sumsFile, 'utf8') : '';
  const kept = existing.split(/\r?\n/).filter(line => line && !line.endsWith('  ' + archiveName));
  await writeFile(sumsFile, [...kept, archiveSha + '  ' + archiveName].join('\n') + '\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }

  const {lock, runtime, targetLock} = await loadLock(args.target);
  await assertSources(args.target);

  if (args.verify) {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'obs-retro-bh-verify-'));
    try {
      const {directory} = await resolveVerifyDirectory(path.resolve(args.verify), temp);
      await verifyBundle(directory, args.target, runtime, targetLock);
      console.log('Verified ' + args.target + ' artifact: ' + path.resolve(args.verify));
    } finally {
      await rm(temp, {recursive: true, force: true});
    }
    return;
  }

  if (process.platform === 'win32' && !args.target.startsWith('windows-')) {
    fail('Build Unix archives on a Unix host (WSL is suitable for Linux) so executable permissions are preserved.');
  }
  const pkg = await readJson(path.join(ROOT, 'package.json'), 'package.json');
  const outDir = path.resolve(ROOT, args.outDir || 'dist');
  await mkdir(outDir, {recursive: true});
  const temp = await mkdtemp(path.join(os.tmpdir(), 'obs-retro-bh-build-'));
  try {
    // Verify pinned official Node LTS checksums/source before any download/extraction.
    const officialVerification = await verifyOfficialRelease(runtime, targetLock);

    const archivePath = path.join(temp, targetLock.archive);
    const downloadedSha = await downloadVerified(targetLock.url, archivePath, targetLock.sha256);
    if (downloadedSha !== officialVerification.officialSha256) fail('Downloaded archive hash diverged from verified official hash (fail-closed)');

    const runtimeFiles = await extractRuntime(archivePath, path.join(temp, 'runtime'), targetLock);

    const archiveName = pkg.name + '-' + pkg.version + '-' + args.target + '.' + targetLock.format;
    const bundle = path.join(temp, 'bundle');
    await mkdir(bundle, {recursive: true});
    await stageBundle(bundle, {target: args.target, targetLock, pkg, runtimeFiles});
    await writeMetadata(bundle, {target: args.target, runtime, targetLock, lock, pkg, archiveName, format: targetLock.format, officialVerification});

    const output = path.join(outDir, archiveName);
    await createArchive(bundle, output, targetLock.format);
    const archiveSha = await sha256File(output);
    await writeFile(output + '.sha256', archiveSha + '  ' + archiveName + '\n');
    await updateSha256Sums(path.join(outDir, 'SHA256SUMS'), archiveName, archiveSha);

    console.log('Portable candidate: ' + output);
    console.log('Archive SHA256:     ' + archiveSha);
    console.log('Target label:       ' + targetLock.label + ' (' + args.target + ')');
    console.log('Support:            ' + ((lock.proposedTargets || []).find(entry => entry.target === args.target)?.support || 'CI smoke only - not native OBS support'));
    console.log('Bundled Node:       ' + runtime.version + ' (' + runtime.lts + ', official LTS verified)');
    console.log('Verified source:    ' + runtime.shasumsUrl + ' and ' + runtime.indexUrl);
    console.log('Verify:             node scripts/build-portable.mjs --verify "' + output + '" --target ' + args.target);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
}

main().catch(error => {
  console.error('build-portable: ' + error.message);
  process.exitCode = 1;
});
