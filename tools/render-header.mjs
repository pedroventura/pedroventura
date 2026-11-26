import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Exportación local del HTML aprobado, sin dependencias ni peticiones externas.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/header.css', ['header.css', 'text/css; charset=utf-8']],
  ['/background.jpg', ['background.jpg', 'image/jpeg']],
]);
const server = createServer((request, response) => {
  const file = files.get(request.url);
  if (!file) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
  response.end(readFileSync(join(root, 'assets/header-source', file[0])));
});
const temporary = mkdtempSync(join(tmpdir(), 'pedro-profile-header-'));
let chrome;
let ws;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0',
    `--user-data-dir=${temporary}`, url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome no inició CDP')), 10000);
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  ws = new WebSocket(endpoint);
  await once(ws, 'open');
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetInfos } = await rpc('Target.getTargets');
  const target = targetInfos.find(item => item.type === 'page' && item.url === url);
  if (!target) throw new Error('No se encontró la página local');
  const { sessionId } = await rpc('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = (method, params) => rpc(method, params, sessionId);
  await page('Emulation.setDeviceMetricsOverride', { width: 848, height: 600, deviceScaleFactor: 2, mobile: false });
  const ready = await page('Runtime.evaluate', {
    expression: `(async()=>{
      if(document.readyState!=='complete') await new Promise(resolve=>addEventListener('load',resolve,{once:true}));
      await document.fonts.ready;
      await document.querySelector('img').decode();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const r=document.querySelector('.profile-hero').getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height};
    })()`, awaitPromise: true, returnByValue: true,
  });
  if (ready.exceptionDetails) throw new Error('La fuente HTML no se pudo renderizar');
  const screenshot = await page('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { ...ready.result.value, scale: 1 },
  });
  writeFileSync(join(root, 'assets/header.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('Cabecera exportada desde HTML: assets/header.png');
} finally {
  ws?.close();
  if (chrome && chrome.exitCode === null) {
    const stopped = once(chrome, 'exit');
    chrome.kill();
    await stopped;
  }
  server.close();
  rmSync(temporary, { recursive: true, force: true });
}
