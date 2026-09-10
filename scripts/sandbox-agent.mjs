import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args.shift();
const options = {};
while (args.length) {
  const flag = args.shift();
  if (!['--name', '--file', '--out', '--selector'].includes(flag) || !args.length) throw new Error(`Invalid option: ${flag}`);
  options[flag.slice(2)] = args.shift();
}
const name = options.name ?? process.env.CANVAS_SCRIBE_SANDBOX_ID ?? 'default';
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new Error('Invalid sandbox name');
if (!['inspect', 'eval', 'stroke', 'click', 'screenshot'].includes(command)) {
  console.log(`Usage: pnpm sandbox:agent <inspect|eval|stroke|click|screenshot> --name ID
  eval --file script.js       Evaluate an expression (including async IIFEs) in Obsidian
  stroke --file path.json     Send pen input: {points:[{x,y,pressure?,tiltX?,tiltY?}],intervalMs?:16}
  click --selector CSS       Mouse-click the center of one visible element
  screenshot --out image.png Save to the named sandbox artifact directory
Coordinates are viewport CSS pixels; inspect first. Node 22+ required.`);
  process.exit(command ? 1 : 0);
}

const artifact = path.join(root, '.canvas-scribe-sandbox', 'artifacts', name);
const connection = JSON.parse(await readFile(path.join(artifact, 'connection.json'), 'utf8'));
if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) throw new Error('Invalid sandbox port');
const expectedVault = path.join(root, '.canvas-scribe-sandbox', 'vaults', name);
if (path.resolve(connection.vaultPath).toLowerCase() !== expectedVault.toLowerCase()) throw new Error('Connection belongs to another vault');
const targets = await (await fetch(`http://127.0.0.1:${connection.port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
const pages = targets.filter(t => t.type === 'page' && t.url.startsWith('app://obsidian.md/'));
if (pages.length !== 1) throw new Error(`Expected one Obsidian page, found ${pages.length}`);
const url = new URL(pages[0].webSocketDebuggerUrl);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || Number(url.port) !== connection.port) throw new Error('Non-local debugger');
const socket = new WebSocket(url);
const pending = new Map();
let nextId = 0;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  clearTimeout(entry.timer);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});
socket.addEventListener('close', () => {
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Debugger closed')); }
  pending.clear();
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Debugger connection timed out')), 5000);
  socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Debugger connection failed')); }, { once: true });
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  const actualVault = await evaluate('app.vault.adapter.getBasePath()');
  if (typeof actualVault !== 'string' || path.resolve(actualVault).toLowerCase() !== expectedVault.toLowerCase()) throw new Error('Refusing to control a different vault');
  if (command === 'stroke' || command === 'click') await send('Page.bringToFront');
  if (command === 'inspect') {
    console.log(JSON.stringify(await evaluate(`(() => ({title:document.title, viewport:{width:innerWidth,height:innerHeight},file:app.workspace.getActiveFile()?.path, pluginLoaded:!!app.plugins.plugins["canvas-scribe"], dialogs:[...document.querySelectorAll(".modal")].map(el=>el.innerText), controls:[...document.querySelectorAll('.canvas-scribe-controls [data-action]')].map(el=>({action:el.dataset.action,label:el.getAttribute('aria-label'),pressed:el.getAttribute('aria-pressed'),rect:el.getBoundingClientRect().toJSON()})), surfaces:[...document.querySelectorAll('.canvas-wrapper')].map(el=>el.getBoundingClientRect().toJSON())}))()`), null, 2));
  } else if (command === 'eval') {
    console.log(JSON.stringify(await evaluate(await readFile(options.file, 'utf8')), null, 2));
  } else if (command === 'screenshot') {
    const filename = options.out ?? `capture-${Date.now()}.png`;
    if (path.basename(filename) !== filename || !filename.endsWith('.png')) throw new Error('--out must be a PNG basename');
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(artifact, filename), Buffer.from(result.data, 'base64'));
    console.log(path.join(artifact, filename));
  } else if (command === 'click') {
    if (!options.selector) throw new Error('--selector required');
    const point = await evaluate(`(() => {const els=[...document.querySelectorAll(${JSON.stringify(options.selector)})].filter(e=>e.getBoundingClientRect().width>0);if(els.length!==1)throw Error('Expected one visible target');const r=els[0].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    try {
      await send('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    } finally {
      await send('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
    }
    console.log(JSON.stringify(point));
  } else {
    const stroke = JSON.parse(await readFile(options.file, 'utf8'));
    const interval = stroke.intervalMs ?? 16;
    const viewport = await evaluate('({width:innerWidth,height:innerHeight})');
    if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 10000 || !Number.isFinite(interval) || interval < 0 || interval > 1000) throw new Error('Invalid points or intervalMs');
    for (const p of stroke.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x >= viewport.width || p.y < 0 || p.y >= viewport.height) throw new Error('Point outside viewport');
      for (const [key, min, max] of [['pressure',0,1],['tiltX',-90,90],['tiltY',-90,90]]) {
        if (p[key] !== undefined && (!Number.isFinite(p[key]) || p[key] < min || p[key] > max)) throw new Error(`Invalid ${key}`);
      }
    }
    let last = stroke.points[0];
    let interrupted = false;
    const interrupt = () => { interrupted = true; };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      for (let i = 0; i < stroke.points.length; i++) {
        if (interrupted) throw new Error('Stroke interrupted; releasing pen');
        last = stroke.points[i];
        await send('Input.dispatchMouseEvent', {type:i === 0 ? 'mousePressed' : 'mouseMoved', x:last.x,y:last.y,button:i===0?'left':'none',buttons:1,pointerType:'pen',force:last.pressure??0.5,tiltX:last.tiltX??0,tiltY:last.tiltY??0,clickCount:i===0?1:0});
        if (interval) await new Promise(resolve => setTimeout(resolve, interval));
      }
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:last.x,y:last.y,button:'left',buttons:0,pointerType:'pen',force:0,clickCount:1});
    }
    console.log(JSON.stringify({sent:stroke.points.length,pointerType:'pen',intervalMs:interval}));
  }
} finally { socket.close(); }
