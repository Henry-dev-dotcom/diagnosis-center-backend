#!/usr/bin/env node
/*
  The LHIMS analyzer bridge.

  Analyzers sit on a bench, on a serial cable or a local network. LHIMS is in the
  cloud. This is the small program that stands between them: it takes what the
  instrument emits and posts it to the facility's LHIMS, unchanged.

  It is deliberately a single file with no dependencies, so the person setting it
  up needs only Node installed:

      node bridge.mjs --config bridge.config.json

  Two ways to collect from an instrument:

    "folder"  watch a directory the analyzer (or its own software) writes files to.
              This is the common case, and the one to prefer: the file is proof of
              what was sent, and nothing is lost if this program is not running.

    "tcp"     listen for the instrument to connect and push messages, which is how
              most HL7 and ASTM instruments are configured. HL7 is read as MLLP
              frames and acknowledged; ASTM is read as whole transmissions.

  Nothing is deleted. A file that was accepted moves to sent/, one that LHIMS
  could not use moves to failed/, and anything that could not be delivered at all
  stays in queue/ and is retried. A result is never dropped because a network was
  down or a key had expired.
*/

import { createServer } from 'node:net';
import { mkdir, readFile, readdir, rename, writeFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';

/* ------------------------------------------------------------------ config -- */

const DEFAULTS = {
  // Where to send. The facility's LHIMS API, ending in /api.
  apiUrl: env.LHIMS_API_URL ?? '',
  // The analyzer's own key, from Laboratory → Analyzers in LHIMS.
  deviceKey: env.LHIMS_DEVICE_KEY ?? '',
  // "folder" or "tcp".
  mode: env.LHIMS_BRIDGE_MODE ?? 'folder',
  // folder mode
  watchDir: env.LHIMS_WATCH_DIR ?? './incoming',
  // Only these extensions are picked up, so a half-written temp file is ignored.
  extensions: ['.txt', '.csv', '.hl7', '.dat', '.res', '.json', '.astm'],
  pollSeconds: 5,
  // tcp mode
  port: Number(env.LHIMS_BRIDGE_PORT ?? 9100),
  host: env.LHIMS_BRIDGE_HOST ?? '0.0.0.0',
  // What to call the payload when posting. text/plain suits HL7, ASTM and CSV.
  contentType: 'text/plain',
  // Retrying a delivery that failed for a reason that might pass.
  retrySeconds: 30,
  maxRetries: 0 // 0 means keep trying for as long as the program runs
};

function parseArgs() {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else out[key] = true;
  }
  return out;
}

async function loadConfig() {
  const args = parseArgs();
  let fileConfig = {};
  if (args.config) {
    try {
      fileConfig = JSON.parse(await readFile(resolve(String(args.config)), 'utf8'));
    } catch (error) {
      fail(`Could not read the config file ${args.config}: ${error.message}`);
    }
  }
  const config = { ...DEFAULTS, ...fileConfig, ...args };
  config.port = Number(config.port);
  config.pollSeconds = Number(config.pollSeconds);
  config.retrySeconds = Number(config.retrySeconds);

  if (!config.apiUrl) fail('apiUrl is required: the facility\'s LHIMS API address, ending in /api');
  if (!config.deviceKey) fail('deviceKey is required: issue one in LHIMS under Laboratory → Analyzers');
  if (!['folder', 'tcp'].includes(config.mode)) fail(`mode must be "folder" or "tcp", not "${config.mode}"`);
  config.apiUrl = String(config.apiUrl).replace(/\/+$/, '');
  return config;
}

function fail(message) {
  log('error', message);
  exit(1);
}

/* ----------------------------------------------------------------- logging -- */

function log(level, message, extra) {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  if (level === 'error') console.error(line, extra ?? '');
  else console.log(line, extra ?? '');
}

/* ---------------------------------------------------------------- delivery -- */

/*
  Posting one payload. A 2xx means LHIMS has stored it, whatever it then made of
  it — so the file is done with. A 4xx that is not about the key means LHIMS read
  the request and refused it; retrying cannot help, and the file is set aside for
  someone to look at. Anything else is worth trying again.
*/
async function deliver(config, payload) {
  let response;
  try {
    response = await fetch(`${config.apiUrl}/integrations/analyzers/results`, {
      method: 'POST',
      headers: { 'content-type': config.contentType, 'x-analyzer-key': config.deviceKey },
      body: payload
    });
  } catch (error) {
    return { ok: false, retry: true, reason: `could not reach LHIMS: ${error.message}` };
  }

  const text = await response.text().catch(() => '');
  if (response.ok) {
    let summary = text;
    try {
      const body = JSON.parse(text);
      summary = body.message ?? text;
      if (body.data?.notes?.length) summary += ` | ${body.data.notes.join(' ')}`;
    } catch {
      // A non-JSON success body is unusual but not a problem.
    }
    return { ok: true, retry: false, reason: summary };
  }

  // 401/403 usually means the key was rotated or the analyzer disabled. Keep
  // retrying: somebody will fix it, and the results must survive until they do.
  const retry = response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500;
  return { ok: false, retry, reason: `LHIMS answered ${response.status}: ${text.slice(0, 400)}` };
}

/* ------------------------------------------------------------- folder mode -- */

async function ensureDirs(base) {
  for (const sub of ['', 'sent', 'failed', 'queue']) await mkdir(join(base, sub), { recursive: true });
}

/** Move a file, keeping a suffix if something of that name is already there. */
async function moveTo(dir, filePath, name) {
  const target = join(dir, name);
  try {
    await stat(target);
    const stamp = Date.now();
    await rename(filePath, join(dir, `${stamp}-${name}`));
  } catch {
    await rename(filePath, target);
  }
}

async function runFolderMode(config) {
  const base = resolve(String(config.watchDir));
  await ensureDirs(base);
  log('info', `watching ${base} for analyzer files, posting to ${config.apiUrl}`);

  const extensions = new Set((Array.isArray(config.extensions) ? config.extensions : String(config.extensions).split(',')).map((value) => String(value).trim().toLowerCase()));

  const sweep = async () => {
    // Fresh files first, then anything still waiting in the queue.
    for (const dir of [base, join(base, 'queue')]) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        log('error', `could not read ${dir}: ${error.message}`);
        continue;
      }

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!extensions.has(extname(entry.name).toLowerCase())) continue;
        const filePath = join(dir, entry.name);

        /*
          An analyzer may still be writing. If the size is the same a moment
          later, it has finished — simpler and more portable than a lock file,
          and a wrongly-truncated payload would be stored as a parse failure.
        */
        const first = await stat(filePath).catch(() => null);
        if (!first) continue;
        await new Promise((done) => setTimeout(done, 500));
        const second = await stat(filePath).catch(() => null);
        if (!second || second.size !== first.size || second.size === 0) continue;

        const payload = await readFile(filePath, 'utf8');
        const outcome = await deliver(config, payload);

        if (outcome.ok) {
          log('info', `sent ${entry.name}: ${outcome.reason}`);
          await moveTo(join(base, 'sent'), filePath, entry.name);
        } else if (outcome.retry) {
          log('error', `will retry ${entry.name}: ${outcome.reason}`);
          if (dir !== join(base, 'queue')) await moveTo(join(base, 'queue'), filePath, entry.name);
        } else {
          log('error', `giving up on ${entry.name}: ${outcome.reason}`);
          await moveTo(join(base, 'failed'), filePath, entry.name);
          await writeFile(join(base, 'failed', `${entry.name}.why.txt`), outcome.reason, 'utf8').catch(() => {});
        }
      }
    }
  };

  await sweep();
  setInterval(() => {
    sweep().catch((error) => log('error', `sweep failed: ${error.message}`));
  }, Math.max(1, config.pollSeconds) * 1000);
}

/* ---------------------------------------------------------------- tcp mode -- */

const VT = 0x0b; // MLLP start block
const FS = 0x1c; // MLLP end block
const CR = 0x0d;

/*
  An HL7 sender expects an acknowledgement, and will usually resend or alarm
  without one. This builds the minimal ACK that corresponds to the message's own
  MSH, which is what the instrument checks.
*/
function buildAck(message, accepted) {
  const line = message.split(/[\r\n]+/).find((part) => part.startsWith('MSH')) ?? '';
  const fields = line.split('|');
  const sendingApp = fields[2] ?? '';
  const sendingFacility = fields[3] ?? '';
  const receivingApp = fields[4] ?? 'LHIMS';
  const receivingFacility = fields[5] ?? '';
  const controlId = fields[9] ?? '1';
  const version = fields[11] ?? '2.3.1';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

  const ack = [
    `MSH|^~\\&|${receivingApp}|${receivingFacility}|${sendingApp}|${sendingFacility}|${stamp}||ACK|${controlId}|P|${version}`,
    `MSA|${accepted ? 'AA' : 'AE'}|${controlId}`
  ].join('\r');
  return Buffer.concat([Buffer.from([VT]), Buffer.from(`${ack}\r`, 'utf8'), Buffer.from([FS, CR])]);
}

async function runTcpMode(config) {
  const server = createServer((socket) => {
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;
    log('info', `analyzer connected from ${peer}`);
    let buffer = Buffer.alloc(0);
    // An instrument that sends no MLLP framing (common with ASTM) is handled by
    // treating a quiet line as the end of a transmission.
    let idleTimer = null;

    const send = async (payload, framed) => {
      const trimmed = payload.trim();
      if (trimmed === '') return;
      const outcome = await deliver(config, trimmed);
      if (outcome.ok) log('info', `sent a message from ${peer}: ${outcome.reason}`);
      else log('error', `could not send a message from ${peer}: ${outcome.reason}`);

      /*
        If LHIMS could not be reached, the message is written to the queue folder
        so it survives this program stopping. A TCP message has no other copy.
      */
      if (!outcome.ok) {
        const base = resolve(String(config.watchDir));
        await ensureDirs(base).catch(() => {});
        const name = `tcp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.txt`;
        await writeFile(join(base, outcome.retry ? 'queue' : 'failed', name), trimmed, 'utf8').catch((error) => log('error', `could not keep the message on disk: ${error.message}`));
      }

      if (framed) socket.write(buildAck(trimmed, outcome.ok));
    };

    const flushUnframed = () => {
      if (buffer.length === 0) return;
      const payload = buffer.toString('utf8');
      buffer = Buffer.alloc(0);
      send(payload, false).catch((error) => log('error', error.message));
    };

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Take every complete MLLP frame out of the buffer.
      for (;;) {
        const start = buffer.indexOf(VT);
        const end = buffer.indexOf(FS, start + 1);
        if (start < 0 || end < 0) break;
        const payload = buffer.subarray(start + 1, end).toString('utf8');
        buffer = buffer.subarray(end + (buffer[end + 1] === CR ? 2 : 1));
        send(payload, true).catch((error) => log('error', error.message));
      }

      if (idleTimer) clearTimeout(idleTimer);
      // No framing in sight: wait for the line to go quiet, then take what we have.
      if (buffer.length > 0 && buffer.indexOf(VT) < 0) idleTimer = setTimeout(flushUnframed, 2000);
    });

    socket.on('end', () => {
      if (idleTimer) clearTimeout(idleTimer);
      flushUnframed();
      log('info', `analyzer at ${peer} disconnected`);
    });
    socket.on('error', (error) => log('error', `connection from ${peer} failed: ${error.message}`));
  });

  server.on('error', (error) => fail(`could not listen on ${config.host}:${config.port}: ${error.message}`));
  server.listen(config.port, config.host, () => {
    log('info', `listening for analyzers on ${config.host}:${config.port}, posting to ${config.apiUrl}`);
  });

  // Anything the queue folder holds from an earlier failure is retried too.
  const base = resolve(String(config.watchDir));
  await ensureDirs(base);
  setInterval(() => {
    retryQueue(config, base).catch((error) => log('error', `retry failed: ${error.message}`));
  }, Math.max(5, config.retrySeconds) * 1000);
}

async function retryQueue(config, base) {
  const dir = join(base, 'queue');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = join(dir, entry.name);
    const payload = await readFile(filePath, 'utf8').catch(() => null);
    if (payload === null) continue;
    const outcome = await deliver(config, payload);
    if (outcome.ok) {
      log('info', `sent queued ${entry.name}: ${outcome.reason}`);
      await moveTo(join(base, 'sent'), filePath, entry.name);
    } else if (!outcome.retry) {
      log('error', `giving up on queued ${entry.name}: ${outcome.reason}`);
      await moveTo(join(base, 'failed'), filePath, entry.name);
    }
  }
}

/* ------------------------------------------------------------------- start -- */

const config = await loadConfig();
log('info', `LHIMS analyzer bridge starting in ${config.mode} mode`);
if (config.mode === 'folder') await runFolderMode(config);
else await runTcpMode(config);
