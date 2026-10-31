const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GEMINI_API_KEY;
const PROJECT_ROOT = __dirname;
const STATIC_ROOT = fs.existsSync(path.join(PROJECT_ROOT, 'dist', 'index.html'))
  ? path.join(PROJECT_ROOT, 'dist')
  : PROJECT_ROOT;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';
const MAX_TEXT_LENGTH = 5000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestLog = new Map();
const allowedVoices = new Set(['Puck', 'Kore', 'Charon', 'Aoede']);

const allowedOrigins = new Set([
  'https://eslamareqi.github.io',
  'https://weasteros-kxfnrvcx.manus.space',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
  if (!origin || allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin || '*';
  }
  return headers;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const existing = requestLog.get(ip) || [];
  const recent = existing.filter(timestamp => now - timestamp < WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100000) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleTts(req, res, headers) {
  if (!API_KEY) {
    return sendJson(res, 503, { error: 'خدمة الصوت غير مهيأة حاليًا.' }, headers);
  }
  if (isRateLimited(clientIp(req))) {
    return sendJson(res, 429, { error: 'تم تجاوز الحد المؤقت للطلبات. حاول بعد دقائق.' }, { ...headers, 'Retry-After': '600' });
  }

  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: 'الطلب غير صالح.' }, headers);
  }

  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const voiceName = allowedVoices.has(input.voiceName) ? input.voiceName : 'Puck';
  const styleDesc = typeof input.styleDesc === 'string' ? input.styleDesc.slice(0, 160) : 'natural British Received Pronunciation voice';
  if (!text) return sendJson(res, 400, { error: 'يرجى إدخال نص.' }, headers);
  if (text.length > MAX_TEXT_LENGTH) return sendJson(res, 413, { error: `النص طويل جدًا. الحد الأقصى ${MAX_TEXT_LENGTH} حرف.` }, headers);

  const promptText = `Speak the following text in a clear, natural, authentic ${styleDesc} (en-GB). Output only the spoken text exactly as written: "${text}"`;
  try {
    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
        }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini request failed:', response.status, data.error?.message || 'unknown error');
      return sendJson(res, 502, { error: 'تعذر توليد الصوت الآن. جرّب مرة أخرى.' }, headers);
    }
    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) return sendJson(res, 502, { error: 'لم تصل بيانات صوتية صالحة.' }, headers);
    return sendJson(res, 200, { audioData: inlineData.data, sampleRate: 24000 }, headers);
  } catch (error) {
    console.error('TTS proxy error:', error.message);
    return sendJson(res, 502, { error: 'تعذر الاتصال بخدمة الصوت الآن.' }, headers);
  }
}

function safeStaticPath(requestPath) {
  const pathname = decodeURIComponent(requestPath.split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(STATIC_ROOT, relative);
  return candidate.startsWith(path.resolve(STATIC_ROOT) + path.sep) ? candidate : null;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  if (!filePath) return sendJson(res, 400, { error: 'طلب غير صالح.' });
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) return sendJson(res, 404, { error: 'الصفحة غير موجودة.' });
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS' && req.url.startsWith('/api/')) {
    res.writeHead(204, headers);
    return res.end();
  }
  if (req.method === 'GET' && req.url.split('?')[0] === '/_app/health') {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/tts') {
    return handleTts(req, res, headers);
  }
  if (req.method === 'GET') return serveStatic(req, res);
  return sendJson(res, 405, { error: 'الطريقة غير مدعومة.' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Weasteros server listening on ${PORT}`);
});
