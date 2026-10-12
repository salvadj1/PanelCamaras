/* =====================================================================
   CENTRO DE SEGURIDAD · visor de grabaciones iCSee (FTP)
   Estructura esperada: cámara\IP_id\AAAA-MM-DD\canal\{pic,rec}
   Requiere Chrome/Edge (File System Access API + WebCodecs).
   ===================================================================== */

/* ---------- Utilidades ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const z2 = n => String(n).padStart(2, '0');
/** Segundos -> HH:MM:SS */
const fmt = s => `${z2(Math.floor(s/3600))}:${z2(Math.floor(s%3600/60))}:${z2(Math.floor(s%60))}`;
/** Segundos -> HH:MM */
const fmtHM = s => `${z2(Math.floor(s/3600))}:${z2(Math.floor(s%3600/60))}`;
/** Segundos -> M:SS (duración) */
const fmtDur = s => { s = Math.max(0, Math.round(s)); return Math.floor(s/60) + ':' + z2(s%60); };
/** Bytes -> texto legible */
const fmtSize = b => b >= 1e9 ? (b/1e9).toFixed(1).replace('.', ',') + ' GB' : b >= 1e6 ? Math.round(b/1e6) + ' MB' : Math.round(b/1e3) + ' KB';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function toast(m){ const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }

/* ---------- Iconos (SVG en línea, estilo línea) ---------- */
const ICONS = {
  'shield':'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'folder':'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41M17.66 6.34l1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41"/>',
  'moon':'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'sliders':'<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  'chev-l':'<path d="m15 18-6-6 6-6"/>','chev-r':'<path d="m9 18 6-6-6-6"/>',
  'play':'<polygon points="6 3 20 12 6 21 6 3"/>',
  'pause':'<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  'skip-b':'<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  'skip-f':'<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  'rot-l':'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  'rot-r':'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  'repeat':'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  'camera':'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  'download':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'full':'<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  'star':'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'list':'<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  'grid':'<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  'image':'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  'film':'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
  'x':'<path d="M18 6 6 18M6 6l12 12"/>',
  'vol':'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  'vol-lo':'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  'vol-off':'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  'zoom-in':'<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
  'zoom-out':'<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>'
};
/** Devuelve el SVG de un icono. */
function ic(n, s = 18, fill = 'none'){
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
}

/* ---------- Estado global ---------- */
const S = {
  items: [], handle: null, day: null, cam: '', filter: 'all', q: '', tab: 'clips', view: 'list',
  favs: new Set(), sel: new Set(), selMode: false, cur: null, order: [], picOrder: [],
  zoom: 24, vs: 0, ve: 86400, dayOff: 0,
  set: { fps: 20, auto: true, theme: 'auto', vol: 1, muted: false }
};
const TAGS = { M: 'Movimiento', R: 'Continua', A: 'Alarma' };
const IMG_EXT = /\.(jpe?g|png|bmp|webp)$/i, VID_EXT = /\.h264$/i, DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- Persistencia (IndexedDB) ---------- */
function idb(){ return new Promise((res, rej) => { const r = indexedDB.open('centroseg', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvSet(k, v){ const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function kvGet(k){ const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
const saveSet = () => kvSet('settings', S.set).catch(() => {});
const saveFavs = () => kvSet('favs', [...S.favs]).catch(() => {});

/* ---------- Escaneo de carpetas ---------- */
/** Extrae horas (s desde 00:00) del nombre iCSee: rec "00.00.00-00.05.00[R]..." / pic "00.01.23[M]...". */
function parseTimes(name){
  const base = name.replace(/\.[^.]+$/, '').split('[')[0];   // quitar extensión ANTES de cortar en '['
  return [...base.matchAll(/(\d{2})\D?(\d{2})\D?(\d{2})/g)].map(m => +m[1]*3600 + +m[2]*60 + +m[3]);
}
/** Recorre recursivamente `dir` y rellena S.items. */
async function walk(dir, parts){
  for await (const [name, h] of dir.entries()){
    if (h.kind === 'directory'){ await walk(h, [...parts, name]); continue; }
    const isV = VID_EXT.test(name), isP = IMG_EXT.test(name);
    if (!isV && !isP) continue;
    const tm = parseTimes(name);
    const last = parts[parts.length - 1] || '';
    const baseParts = /^(rec|pic)$/i.test(last) ? parts.slice(0, -1) : parts;
    let start = tm.length ? tm[0] : 0, end = tm.length > 1 ? tm[1] : start + 300;
    if (end <= start) end = isV ? Math.min(86400, start + 300) : start;     // clips que cruzan medianoche
    const tag = (name.match(/\[([A-Z])\]/) || [])[1] || '';
    S.items.push({ name, handle: h, kind: isV ? 'vid' : 'pic', cam: parts[0] || dir.name,
      date: parts.find(p => DATE_RE.test(p)) || '—', path: parts.join('/'), base: baseParts.join('/'),
      key: [...parts, name].join('/'), start, end, tag, hasTime: tm.length > 0 });
    if (S.items.length % 100 === 0) $('stat').textContent = `Escaneando… ${S.items.length}`;
  }
}

/* ---------- Consultas sobre los datos ---------- */
const days = () => [...new Set(S.items.map(i => i.date))].sort().reverse();
const camOk = i => !S.cam || i.cam === S.cam;
const byStart = (a, b) => a.start - b.start || a.name.localeCompare(b.name);
/** Clips del día/cámara seleccionados (orden cronológico). */
const dayClips = () => S.items.filter(i => i.kind === 'vid' && i.date === S.day && camOk(i)).sort(byStart);
const dayPics = () => S.items.filter(i => i.kind === 'pic' && i.date === S.day && camOk(i)).sort(byStart);
let picIdx = {};
/** Indexa las fotos por cámara/fecha/canal para asociarlas a los vídeos. */
function buildPicIndex(){
  picIdx = {};
  S.items.forEach(i => { if (i.kind === 'pic') (picIdx[`${i.cam}|${i.date}|${i.base}`] ||= []).push(i); });
  for (const k in picIdx) picIdx[k].sort(byStart);
}
/** Fotos cuya hora cae dentro del clip (margen 30 s). */
function picsFor(v){ return (picIdx[`${v.cam}|${v.date}|${v.base}`] || []).filter(p => p.start >= v.start - 5 && p.start <= v.end + 30); }
const findThumb = v => picsFor(v)[0] || null;
/** Clips visibles en la lista (filtro + búsqueda), más recientes primero. */
function listClips(){
  const q = S.q.trim().toLowerCase();
  return dayClips().filter(c => {
    if (S.filter === 'fav' && !S.favs.has(c.key)) return false;
    if (S.filter !== 'all' && S.filter !== 'fav' && c.tag !== S.filter) return false;
    return !q || matchQ(c, q);
  }).reverse();
}
function matchQ(i, q){
  const hm = fmtHM(i.start);
  return i.name.toLowerCase().includes(q) || hm.includes(q) || hm.replace(':', '').includes(q) || fmt(i.start).includes(q) || i.cam.toLowerCase().includes(q);
}

/* ---------- Miniaturas (carga diferida) ---------- */
/** URL de objeto de una foto (cacheada). */
function thumbURL(it){ return it._url ||= it.handle.getFile().then(f => URL.createObjectURL(f)); }
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  io.unobserve(e.target);
  const p = e.target._pic;
  if (p) thumbURL(p).then(u => { const img = e.target.querySelector('img'); if (img) img.src = u; }).catch(() => {});
}), { rootMargin: '200px' });

/* ====================================================================
   REPRODUCTOR H.264 crudo (Annex B) con WebCodecs
   ==================================================================== */
const P = { u8: null, aus: [], kf: [], fps: 20, idx: 0, clock: 0, paused: true, dec: null, queue: [], sess: 0, epoch: 0,
  fed: false, flushed: false, ended: false, dur: 0, speed: 1, loop: false, cfg: null, curTs: 0, hasFrame: false, last: 0, uiT: 0 };
let looping = false;

/* ---------- Audio: G.711 A-law del DVR (paquetes 00 00 01 FA + 4 B cabecera + PCM) ---------- */
const A = { ctx: null, gain: null, buf: null, src: null, sess: -1, epoch: -1, speed: 1 };
/** Código de frecuencia de la cabecera del paquete → Hz (el clip de prueba usa 2 = 8000). */
const A_RATES = [0, 4000, 8000, 11025, 16000, 20000, 22050, 32000, 44100, 48000];
/** Tabla de decodificación A-law (G.711) → Float32 [-1..1]. */
const ALAW = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++){
    const b = i ^ 0x55, e = (b >> 4) & 7, m = b & 15;
    const v = e === 0 ? (m << 4) + 8 : ((m << 4) + 0x108) << (e - 1);
    t[i] = ((b & 0x80) ? v : -v) / 32768;
  }
  return t;
})();
/** Extrae el audio intercalado en el stream: devuelve { pcm: Float32Array, rate } o null si no hay. */
function extractAudio(u8){
  const n = u8.length, parts = []; let total = 0, rate = 8000;
  for (let i = 0; i < n - 8; i++){
    if (u8[i] === 0 && u8[i+1] === 0 && u8[i+2] === 1 && u8[i+3] === 0xFA){
      const len = u8[i+6] | (u8[i+7] << 8);                    // longitud del payload (LE)
      if (len > 0 && len <= 4096 && i + 8 + len <= n){
        rate = A_RATES[u8[i+5]] || rate; parts.push(i + 8, len); total += len; i += 7 + len;
      }
    }
  }
  if (!total) return null;
  const pcm = new Float32Array(total); let o = 0;
  for (let k = 0; k < parts.length; k += 2) for (let j = 0, s = parts[k], l = parts[k+1]; j < l; j++) pcm[o++] = ALAW[u8[s + j]];
  return { pcm, rate };
}
/** Crea (una sola vez) el AudioContext y el nodo de ganancia. Debe llamarse tras un gesto del usuario. */
function audioCtx(){
  if (!A.ctx){
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    A.ctx = new AC(); A.gain = A.ctx.createGain(); A.gain.connect(A.ctx.destination); applyVolume();
  }
  return A.ctx;
}
/** Aplica volumen/silencio al nodo de ganancia y refresca los controles. */
function applyVolume(){ if (A.gain) A.gain.gain.value = S.set.muted ? 0 : S.set.vol; updateVolUI(); }
/** Refresca icono del altavoz y posición del deslizador. */
function updateVolUI(){
  const v = S.set.muted ? 0 : S.set.vol;
  $('bMute').innerHTML = ic(v === 0 ? 'vol-off' : v < 0.5 ? 'vol-lo' : 'vol', 20);
  $('vol').value = Math.round(v * 100);
}
/** Detiene la fuente de audio actual (si existe). */
function stopAudio(){
  if (!A.src) return;
  try { A.src.stop(); } catch(_){}
  try { A.src.disconnect(); } catch(_){}
  A.src = null;
}
/** Mantiene el audio alineado con el reloj del vídeo: arranca/para/reposiciona según play, pausa, seek o velocidad. */
function audioSync(){
  const want = A.buf && !P.paused && !P.ended && !dragging && P.aus.length > 0;
  if (!want){ stopAudio(); return; }
  const ctx = audioCtx(); if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (A.src && A.sess === P.sess && A.epoch === P.epoch && A.speed === P.speed) return;
  stopAudio();
  const off = P.clock / 1e6; if (off >= A.buf.duration) return;
  const s = ctx.createBufferSource(); s.buffer = A.buf; s.playbackRate.value = P.speed; s.connect(A.gain);
  s.start(0, Math.max(0, off));
  A.src = s; A.sess = P.sess; A.epoch = P.epoch; A.speed = P.speed;
}

/** Parsea Annex B y agrupa NAL en fotogramas (access units). */
function parseAnnexB(u8){
  const nals = [], n = u8.length; let start = -1;
  for (let i = 0; i < n - 3; i++){
    if (u8[i] === 0 && u8[i+1] === 0 && u8[i+2] === 1){
      if (start >= 0){ let e = i; while (e > start && u8[e-1] === 0) e--; nals.push([start, e]); }
      start = i + 3; i += 2;
    }
  }
  if (start >= 0) nals.push([start, n]);
  const aus = []; let pending = [], cur = null, sps = null;
  for (const nl of nals){
    const t = u8[nl[0]] & 31;
    if (t === 7){ if (!sps) sps = u8.slice(nl[0], nl[1]); pending.push(nl); }
    else if (t === 8) pending.push(nl);
    else if (t === 1 || t === 5){
      const firstMb = (u8[nl[0] + 1] & 0x80) !== 0;
      if (firstMb || !cur){ cur = { nals: [...pending, nl], key: t === 5 }; pending = []; aus.push(cur); }
      else { cur.nals.push(nl); if (t === 5) cur.key = true; }
    }
  }
  return { aus, sps };
}
/** Construye el chunk Annex B de un fotograma (start codes de 4 bytes). */
function buildChunk(u8, au){
  let len = 0; au.nals.forEach(r => len += 4 + r[1] - r[0]);
  const out = new Uint8Array(len); let o = 0;
  for (const r of au.nals){ out.set([0,0,0,1], o); o += 4; out.set(u8.subarray(r[0], r[1]), o); o += r[1] - r[0]; }
  return out;
}
function setMsg(m){ $('vmsg').textContent = m; $('vmsg').style.display = m ? '' : 'none'; updatePlayBtn(); }
function closeDecoder(){
  stopAudio(); A.buf = null;
  P.queue.forEach(f => f.close()); P.queue = [];
  if (P.dec && P.dec.state !== 'closed'){ try { P.dec.close(); } catch(_){} }
  P.dec = null; P.aus = []; P.u8 = null; P.hasFrame = false;
}
function initDecoder(){
  const my = P.sess;
  P.dec = new VideoDecoder({
    output: f => { if (my !== P.sess){ f.close(); return; } P.queue.push(f); P.queue.sort((a, b) => a.timestamp - b.timestamp); },
    error: e => { if (my === P.sess) setMsg('Error de decodificación: ' + e.message); }
  });
  P.dec.configure(P.cfg);
}

/** Carga un clip. opts: { autoplay (def. true), seek (segundos) }. */
async function loadClip(it, opts = {}){
  const my = ++P.sess; closeDecoder();
  S.cur = it; P.ended = false; P.paused = true;
  setMsg('Cargando…'); renderList(); renderTimeline(); renderClipPics(); updateOverlay(); updatePlayBtn();
  let u8;
  try { u8 = new Uint8Array(await (await it.handle.getFile()).arrayBuffer()); } catch(e){ setMsg('No se pudo leer el archivo'); return; }
  if (my !== P.sess) return;
  const { aus, sps } = parseAnnexB(u8);
  const kf = aus.map((a, i) => a.key ? i : -1).filter(i => i >= 0);
  if (!sps || !kf.length){ setMsg('No se encontró H.264 válido (¿formato propietario?)'); return; }
  if (!window.VideoDecoder){ setMsg('Usa Chrome o Edge (se necesita WebCodecs)'); return; }
  const codec = 'avc1.' + [sps[1], sps[2], sps[3]].map(b => b.toString(16).padStart(2, '0')).join('');
  const cfg = { codec, optimizeForLatency: true, avc: { format: 'annexb' } };
  const sup = await VideoDecoder.isConfigSupported(cfg).catch(() => ({ supported: false }));
  if (my !== P.sess) return;
  if (!sup.supported){ setMsg('Códec no soportado: ' + codec); return; }
  P.fps = clamp(+$('fps').value || S.set.fps, 1, 60);
  // Audio: se decodifica aquí; si existe, la duración real del audio fija los fps para mantener la sincronía
  const au = extractAudio(u8); A.buf = null;
  if (au){
    // Los DVR graban muy bajo: normaliza el pico a ~0.7 (ganancia máx. x10) para que se oiga con volumen normal
    let pk = 0; for (let i = 0; i < au.pcm.length; i++){ const a = Math.abs(au.pcm[i]); if (a > pk) pk = a; }
    const g = pk > 0 ? clamp(0.7 / pk, 1, 10) : 1; if (g > 1) for (let i = 0; i < au.pcm.length; i++) au.pcm[i] *= g;
    A.buf = new AudioBuffer({ length: au.pcm.length, numberOfChannels: 1, sampleRate: au.rate });
    A.buf.copyToChannel(au.pcm, 0);
    P.fps = clamp(Math.round(aus.length / A.buf.duration), 1, 60); $('fps').value = P.fps;
  }
  $('bMute').disabled = $('vol').disabled = !A.buf;
  $('bMute').title = A.buf ? 'Silenciar (M)' : 'Este clip no tiene audio';
  Object.assign(P, { u8, aus, kf, cfg, dur: aus.length / P.fps });
  P.paused = opts.autoplay === false;
  setMsg(''); initDecoder(); seek(opts.seek || 0);
  looping || (looping = true, P.last = performance.now(), requestAnimationFrame(tick));
  updatePlayBtn();
}
/** Salta a `sec` segundos: reinicia el decodificador desde el keyframe anterior. */
function seek(sec){
  if (!P.aus.length) return;
  let t = clamp(Math.floor(sec * P.fps), 0, P.aus.length - 1), k = P.kf[0];
  for (const i of P.kf){ if (i <= t) k = i; else break; }
  if (t < k) t = k;
  P.queue.forEach(f => f.close()); P.queue = [];
  try { P.dec.reset(); P.dec.configure(P.cfg); } catch(_){ initDecoder(); }
  P.epoch++; P.idx = k; P.fed = false; P.flushed = false; P.ended = false; P.clock = t * 1e6 / P.fps;
  updatePlayBtn();
}
/** Alimenta el decodificador con contrapresión. */
function pump(){
  while (P.idx < P.aus.length && P.dec.decodeQueueSize < 4 && P.queue.length < 8){
    const a = P.aus[P.idx];
    try { P.dec.decode(new EncodedVideoChunk({ type: a.key ? 'key' : 'delta', timestamp: Math.round(P.idx * 1e6 / P.fps), data: buildChunk(P.u8, a) })); }
    catch(e){ setMsg('Error: ' + e.message); break; }
    P.idx++;
  }
  if (P.idx >= P.aus.length && !P.fed){
    P.fed = true; const ep = P.epoch;
    P.dec.flush().then(() => { if (ep === P.epoch) P.flushed = true; }).catch(() => {});
  }
}
/** Bucle de render: reloj propio, dibuja el último fotograma que ya toca. */
function tick(now){
  if (!P.aus.length){ looping = false; return; }
  const dt = now - P.last; P.last = now;
  pump(); audioSync();
  if (!P.paused && !P.ended) P.clock += dt * P.speed * 1000;
  let shown = null;
  while (P.queue.length && P.queue[0].timestamp <= P.clock){ if (shown) shown.close(); shown = P.queue.shift(); }
  if (shown){
    const cv = $('cv');
    if (cv.width !== shown.displayWidth || cv.height !== shown.displayHeight){ cv.width = shown.displayWidth; cv.height = shown.displayHeight; }
    cv.getContext('2d').drawImage(shown, 0, 0);
    P.curTs = shown.timestamp; P.hasFrame = true; shown.close();
  }
  if (!P.paused && !P.ended && P.flushed && !P.queue.length) onEnded();
  if (now - P.uiT > 100){ P.uiT = now; updateUI(); }
  requestAnimationFrame(tick);
}
function onEnded(){
  P.ended = true; P.paused = true;
  if (P.loop){ seek(0); P.paused = false; return; }
  if (S.set.auto){ const n = neighbor(1); if (n){ loadClip(n, { autoplay: true }); return; } }
  updatePlayBtn();
}
/** Clip anterior (-1) o siguiente (+1) en el tiempo, dentro del día. */
function neighbor(dir){
  const a = dayClips(), i = a.indexOf(S.cur);
  return i < 0 ? null : (a[i + dir] || null);
}
function togglePlay(){
  if (!P.aus.length) return;
  if (P.ended){ seek(0); P.paused = false; } else P.paused = !P.paused;
  updatePlayBtn();
}
const skip = d => { if (P.aus.length) seek(clamp(P.clock / 1e6 + d, 0, P.dur)); };
function stepFrame(d){
  if (!P.aus.length) return;
  P.paused = true; updatePlayBtn();
  const f = Math.round(P.curTs / 1e6 * P.fps);
  if (d > 0) P.clock = Math.min((f + 1) * 1e6 / P.fps, (P.aus.length - 1) * 1e6 / P.fps);
  else seek(Math.max(0, f - 1) / P.fps);
}
function updatePlayBtn(){
  const playing = !P.paused && !P.ended && P.aus.length > 0;
  $('bPlay').innerHTML = ic(playing ? 'pause' : 'play', 22, 'currentColor');
  $('bigPlay').classList.toggle('show', !playing && P.aus.length > 0 && !$('vmsg').textContent);
  $('bLoop').classList.toggle('on', P.loop);
}
function updateOverlay(){
  const c = S.cur;
  $('ovInfo').textContent = c ? `${c.cam} · ${c.date} ${fmt(c.start + Math.min(P.clock / 1e6, P.dur || 0))}` : '';
  $('ovRec').textContent = c ? `${TAGS[c.tag] || 'Grabación'} · ${P.fps} fps` : '';
  $('ovInfo').style.display = $('ovRec').style.display = c ? '' : 'none';
}
/** Refresca tiempo, barra de progreso, overlay y cabezal de la línea de tiempo. */
function updateUI(){
  const t = clamp(P.clock / 1e6, 0, P.dur || 0), f = P.dur ? t / P.dur : 0;
  $('tm').textContent = `${fmtDur(t)} / ${fmtDur(P.dur)}`;
  $('sfill').style.width = (f * 100) + '%'; $('sknob').style.left = (f * 100) + '%';
  updateOverlay(); updatePlayhead();
}
function updatePlayhead(){
  const ph = $('ph'); if (!ph) return;
  if (!S.cur || S.cur.date !== S.day || !P.aus.length){ ph.style.display = 'none'; return; }
  const t = S.cur.start + Math.min(P.clock / 1e6, P.dur);
  if (t < S.vs || t > S.ve){
    // fuera de la ventana: seguir al cabezal salvo que el usuario acabe de desplazar/zoomear (4 s)
    if (S.zoom < 24 && t < 86400 && performance.now() - (S.panT || 0) > 4000) setZoom(S.zoom); else ph.style.display = 'none';
    return;
  }
  const pct = (t - S.vs) / (S.ve - S.vs) * 100;
  ph.style.display = 'block'; ph.style.left = pct + '%'; ph.classList.toggle('flip', pct > 80);
  $('phT').textContent = fmt(t);
}
/** Guarda el fotograma actual como PNG. */
function capture(){
  if (!P.hasFrame || !S.cur) return toast('No hay imagen que capturar');
  const abs = S.cur.start + P.clock / 1e6;
  $('cv').toBlob(b => dlBlob(b, `${S.cur.cam}_${S.cur.date}_${fmt(abs).replace(/:/g, '.')}.png`));
}
function dlBlob(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
async function downloadItem(it){ try { dlBlob(await it.handle.getFile(), it.name); } catch(_){ toast('No se pudo descargar ' + it.name); } }
function toggleFs(){ document.fullscreenElement ? document.exitFullscreen() : $('pl').requestFullscreen?.(); }

/* ---------- Barra de progreso: arrastre y vista previa ---------- */
let dragging = false, dragT = 0, hoverPic = null;
function scrubFrac(e){ const r = $('scrub').getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); }
function showPrev(f){
  if (!S.cur) return;
  const sec = f * P.dur; $('sprev').style.left = (f * 100) + '%'; $('sprevT').textContent = fmtDur(sec);
  const abs = S.cur.start + sec, pics = picsFor(S.cur);
  let best = null, bd = 1e9; pics.forEach(p => { const d = Math.abs(p.start - abs); if (d < bd){ bd = d; best = p; } });
  hoverPic = best; const img = $('sprevImg');
  if (best) thumbURL(best).then(u => { if (hoverPic === best){ img.src = u; img.style.display = ''; } }).catch(() => {});
  else img.style.display = 'none';
}
$('scrub').addEventListener('pointerdown', e => { if (!P.aus.length) return; dragging = true; $('scrub').setPointerCapture(e.pointerId); seek(scrubFrac(e) * P.dur); });
$('scrub').addEventListener('pointermove', e => {
  const f = scrubFrac(e); showPrev(f);
  if (dragging && performance.now() - dragT > 90){ dragT = performance.now(); seek(f * P.dur); }
});
$('scrub').addEventListener('pointerup', e => { if (dragging){ dragging = false; seek(scrubFrac(e) * P.dur); } });

/* ====================================================================
   INTERFAZ: días, KPIs, lista, línea de tiempo
   ==================================================================== */
/** Dibuja el calendario mensual (semana L-D): punto = día con grabaciones; el seleccionado va resaltado. */
function renderDays(){
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const clips = {}, any = {};
  S.items.forEach(i => { if (!camOk(i) || !DATE_RE.test(i.date)) return; any[i.date] = 1; if (i.kind === 'vid') clips[i.date] = (clips[i.date] || 0) + 1; });
  const keys = Object.keys(any).sort();
  if (!S.cal){                                   // primer dibujado: mes del día activo (o del último con datos)
    const ref = DATE_RE.test(S.day || '') ? S.day : (keys[keys.length - 1] || '');
    if (ref){ const [y, m] = ref.split('-').map(Number); S.cal = { y, m: m - 1 }; }
    else { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth() }; }
  }
  const { y, m } = S.cal, off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
  const now = new Date(), today = `${now.getFullYear()}-${z2(now.getMonth() + 1)}-${z2(now.getDate())}`;
  let h = '<span></span>'.repeat(off);
  for (let d = 1; d <= n; d++){
    const k = `${y}-${z2(m + 1)}-${z2(d)}`, has = !!any[k];
    h += `<button class="cd${k === S.day ? ' sel' : ''}${k === today ? ' tod' : ''}"${has ? ` data-d="${k}"` : ' disabled'} title="${k} · ${clips[k] || 0} clips">${d}<i${has ? ' class="dot"' : ''}></i></button>`;
  }
  $('dstrip').innerHTML = h; $('calT').textContent = `${MESES[m]} ${y}`;
  const cur = `${y}-${z2(m + 1)}`;
  $('dPrev').disabled = !keys.length || cur <= keys[0].slice(0, 7);
  $('dNext').disabled = !keys.length || cur >= keys[keys.length - 1].slice(0, 7);
}
/** Cambia de mes en el calendario (d = -1 anterior, +1 siguiente). */
function calMove(d){
  S.cal.m += d;
  if (S.cal.m < 0){ S.cal.m = 11; S.cal.y--; } else if (S.cal.m > 11){ S.cal.m = 0; S.cal.y++; }
  renderDays();
}
function renderKPIs(){
  const cl = dayClips(), pc = dayPics(), ds = days(), prev = ds[ds.indexOf(S.day) + 1];
  $('kClips').textContent = cl.length;
  const sub = $('kClipsSub'); sub.className = 's'; sub.textContent = '';
  if (prev){
    const pn = S.items.filter(i => i.kind === 'vid' && i.date === prev && camOk(i)).length, d = cl.length - pn;
    sub.textContent = `${d >= 0 ? '+' : ''}${d} vs ${prev}`; sub.classList.add(d >= 0 ? 'up' : 'dn');
  }
  const perH = Array(24).fill(0); cl.forEach(c => perH[Math.min(23, Math.floor(c.start / 3600))]++);
  const mx = Math.max(1, ...perH), peak = perH.indexOf(Math.max(...perH));
  $('kSpark').innerHTML = perH.map((n, i) => `<i style="height:${Math.max(12, n / mx * 100)}%" class="${n && i === peak ? 'mx' : ''}" title="${z2(i)}:00 · ${n}"></i>`).join('');
  const tot = cl.reduce((a, c) => a + Math.max(0, c.end - c.start), 0);
  $('kTime').textContent = tot >= 3600 ? `${Math.floor(tot / 3600)} h ${z2(Math.floor(tot % 3600 / 60))}` : `${Math.round(tot / 60)} min`;
  $('kTimeSub').textContent = cl.length ? `Clip medio ${fmtDur(tot / cl.length)}` : '';
  $('kPics').textContent = pc.length;
  $('kPicsSub').textContent = pc.length ? `Última ${fmtHM(pc[pc.length - 1].start)}` : '';
  calcSizes();
}
let sizeTok = 0;
/** Calcula el espacio del día en segundo plano (6 lecturas en paralelo). */
async function calcSizes(){
  const tok = ++sizeTok, arr = S.items.filter(i => i.date === S.day && camOk(i)), pend = arr.filter(i => i.size == null);
  const sum = () => arr.reduce((a, i) => a + (i.size || 0), 0);
  $('kSize').textContent = pend.length ? '…' : fmtSize(sum()); $('kSizeSub').textContent = `${arr.length} archivos`;
  let k = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (k < pend.length && tok === sizeTok){ const it = pend[k++]; try { it.size = (await it.handle.getFile()).size; } catch(_){ it.size = 0; } }
  }));
  if (tok === sizeTok) $('kSize').textContent = fmtSize(sum());
}
function renderChips(){
  const cl = dayClips(), n = t => cl.filter(c => c.tag === t).length;
  const defs = [['all', 'Todas', cl.length], ['M', 'Movimiento', n('M')], ['R', 'Continua', n('R')], ['fav', 'Favoritas', cl.filter(c => S.favs.has(c.key)).length]];
  $('chips').innerHTML = S.tab === 'clips' ? defs.map(d => `<button class="chip${S.filter === d[0] ? ' on' : ''}" data-f="${d[0]}">${d[1]} ${d[2]}</button>`).join('') : '';
}
const periodOf = s => s < 21600 ? 'Madrugada' : s < 43200 ? 'Mañana' : s < 72000 ? 'Tarde' : 'Noche';
function renderList(){
  const L = $('list'); L.classList.toggle('gv', S.view === 'grid' && S.tab === 'clips');
  if (S.tab === 'clips'){
    const arr = S.order = listClips(), multi = !S.cam && new Set(arr.map(c => c.cam)).size > 1;
    if (!arr.length){ L.innerHTML = '<p style="color:var(--mut);padding:12px">No hay grabaciones con estos filtros.</p>'; renderSelbar(); return; }
    let h = '', g = '', open = false;
    arr.forEach((it, i) => {
      const p = periodOf(it.start);
      if (p !== g){ if (open) h += '</div>'; g = p; h += `<div class="grp">${p}</div><div class="gw">`; open = true; }
      const fav = S.favs.has(it.key);
      h += `<div class="row${it === S.cur ? ' cur' : ''}" data-i="${i}"><div class="th"><span class="dur">${fmtDur(it.end - it.start)}</span></div>` +
        `<div class="mt"><b>${fmtHM(it.start)} – ${fmtHM(it.end)}</b><small>${TAGS[it.tag] || 'Grabación'}${multi ? ' · ' + esc(it.cam) : ''}</small></div>` +
        (S.selMode ? `<input type="checkbox" class="ck" data-i="${i}"${S.sel.has(it.key) ? ' checked' : ''}>` : `<button class="star${fav ? ' on' : ''}" data-star="${i}" aria-label="Favorito">${ic('star', 16, fav ? 'currentColor' : 'none')}</button>`) + '</div>';
    });
    L.innerHTML = h + (open ? '</div>' : '');
    L.querySelectorAll('.row').forEach(r => {
      const p = findThumb(S.order[+r.dataset.i]);
      if (p){ r._pic = p; r.querySelector('.th').insertAdjacentHTML('afterbegin', '<img alt="">'); io.observe(r); }
    });
  } else {
    const q = S.q.trim().toLowerCase(), arr = S.picOrder = dayPics().filter(p => !q || matchQ(p, q)).reverse();
    L.innerHTML = arr.length ? '<div class="pg">' + arr.map((p, i) => `<div class="pt" data-p="${i}"><img alt=""><span>${fmtHM(p.start)}</span></div>`).join('') + '</div>' : '<p style="color:var(--mut);padding:12px">No hay fotos.</p>';
    L.querySelectorAll('.pt').forEach(el => { el._pic = S.picOrder[+el.dataset.p]; io.observe(el); });
  }
  renderSelbar();
}
function renderSelbar(){
  const b = $('selbar');
  if (S.tab !== 'clips'){ b.innerHTML = ''; return; }
  b.innerHTML = S.selMode
    ? `<span>${S.sel.size} seleccionadas</span><span class="sp"></span><button class="chip" id="selAll">Todas</button><button class="chip on" id="selDl">${ic('download', 14)} Exportar</button><button class="chip" id="selX">Cancelar</button>`
    : `<button class="chip" id="selOn">Seleccionar</button><span class="sp"></span>`;
}
function renderClipPics(){
  const box = $('clipPics'); box.innerHTML = '';
  if (!S.cur){ box.innerHTML = '<small>—</small>'; return; }
  const pics = picsFor(S.cur).slice(0, 14);
  if (!pics.length){ box.innerHTML = '<small>Sin fotos en este tramo</small>'; return; }
  pics.forEach((p, i) => {
    const im = document.createElement('img'); im.alt = ''; im.title = fmt(p.start); im.onclick = () => openLB(picsFor(S.cur), i);
    thumbURL(p).then(u => im.src = u).catch(() => {}); box.appendChild(im);
  });
}

/* ---------- Línea de tiempo (24 h / 6 h / 1 h) ---------- */
/** Fija la ventana visible: `w` segundos (600..86400) con el instante `c` en la posición relativa `frac` (0..1). */
function applyWindow(c, w, frac = .5){
  w = clamp(w, 600, 86400);
  const vs = clamp(c - w * frac, 0, 86400 - w);
  S.vs = vs; S.ve = vs + w; S.zoom = w / 3600;
  syncZoomUI(); renderTimeline();
}
/** Sincroniza botones de zoom y deslizador (escala logarítmica 24 h -> 10 min) con S.zoom. */
function syncZoomUI(){
  document.querySelectorAll('.zb').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.z - S.zoom) < 0.01));
  $('zs').value = 100 * Math.log(24 / S.zoom) / Math.log(144);
}
/** Zoom a `z` horas, centrado en `c` (por defecto el cabezal, o el centro de la vista). */
function setZoom(z, c){
  const cc = c ?? ((S.cur && S.cur.date === S.day && P.aus.length) ? S.cur.start + P.clock / 1e6 : (S.vs + S.ve) / 2);
  applyWindow(cc, z * 3600);
}
/** Minimapa de 24 h: bloques de clips + rectángulo con la ventana visible. */
function renderMini(clips){
  $('mm').innerHTML = clips.map(v => `<i style="left:${v.start / 864}%;width:${Math.max((v.end - v.start) / 864, 0.3)}%"></i>`).join('') +
    `<div class="vw" style="left:${S.vs / 864}%;width:${(S.ve - S.vs) / 864}%"></div>`;
}
function tlCams(){ return [...new Set(dayClips().map(c => c.cam))]; }
function renderTimeline(){
  const tl = $('tl'), span = S.ve - S.vs, x = t => ((t - S.vs) / span * 100);
  const clips = dayClips(), pics = dayPics(), cams = tlCams(); if (!cams.length) cams.push('');
  const step = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800].find(v => span / v <= 10) || 10800;
  let h = '';
  for (let t = Math.ceil(S.vs / step) * step; t <= S.ve; t += step) h += `<i style="left:${x(t)}%"><b>${S.zoom === 24 ? z2(t / 3600) : fmtHM(t)}</b></i>`;
  cams.forEach((c, r) => {
    const top = 18 + r * 16;
    if (cams.length > 1) h += `<em style="top:${top - 1}px">${esc(c)}</em>`;
    pics.filter(p => p.cam === c && p.start >= S.vs && p.start <= S.ve).forEach(p => h += `<s style="left:${x(p.start)}%;top:${top}px"></s>`);
    clips.filter(v => v.cam === c && v.end >= S.vs && v.start <= S.ve).forEach(v =>
      h += `<a class="${v === S.cur ? 'cur' : ''}${v.tag === 'R' ? ' R' : ''}" style="left:${x(v.start)}%;width:${Math.max((v.end - v.start) / span * 100, 0.3)}%;top:${top}px" title="${fmtHM(v.start)}–${fmtHM(v.end)} · ${esc(v.name)}"></a>`);
  });
  tl.style.height = (34 + cams.length * 16) + 'px';
  tl.innerHTML = h + '<div class="ph" id="ph"><span id="phT"></span></div>';
  renderMini(clips);
  updatePlayhead();
}
$('tl').addEventListener('click', e => {
  if (tlMoved){ tlMoved = false; return; }   // el clic que cierra un arrastre no salta de clip
  const r = $('tl').getBoundingClientRect(), span = S.ve - S.vs, t = S.vs + (e.clientX - r.left) / r.width * span;
  const cams = tlCams(), row = Math.floor((e.clientY - r.top - 18) / 16);
  const cl = dayClips().filter(c => cams.length < 2 || !cams[row] || c.cam === cams[row]);
  let best = null, bd = 1e9;
  for (const c of cl){
    if (t >= c.start && t <= c.end){ best = c; bd = 0; break; }
    const d = Math.min(Math.abs(t - c.start), Math.abs(t - c.end)); if (d < bd){ bd = d; best = c; }
  }
  if (!best || bd > span * 0.04) return;
  const off = Math.max(0, t - best.start);
  best === S.cur ? seek(off) : loadClip(best, { autoplay: true, seek: off });
});
/* Rueda = zoom anclado bajo el cursor; arrastrar = desplazar; minimapa y deslizador/botones = zoom y desplazamiento */
let tlDrag = null, tlMoved = false, mmDrag = false;
$('tl').addEventListener('wheel', e => {
  e.preventDefault();
  const r = $('tl').getBoundingClientRect(), fr = clamp((e.clientX - r.left) / r.width, 0, 1), w = S.ve - S.vs;
  S.panT = performance.now();
  applyWindow(S.vs + fr * w, w * (e.deltaY > 0 ? 1.25 : 0.8), fr);
}, { passive: false });
$('tl').addEventListener('pointerdown', e => {
  tlMoved = false; if (S.zoom >= 24) return;
  tlDrag = { x: e.clientX, vs: S.vs, w: S.ve - S.vs }; $('tl').setPointerCapture(e.pointerId);
});
$('tl').addEventListener('pointermove', e => {
  if (!tlDrag) return;
  const dx = e.clientX - tlDrag.x; if (!tlMoved && Math.abs(dx) < 4) return;
  tlMoved = true; S.panT = performance.now();
  const r = $('tl').getBoundingClientRect(), vs = clamp(tlDrag.vs - dx / r.width * tlDrag.w, 0, 86400 - tlDrag.w);
  S.vs = vs; S.ve = vs + tlDrag.w; renderTimeline();
});
['pointerup', 'pointercancel'].forEach(t => $('tl').addEventListener(t, () => { tlDrag = null; }));
/** Centra la ventana en la posición del minimapa pulsada. */
function mmGo(e){
  const r = $('mm').getBoundingClientRect(), w = S.ve - S.vs; if (w >= 86400) return;
  S.panT = performance.now(); applyWindow(clamp((e.clientX - r.left) / r.width, 0, 1) * 86400, w);
}
$('mm').addEventListener('pointerdown', e => { mmDrag = true; $('mm').setPointerCapture(e.pointerId); mmGo(e); });
$('mm').addEventListener('pointermove', e => { if (mmDrag) mmGo(e); });
['pointerup', 'pointercancel'].forEach(t => $('mm').addEventListener(t, () => { mmDrag = false; }));
$('zs').oninput = e => { S.panT = performance.now(); applyWindow((S.vs + S.ve) / 2, 86400 * Math.pow(144, -e.target.value / 100)); };
$('zIn').onclick = () => { S.panT = performance.now(); applyWindow((S.vs + S.ve) / 2, (S.ve - S.vs) * 0.5); };
$('zOut').onclick = () => { S.panT = performance.now(); applyWindow((S.vs + S.ve) / 2, (S.ve - S.vs) * 2); };
document.querySelectorAll('.zb').forEach(b => b.onclick = () => setZoom(+b.dataset.z));

/* ---------- Visor de fotos ---------- */
let LB = { list: [], i: 0 }, lbUrl = null;
function openLB(list, i){ LB = { list, i }; $('lb').classList.add('show'); showLB(); }
async function showLB(){
  const p = LB.list[LB.i]; if (!p) return;
  $('lbT').textContent = `${p.cam} · ${p.date} · ${fmt(p.start)} · ${p.name}  (${LB.i + 1}/${LB.list.length})`;
  try { const f = await p.handle.getFile(); if (lbUrl) URL.revokeObjectURL(lbUrl); lbUrl = URL.createObjectURL(f); $('lbImg').src = lbUrl; } catch(_){ toast('No se pudo abrir la foto'); }
}
const lbMove = d => { LB.i = (LB.i + d + LB.list.length) % LB.list.length; showLB(); };
$('lbPrev').onclick = () => lbMove(-1); $('lbNext').onclick = () => lbMove(1);
$('lbX').onclick = () => $('lb').classList.remove('show');
$('lbDl').onclick = () => downloadItem(LB.list[LB.i]);

/* ---------- Favoritos y selección ---------- */
function toggleFav(it){ S.favs.has(it.key) ? S.favs.delete(it.key) : S.favs.add(it.key); saveFavs(); renderChips(); renderList(); }
function toggleSel(it){ S.sel.has(it.key) ? S.sel.delete(it.key) : S.sel.add(it.key); renderList(); }
async function exportSel(){
  const arr = dayClips().filter(c => S.sel.has(c.key));
  if (!arr.length) return toast('No hay clips seleccionados');
  toast(`Descargando ${arr.length} clips…`);
  for (const c of arr){ await downloadItem(c); await new Promise(r => setTimeout(r, 450)); }
}
$('list').addEventListener('click', e => {
  const st = e.target.closest('[data-star]'); if (st) return toggleFav(S.order[+st.dataset.star]);
  const ck = e.target.closest('.ck'); if (ck) return toggleSel(S.order[+ck.dataset.i]);
  const row = e.target.closest('.row');
  if (row){ const it = S.order[+row.dataset.i]; return S.selMode ? toggleSel(it) : loadClip(it, { autoplay: true }); }
  const pt = e.target.closest('.pt'); if (pt) openLB(S.picOrder, +pt.dataset.p);
});
$('selbar').addEventListener('click', e => {
  const id = e.target.closest('button')?.id;
  if (id === 'selOn'){ S.selMode = true; S.sel.clear(); renderList(); }
  if (id === 'selX'){ S.selMode = false; S.sel.clear(); renderList(); }
  if (id === 'selAll'){ S.order.forEach(c => S.sel.add(c.key)); renderList(); }
  if (id === 'selDl') exportSel();
});
$('chips').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b){ S.filter = b.dataset.f; renderChips(); renderList(); } });
$('dstrip').addEventListener('click', e => { const d = e.target.closest('[data-d]'); if (d) setDay(d.dataset.d); });
$('dPrev').onclick = () => calMove(-1);
$('dNext').onclick = () => calMove(1);
$('q').addEventListener('input', e => { S.q = e.target.value; renderList(); });
$('cam').onchange = e => { S.cam = e.target.value; refresh(); };
$('tClips').onclick = () => { S.tab = 'clips'; $('tClips').classList.add('on'); $('tPics').classList.remove('on'); renderChips(); renderList(); };
$('tPics').onclick = () => { S.tab = 'pics'; $('tPics').classList.add('on'); $('tClips').classList.remove('on'); renderChips(); renderList(); };
$('vList').onclick = () => { S.view = 'list'; $('vList').classList.add('on'); $('vGrid').classList.remove('on'); renderList(); };
$('vGrid').onclick = () => { S.view = 'grid'; $('vGrid').classList.add('on'); $('vList').classList.remove('on'); renderList(); };
$('vList').classList.add('on');

function setDay(d){
  S.day = d; S.zoom = 24; S.vs = 0; S.ve = 86400; syncZoomUI();
  const [y, m] = d.split('-').map(Number); if (!isNaN(y)) S.cal = { y, m: m - 1 };   // el calendario salta al mes del día elegido
  refresh();
}
function refresh(){ renderDays(); renderKPIs(); renderChips(); renderList(); renderTimeline(); renderClipPics(); }

/* ---------- Controles del reproductor ---------- */
$('bPlay').onclick = $('bigPlay').onclick = togglePlay;
$('vbox').addEventListener('click', e => { if (e.target.id === 'cv') togglePlay(); });
$('bB10').onclick = () => skip(-10); $('bF10').onclick = () => skip(10);
$('bPrev').onclick = () => { const n = neighbor(-1); n ? loadClip(n, { autoplay: true }) : toast('Es el primer clip del día'); };
$('bNext').onclick = () => { const n = neighbor(1); n ? loadClip(n, { autoplay: true }) : toast('Es el último clip del día'); };
$('bLoop').onclick = () => { P.loop = !P.loop; updatePlayBtn(); };
$('bCap').onclick = capture; $('bFs').onclick = toggleFs;
$('bDl').onclick = () => S.cur ? downloadItem(S.cur) : toast('Selecciona un clip');
$('spd').onchange = e => P.speed = +e.target.value;
/** Silencia / restaura el volumen (si estaba a 0 al reactivar, vuelve al 50 %). */
function toggleMute(){
  S.set.muted = !S.set.muted; if (!S.set.muted && S.set.vol === 0) S.set.vol = 0.5;
  applyVolume(); saveSet();
}
$('bMute').onclick = toggleMute;
$('vol').oninput = e => { S.set.vol = clamp(+e.target.value / 100, 0, 1); S.set.muted = S.set.vol === 0; applyVolume(); };
$('vol').onchange = saveSet;
$('fps').onchange = e => {
  const v = clamp(+e.target.value || S.set.fps, 1, 60); e.target.value = v;
  if (!P.aus.length) return;
  const sec = P.clock / 1e6; P.fps = v; P.dur = P.aus.length / v; seek(sec);
};
document.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'checkbox') return;
  if ($('lb').classList.contains('show')){
    if (e.key === 'Escape') $('lb').classList.remove('show');
    if (e.key === 'ArrowLeft') lbMove(-1);
    if (e.key === 'ArrowRight') lbMove(1);
    return;
  }
  if ($('set').classList.contains('show')){ if (e.key === 'Escape') $('set').classList.remove('show'); return; }
  const k = e.key.toLowerCase();
  if (k === ' '){ e.preventDefault(); togglePlay(); }
  else if (k === 'j') skip(-10); else if (k === 'l') skip(10);
  else if (k === ',') stepFrame(-1); else if (k === '.') stepFrame(1);
  else if (k === 'arrowleft') $('bPrev').click(); else if (k === 'arrowright') $('bNext').click();
  else if (k === 'f') toggleFs();
  else if (k === 'm') toggleMute();
});

/* ---------- Ajustes y tema ---------- */
function applyTheme(){
  const t = S.set.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : S.set.theme;
  document.documentElement.dataset.theme = t; $('bTheme').innerHTML = ic(t === 'dark' ? 'sun' : 'moon');
}
$('bTheme').onclick = () => { S.set.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; saveSet(); applyTheme(); };
$('bSet').onclick = () => { $('setFps').value = S.set.fps; $('setAuto').checked = S.set.auto; $('setTheme').value = S.set.theme; $('set').classList.add('show'); };
$('setX').onclick = () => $('set').classList.remove('show');
$('setFps').onchange = e => { S.set.fps = clamp(+e.target.value || 20, 1, 60); $('fps').value = S.set.fps; saveSet(); };
$('setAuto').onchange = e => { S.set.auto = e.target.checked; saveSet(); };
$('setTheme').onchange = e => { S.set.theme = e.target.value; saveSet(); applyTheme(); };
$('setChange').onclick = () => { $('set').classList.remove('show'); chooseFolder(); };
$('setForget').onclick = async () => { S.handle = null; await kvSet('root', null).catch(() => {}); $('fname').textContent = ''; $('set').classList.remove('show'); toast('Carpeta olvidada'); };

/* ---------- Carpeta: elegir, recordar y escanear ---------- */
/** Escanea la carpeta raíz y muestra el último día con grabaciones. */
async function scanRoot(root){
  closeDecoder(); S.cur = null; S.items = []; $('stat').textContent = 'Escaneando…';
  try { await walk(root, []); } catch(e){ toast('Error al escanear: ' + e.message); }
  $('stat').textContent = '';
  S.items.forEach(i => delete i.size);
  buildPicIndex(); $('fname').textContent = root.name;
  if (!S.items.length){ $('empty').hidden = false; $('dash').hidden = true; toast('No se encontraron .h264 ni fotos'); return; }
  const cams = [...new Set(S.items.map(i => i.cam))].sort();
  $('cam').innerHTML = '<option value="">Todas las cámaras</option>' + cams.map(c => `<option>${esc(c)}</option>`).join('');
  S.cam = ''; S.dayOff = 0;
  $('empty').hidden = true; $('dash').hidden = false;
  setDay(days()[0]);
  const cl = dayClips(); if (cl.length) loadClip(cl[cl.length - 1], { autoplay: false });
  toast(`${S.items.length} archivos encontrados`);
}
async function chooseFolder(){
  if (!window.showDirectoryPicker){ alert('Usa Chrome o Edge (showDirectoryPicker).'); return; }
  try {
    const root = await showDirectoryPicker();
    S.handle = root; await kvSet('root', root).catch(() => {});
    await scanRoot(root);
  } catch(e){ if (e.name !== 'AbortError') alert(e.message); }
}
/** Recarga la carpeta recordada (un clic si Chrome pide reconfirmar permiso). */
async function openFolder(){
  if (S.handle){ try { if ((await S.handle.requestPermission({ mode: 'read' })) === 'granted') return scanRoot(S.handle); } catch(_){} }
  chooseFolder();
}
$('bOpen').onclick = $('bFolder').onclick = openFolder;
async function loadSaved(){
  try {
    const h = await kvGet('root'); if (!h) return;
    S.handle = h; $('fname').textContent = h.name; $('bOpen').textContent = `Reabrir «${h.name}»`;
    if ((await h.queryPermission({ mode: 'read' })) === 'granted') await scanRoot(h);
  } catch(_){}
}

/* ---------- Arranque ---------- */
(async function boot(){
  document.querySelectorAll('[data-ic]').forEach(e => e.innerHTML = ic(e.dataset.ic, +e.dataset.s || 18));
  try { const s = await kvGet('settings'); if (s) Object.assign(S.set, s); } catch(_){}
  try { const f = await kvGet('favs'); if (f) S.favs = new Set(f); } catch(_){}
  $('fps').value = S.set.fps; applyTheme(); updatePlayBtn(); updateOverlay(); updateVolUI();
  setMsg('Selecciona una grabación');
  loadSaved();
})();
