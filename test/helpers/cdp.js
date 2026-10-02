'use strict';
// Tiny Chrome DevTools Protocol client for smoke-testing the real Electron app (no dependencies).
// node test/helpers/cdp.js <port> "<js expression>"
const http = require('http');
const [port, expr] = process.argv.slice(2);
http.get(`http://127.0.0.1:${port}/json`, (res) => {
  let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => {
    const page = JSON.parse(b).find((t) => t.type === 'page' && /index\.html/.test(t.url)) || JSON.parse(b)[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const shot = expr.startsWith('shot:');
    ws.onopen = () => ws.send(JSON.stringify(shot ? { id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } } : { id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1 && shot) { require('fs').writeFileSync(expr.slice(5), Buffer.from(d.result.data, 'base64')); console.log('saved', expr.slice(5)); ws.close(); process.exit(0); } if (d.id === 1) { console.log(JSON.stringify(d.result.result.value ?? d.result.exceptionDetails ?? d.result, null, 1)); ws.close(); process.exit(0); } };
  });
}).on('error', (e) => { console.error(e.message); process.exit(1); });
