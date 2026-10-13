/**
 * Clips de la SD en formato XM (equivale a XmClipParser/ClipTools/XmClipAudio de la app): descarga, análisis
 * Annex-B (H.264 o H.265), audio A-law, miniaturas y reproductor con WebCodecs. Sin dependencias; reutilizable.
 */
const XmClip = (() => {
  // ------------------------------------------------------------ análisis del contenedor XM
  /** Divide por códigos de inicio 00 00 01 y devuelve cada NAL (sin el código) como subarray. */
  function splitAnnexB(d){
    const st = [];
    for (let i = 0; i < d.length - 3; i++) if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 1){ st.push(i + 3); i += 2; }
    const out = [];
    for (let k = 0; k < st.length; k++){
      const s = st[k]; let e = k + 1 < st.length ? st[k + 1] - 3 : d.length;
      if (e > s && d[e - 1] === 0) e--;
      if (e > s) out.push(d.subarray(s, e));
    }
    return out;
  }
  /** NAL con prefijo de longitud de 4 bytes (HVCC/AVCC). */
  function splitLen(d){
    const out = []; let i = 0;
    while (i + 4 <= d.length && out.length < 100000){
      const n = ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
      if (n <= 0 || n > d.length || i + 4 + n > d.length) break;
      out.push(d.subarray(i + 4, i + 4 + n)); i += 4 + n;
    }
    return out;
  }
  const hevcType = n => (n[0] >> 1) & 0x3F;
  const hasParams = n => n.length && ((hevcType(n) >= 32 && hevcType(n) <= 34) || ((n[0] & 31) >= 7 && (n[0] & 31) <= 8));
  function fromWrapper(w){
    if (w.length < 8) return [];
    for (const h of [0, 4, 8, 12, 15, 16]){
      if (w.length <= 1 + h) continue;
      const body = w.subarray(1 + h);
      const a = splitAnnexB(body); if (a.some(hasParams)) return a;
      const p = splitLen(body); if (p.some(hasParams)) return p;
    }
    return w.length > 16 ? splitAnnexB(w.subarray(16)) : [];
  }
  function tryHevc(nals){
    let vps = null, sps = null, pps = null; const frames = [];
    for (const n of nals){ if (!n.length) continue; const t = hevcType(n); if (t === 32) vps = n; else if (t === 33) sps = n; else if (t === 34) pps = n; else if (t < 32) frames.push(n); }
    return sps && frames.length ? { codec: 'hevc', params: [vps, sps, pps].filter(Boolean), sps, frames } : null;
  }
  function tryAvc(nals){
    let sps = null, pps = null; const frames = [];
    for (const n of nals){ if (!n.length) continue; const t = n[0] & 31; if (t === 7) sps = n; else if (t === 8) pps = n; else if (t >= 1 && t <= 5) frames.push(n); }
    return sps && frames.length ? { codec: 'avc', params: [sps, pps].filter(Boolean), sps, frames } : null;
  }
  /** Analiza los bytes del clip. Devuelve {codec, params, sps, frames, nals}; lanza Error si no hay vídeo válido. */
  function parse(raw){
    if (!raw.length) throw new Error('El clip descargado está vacío');
    const top = splitAnnexB(raw);
    let r = tryHevc(top) || tryAvc(top);
    if (!r){
      const nested = [];
      for (const n of top){ if (!n.length) continue; if (hevcType(n) >= 124 && hevcType(n) <= 126) nested.push(...fromWrapper(n)); else nested.push(n); }
      r = (nested.length && (tryHevc(nested) || tryAvc(nested))) || null;
    }
    if (!r){ const p = splitLen(raw); r = tryHevc(p) || tryAvc(p); }
    if (!r) throw new Error('No se encontró vídeo H.264/H.265 en el clip');
    r.nals = top;
    r.isKey = r.codec === 'hevc' ? n => { const t = hevcType(n); return t >= 16 && t <= 21; } : n => (n[0] & 31) === 5;
    return r;
  }

  // ------------------------------------------------------------ códec para WebCodecs
  const hex = b => b.toString(16).padStart(2, '0');
  /** Quita los bytes de prevención de emulación 00 00 03. */
  function unescape(n, from){
    const o = []; let z = 0;
    for (let i = from; i < n.length; i++){
      const b = n[i];
      if (z >= 2 && b === 3 && i + 1 < n.length && n[i + 1] <= 3){ z = 0; continue; }
      o.push(b); z = b === 0 ? z + 1 : 0;
    }
    return Uint8Array.from(o);
  }
  /** Configuración de VideoDecoder a partir del SPS (cadena avc1.… o hev1.…). */
  function decoderConfig(t){
    if (t.codec === 'avc')
      return { codec: 'avc1.' + hex(t.sps[1]) + hex(t.sps[2]) + hex(t.sps[3]), optimizeForLatency: true, avc: { format: 'annexb' } };
    const b = unescape(t.sps, 2);                 // tras la cabecera NAL de 2 bytes
    const ptl = b.subarray(1);                    // salta vps_id/sub_layers/nesting
    const space = ['', 'A', 'B', 'C'][ptl[0] >> 6], tier = (ptl[0] >> 5) & 1 ? 'H' : 'L', prof = ptl[0] & 31;
    let compat = ((ptl[1] << 24) | (ptl[2] << 16) | (ptl[3] << 8) | ptl[4]) >>> 0, rev = 0;
    for (let i = 0; i < 32; i++){ rev = ((rev << 1) | (compat & 1)) >>> 0; compat >>>= 1; }
    let cons = Array.from(ptl.subarray(5, 11)); while (cons.length && cons[cons.length - 1] === 0) cons.pop();
    const codec = `hev1.${space}${prof}.${rev.toString(16).toUpperCase()}.${tier}${ptl[11]}` + (cons.length ? '.' + cons.map(x => x.toString(16).toUpperCase()).join('.') : '');
    return { codec, optimizeForLatency: true, hevc: { format: 'annexb' } };
  }
  const SC = new Uint8Array([0, 0, 0, 1]);
  /** Une los fragmentos con códigos de inicio de 4 bytes. */
  function chunk(nals){
    let n = 0; nals.forEach(x => n += 4 + x.length);
    const o = new Uint8Array(n); let p = 0;
    for (const x of nals){ o.set(SC, p); p += 4; o.set(x, p); p += x.length; }
    return o;
  }

  // ------------------------------------------------------------ audio A-law (envoltorio 00 00 01 FA)
  const RATES = [0, 4000, 8000, 11025, 16000, 20000, 22050, 32000, 44100, 48000];
  const ALAW = (() => { const t = new Float32Array(256); for (let i = 0; i < 256; i++){ const b = i ^ 0x55, e = (b >> 4) & 7, m = b & 15, v = e === 0 ? (m << 4) + 8 : ((m << 4) + 0x108) << (e - 1); t[i] = ((b & 0x80) ? v : -v) / 32768; } return t; })();
  /** Extrae el audio del clip: {pcm: Float32Array, rate} o null si no lleva. */
  function audio(u8){
    const parts = []; let total = 0, rate = 8000;
    for (let i = 0; i < u8.length - 8; i++){
      if (u8[i] === 0 && u8[i + 1] === 0 && u8[i + 2] === 1 && u8[i + 3] === 0xFA){
        const len = u8[i + 6] | (u8[i + 7] << 8);
        if (len > 0 && len <= 4096 && i + 8 + len <= u8.length){ rate = RATES[u8[i + 5]] || rate; parts.push(i + 8, len); total += len; i += 7 + len; }
      }
    }
    if (!total) return null;
    const pcm = new Float32Array(total); let o = 0;
    for (let k = 0; k < parts.length; k += 2) for (let j = 0; j < parts[k + 1]; j++) pcm[o++] = ALAW[u8[parts[k] + j]];
    let pk = 0; for (let i = 0; i < pcm.length; i++) pk = Math.max(pk, Math.abs(pcm[i]));
    const g = pk > 0 ? Math.min(10, Math.max(1, 0.7 / pk)) : 1; if (g > 1) for (let i = 0; i < pcm.length; i++) pcm[i] *= g;   // los DVR graban muy bajo
    return { pcm, rate };
  }

  // ------------------------------------------------------------ descarga
  /** Descarga el clip (o los primeros [max] bytes) y devuelve un Uint8Array. onProgress(bytes). */
  async function descargar(camId, f, max, signal, onProgress){
    const q = new URLSearchParams({ file: f.FileName, begin: f.BeginTime, end: f.EndTime });
    if (max) q.set('max', max);
    const r = await fetch(`/api/camaras/${camId}/sd/clip?${q}`, { signal });
    if (!r.ok) throw new Error('La cámara no pudo enviar el clip (' + r.status + ')');
    const rd = r.body.getReader(), parts = []; let n = 0;
    for (;;){ const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; onProgress && onProgress(n); }
    const out = new Uint8Array(n); let o = 0; for (const p of parts){ out.set(p, o); o += p.length; }
    if (!n) throw new Error('La cámara no envió datos del clip');
    return out;
  }

  /** Miniatura JPEG (Blob) del primer fotograma clave; descarga solo el principio del clip. */
  async function miniatura(camId, f, signal){
    if (!window.VideoDecoder) throw new Error('Sin WebCodecs');
    const t = parse(await descargar(camId, f, 768000, signal));
    const k = t.frames.findIndex(t.isKey); if (k < 0) throw new Error('Sin fotograma clave');
    const cfg = decoderConfig(t);
    if (!(await VideoDecoder.isConfigSupported(cfg)).supported) throw new Error('Códec no soportado');
    return new Promise((res, rej) => {
      let hecho = false;
      const dec = new VideoDecoder({
        output: fr => {
          if (hecho){ fr.close(); return; } hecho = true;
          const c = document.createElement('canvas'); c.width = 320; c.height = Math.max(1, Math.round(320 * fr.displayHeight / fr.displayWidth));
          c.getContext('2d').drawImage(fr, 0, 0, c.width, c.height); fr.close(); dec.close();
          c.toBlob(b => b ? res(b) : rej(new Error('Sin imagen')), 'image/jpeg', 0.8);
        },
        error: e => { if (!hecho){ hecho = true; rej(e); } }
      });
      dec.configure(cfg);
      dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data: chunk([...t.params, t.frames[k]]) }));
      dec.flush().catch(() => {});
    });
  }

  // ------------------------------------------------------------ reproductor
  /**
   * Reproductor de un clip ya descargado sobre un <canvas>. Los fotogramas se reparten en la duración real
   * (fin − inicio). Métodos: iniciar(), pausar(), alternar(), saltar(seg), silencio(bool), foto(); propiedades dur, pos, pausado.
   */
  class Player {
    constructor(canvas, raw, durSeg, onEstado){
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.t = parse(raw); this.raw = raw;
      this.n = this.t.frames.length; this.dt = Math.max(0.001, durSeg / this.n); this.dur = this.n * this.dt;
      this.cfg = decoderConfig(this.t); this.keys = []; this.t.frames.forEach((f, i) => { if (this.t.isKey(f)) this.keys.push(i); });
      this.clock = 0; this.pausado = false; this.idx = 0; this.cola = []; this.on = onEstado || (() => {}); this.vivo = true;
      this.au = audio(raw); this.mudo = false; this.ac = null; this.src = null; this.gain = null; this.ultimo = null;
    }
    async iniciar(){
      if (!window.VideoDecoder) throw new Error('Usa Chrome o Edge (se necesita WebCodecs)');
      if (!(await VideoDecoder.isConfigSupported(this.cfg)).supported) throw new Error('Códec no soportado en este navegador: ' + this.cfg.codec);
      this.dec = new VideoDecoder({ output: f => this.cola.push(f), error: e => this.on('Error de decodificación: ' + e.message) });
      this.dec.configure(this.cfg);
      this.saltar(0); this.prev = performance.now();
      const bucle = now => {
        if (!this.vivo) return;
        if (!this.pausado){ this.clock = Math.min(this.dur, this.clock + (now - this.prev) / 1000); }
        this.prev = now; this.paso(); requestAnimationFrame(bucle);
      };
      requestAnimationFrame(bucle);
    }
    /** Alimenta el decodificador y dibuja el último fotograma cuyo instante ya llegó. */
    paso(){
      const objetivo = Math.min(this.n - 1, Math.floor(this.clock / this.dt));
      while (this.idx < this.n && this.dec.decodeQueueSize < 6 && this.idx <= objetivo + 8){
        const f = this.t.frames[this.idx], key = this.t.isKey(f);
        this.dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: Math.round(this.idx * this.dt * 1e6), data: chunk(key ? [...this.t.params, f] : [f]) }));
        this.idx++;
      }
      this.cola.sort((a, b) => a.timestamp - b.timestamp);
      let mostrar = null;
      while (this.cola.length && this.cola[0].timestamp <= this.clock * 1e6 + 1){ if (mostrar) mostrar.close(); mostrar = this.cola.shift(); }
      if (mostrar){ if (this.cv.width !== mostrar.displayWidth){ this.cv.width = mostrar.displayWidth; this.cv.height = mostrar.displayHeight; } this.ctx.drawImage(mostrar, 0, 0); if (this.ultimo) this.ultimo.close(); this.ultimo = mostrar; }
      if (this.clock >= this.dur && !this.pausado){ this.pausado = true; this.audioParar(); this.on('fin'); }
      this.on('pos');
    }
    /** Salta a un instante: reinicia el decodificador desde el fotograma clave anterior. */
    saltar(seg){
      this.clock = Math.max(0, Math.min(this.dur, seg));
      const objetivo = Math.min(this.n - 1, Math.floor(this.clock / this.dt));
      let k = this.keys[0] || 0; for (const x of this.keys) if (x <= objetivo) k = x; else break;
      this.cola.forEach(f => f.close()); this.cola = [];
      this.dec.reset(); this.dec.configure(this.cfg); this.idx = k;
      if (!this.pausado) this.audioIniciar();
    }
    alternar(){
      if (this.clock >= this.dur){ this.pausado = false; this.saltar(0); return; }
      this.pausado = !this.pausado;
      this.pausado ? this.audioParar() : this.audioIniciar();
    }
    // --- audio
    audioIniciar(){
      this.audioParar(); if (!this.au) return;
      if (!this.ac){ this.ac = new AudioContext(); this.gain = this.ac.createGain(); this.gain.connect(this.ac.destination); }
      this.gain.gain.value = this.mudo ? 0 : 1;
      const b = this.ac.createBuffer(1, this.au.pcm.length, this.au.rate); b.copyToChannel(this.au.pcm, 0);
      this.src = this.ac.createBufferSource(); this.src.buffer = b; this.src.connect(this.gain);
      // La duración real del vídeo manda: el audio se ajusta a ella para mantener la sincronía.
      this.src.playbackRate.value = b.duration / this.dur;
      this.src.start(0, Math.min(this.clock * this.src.playbackRate.value, b.duration - 0.01));
    }
    audioParar(){ try { this.src && this.src.stop(); } catch (_) {} this.src = null; }
    silencio(v){ this.mudo = v; if (this.gain) this.gain.gain.value = v ? 0 : 1; }
    get tieneAudio(){ return !!this.au; }
    foto(){ return new Promise(r => this.cv.toBlob(r, 'image/png')); }
    cerrar(){
      this.vivo = false; this.audioParar();
      try { this.ac && this.ac.close(); } catch (_) {}
      this.cola.forEach(f => f.close()); this.cola = []; if (this.ultimo) this.ultimo.close();
      try { this.dec && this.dec.close(); } catch (_) {}
    }
  }

  return { parse, decoderConfig, audio, descargar, miniatura, Player };
})();
