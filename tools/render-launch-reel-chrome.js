import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = join(root, '.tmp-chrome-launch-reel');
const port = Number(process.env.DEBUG_PORT || 9230);
const url = process.env.REEL_URL || 'http://127.0.0.1:8099/eteria-tech-launch-2d.html?record=1';
const outFile = join(root, 'social', 'eteria-tech-launch-reel.webm');

await rm(profile, { recursive: true, force: true }).catch(() => {});
await mkdir(profile, { recursive: true });

const before = await stat(outFile).catch(() => null);
const beforeMtime = before?.mtimeMs || 0;

const child = spawn(chrome, [
  '--new-window',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=430,900',
  `--user-data-dir=${profile}`,
  url
], { stdio: 'ignore', detached: false });

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function getJson(endpoint) {
  const res = await fetch(`http://127.0.0.1:${port}${endpoint}`);
  if (!res.ok) throw new Error(`${endpoint}: ${res.status}`);
  return res.json();
}

async function waitForTab() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const tabs = await getJson('/json/list');
      const tab = tabs.find((item) => item.type === 'page' && item.webSocketDebuggerUrl && item.url?.includes('8099'))
        || tabs.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (tab) return tab;
    } catch {}
    await sleep(500);
  }
  throw new Error('No Chrome debug tab found');
}

const tab = await waitForTab();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const logs = [];

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveSend, rejectSend) => {
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rejectSend(new Error(`${method} timed out`));
      }
    }, 30000);
  });
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push({
      type: msg.params.type,
      text: msg.params.args.map((arg) => arg.value || arg.description || '').join(' ')
    });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push({
      type: 'exception',
      text: msg.params.exceptionDetails?.text || msg.params.exceptionDetails?.exception?.description || 'exception'
    });
  }
});

await new Promise((resolveOpen, rejectOpen) => {
  ws.addEventListener('open', resolveOpen, { once: true });
  ws.addEventListener('error', rejectOpen, { once: true });
});

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url }).catch((error) => {
  logs.push({ type: 'warn', text: `Page.navigate continued: ${error.message}` });
});
await sleep(1000);

const deadline = Date.now() + 50000;
let lastState = null;
while (Date.now() < deadline) {
  const evalResult = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      ready: document.readyState,
      status: window.REEL_STATUS || null,
      result: window.REEL_RESULT || null,
      text: document.getElementById('status')?.textContent || null
    })`,
    returnByValue: true
  }).catch((error) => ({ result: { value: JSON.stringify({ evalError: error.message }) } }));
  lastState = JSON.parse(evalResult.result?.value || '{}');
  const current = await stat(outFile).catch(() => null);
  if (current && current.mtimeMs > beforeMtime) break;
  if (lastState?.status === 'error' || lastState?.status === 'done') break;
  await sleep(1000);
}

const after = await stat(outFile).catch(() => null);
console.log(JSON.stringify({
  lastState,
  logs: logs.slice(-20),
  output: after ? { file: outFile, bytes: after.size, changed: after.mtimeMs > beforeMtime } : null
}, null, 2));

try { ws.close(); } catch {}
try { child.kill(); } catch {}
