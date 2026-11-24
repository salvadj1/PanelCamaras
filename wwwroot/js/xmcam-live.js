/**
 * Reproductor de vídeo en directo (MSE sobre WebSocket) contra el proxy /live/ws de PanelCamaras.
 * El servidor entrega fragmentos MP4 (go2rtc); aquí se añaden a un MediaSource y se mantiene el vídeo
 * pegado al directo. Reconecta solo si se corta. Reutilizable con cualquier <video>.
 *   const p = new XmLive(video, '<idCamara>_sd', { onFrame(){ ... }, onState(txt){ ... } }); p.start(); p.stop();
 */
class XmLive {
  constructor(video, src, { onFrame, onState } = {}){
    this.v = video; this.src = src; this.onFrame = onFrame || (() => {}); this.onState = onState || (() => {});
    this.stopped = true; this.ws = null; this.ms = null; this.sb = null; this.queue = []; this.lastData = 0; this.gotFrame = false;
    this.stalls = 0; this.bytes = 0; this.t0 = 0; this.lastMsg = 0; this.gaps = []; this.mime = '';   // estadísticas
  }
  /** Codecs que este navegador sabe reproducir en MSE (se los pedimos al servidor). */
  static codecs(){
    const c = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'hvc1.1.6.L153.B0', 'mp4a.40.2', 'mp4a.40.5', 'flac', 'opus'];
    return c.filter(x => window.MediaSource && MediaSource.isTypeSupported(`video/mp4; codecs="${x}"`)).join(',');
  }
  static soportado(){ return !!window.MediaSource; }

  start(){
    this.stop(true); this.stopped = false;
    if (!XmLive.soportado()){ this.onState('Este navegador no soporta vídeo en directo (MSE)'); return; }
    this.onState('Conectando…');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/live/ws?src=${encodeURIComponent(this.src)}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws; this.lastData = Date.now(); this.t0 = Date.now(); this.bytes = 0; this.lastMsg = 0; this.gaps = [];
    ws.onopen = () => ws.send(JSON.stringify({ type: 'mse', value: XmLive.codecs() }));
    ws.onmessage = ev => {
      if (this.ws !== ws) return;
      this.lastData = Date.now();
      if (typeof ev.data === 'string'){
        try { const m = JSON.parse(ev.data); if (m.type === 'mse') this._initMse(m.value); else if (m.type === 'error') this.onState('Error: ' + m.value); } catch (_) {}
      } else { const n = Date.now(); this.bytes += ev.data.byteLength; if (this.lastMsg){ this.gaps.push(n - this.lastMsg); if (this.gaps.length > 30) this.gaps.shift(); } this.lastMsg = n; this._append(ev.data); }
    };
    ws.onclose = () => { if (this.ws === ws && !this.stopped){ this.onState('Reconectando vídeo…'); this._retry(); } };
    ws.onerror = () => {};
    clearInterval(this.wd);
    // Vigilante: si no llegan datos durante 8 s se reinicia la conexión.
    this.wd = setInterval(() => { if (!this.stopped && Date.now() - this.lastData > 8000){ this.onState('Reconectando vídeo…'); this._retry(); } }, 3000);
  }
  _retry(){
    clearTimeout(this.rt);
    this.rt = setTimeout(() => { if (!this.stopped) this.start(); }, 1500);
  }
  _initMse(mime){
    const ms = new MediaSource(); this.ms = ms; this.queue = []; this.gotFrame = false; this.mime = mime;
    clearInterval(this.gt); this.gt = setInterval(() => this._gap(), 500);
    this.v.src = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', () => {
      if (this.ms !== ms) return;
      URL.revokeObjectURL(this.v.src);
      try {
        const sb = ms.addSourceBuffer(mime); sb.mode = 'segments'; this.sb = sb;
        sb.addEventListener('updateend', () => this._pump());
        this._pump();
      } catch (e){ this.onState('Códec no soportado: ' + mime); }
    }, { once: true });
    // Primer fotograma pintado: avisa para retirar la captura de relleno.
    this.v.addEventListener('playing', () => {
      if (this.ms === ms && !this.gotFrame){ this.gotFrame = true; this.onState(''); this.onFrame(); }
    }, { once: true });
    this.v.addEventListener('waiting', () => { if (this.ms === ms){ this.stalls++; this._gap(); } });
    this.v.play().catch(() => {});
  }
  /** Si el vídeo se queda esperando en un hueco del búfer, salta al siguiente trozo disponible (evita paradas de varios segundos). */
  _gap(){
    const v = this.v; if (!this.ms || !v.buffered.length || v.paused && !this.gotFrame) return;
    const ct = v.currentTime;
    for (let i = 0; i < v.buffered.length; i++){ if (ct >= v.buffered.start(i) - 0.05 && ct <= v.buffered.end(i) + 0.05) return; }   // dentro de un trozo: nada que hacer
    for (let i = 0; i < v.buffered.length; i++){ if (v.buffered.start(i) > ct){ v.currentTime = v.buffered.start(i) + 0.05; return; } }
    v.currentTime = v.buffered.end(v.buffered.length - 1) - 0.5;
  }
  _append(buf){
    this.queue.push(buf);
    if (this.queue.length > 120) this.queue.splice(0, this.queue.length - 30); // demasiado retraso: descarta lo viejo
    this._pump();
  }
  _pump(){
    const sb = this.sb, v = this.v;
    if (!sb || sb.updating || !this.queue.length || !this.ms || this.ms.readyState !== 'open') return;
    try {
      if (sb.buffered.length){
        const end = sb.buffered.end(sb.buffered.length - 1), start = sb.buffered.start(0), ct = v.currentTime, lag = end - ct;
        // Pegado al directo SIN saltos: si se retrasa se acelera un poco; solo salta si el retraso es enorme.
        if (lag > 5) v.currentTime = end - 1;
        else v.playbackRate = lag > 2.2 ? 1.25 : lag > 1.4 ? 1.08 : 1;
        // Recorte seguro: se conserva un margen largo (10 s) para no borrar fotogramas clave que el vídeo aún necesita.
        if (ct - start > 25){ sb.remove(start, ct - 10); return; }
      }
      sb.appendBuffer(this.queue.shift());
      if (v.paused) v.play().catch(() => {});
    } catch (_) { /* búfer lleno o error transitorio: el vigilante reiniciará si hace falta */ }
  }
  /** Estadísticas del reproductor (para el panel de diagnóstico). */
  stats(){
    const v = this.v, q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null, segs = (Date.now() - this.t0) / 1000;
    const end = v.buffered && v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0, gaps = this.gaps.length ? this.gaps.reduce((a, b) => a + b, 0) / this.gaps.length / 1000 : 0;
    return { codec: this.mime || '—', res: v.videoWidth ? v.videoWidth + '×' + v.videoHeight : '—', mbps: segs > 1 ? (this.bytes * 8 / segs / 1e6) : 0, perdidos: q ? q.droppedVideoFrames : 0, total: q ? q.totalVideoFrames : 0,
      buffer: Math.max(0, end - v.currentTime), cortes: this.stalls, fragmento: gaps, vel: v.playbackRate };
  }
  /** Superpone un panel de estadísticas sobre el vídeo (host = contenedor posicionado). Devuelve una función que lo quita. */
  static panel(player, host, compacto){
    const d = document.createElement('div'); d.className = 'livestats'; host.appendChild(d);
    const t = setInterval(() => {
      if (!d.isConnected){ clearInterval(t); return; } const s = player.stats();
      d.textContent = compacto ? `${s.res} · ${s.mbps.toFixed(1)} Mbps · búfer ${s.buffer.toFixed(1)}s · cortes ${s.cortes} · perdidos ${s.perdidos}`
        : `Códec: ${s.codec}\nImagen: ${s.res}\nCaudal: ${s.mbps.toFixed(2)} Mbps\nBúfer: ${s.buffer.toFixed(1)} s (velocidad ${s.vel.toFixed(2)}×)\nCortes (esperas): ${s.cortes}\nFotogramas perdidos: ${s.perdidos} de ${s.total}\nIntervalo de fragmentos: ${s.fragmento.toFixed(1)} s`;
    }, 1000);
    return () => { clearInterval(t); d.remove(); };
  }
  /** Detiene la reproducción y libera conexiones (soft = reinicio interno, no marca el reproductor como parado). */
  stop(soft){
    if (!soft) this.stopped = true;
    clearInterval(this.wd); clearTimeout(this.rt); clearInterval(this.gt);
    try { this.v.playbackRate = 1; } catch (_) {}
    const ws = this.ws; this.ws = null;
    if (ws){ ws.onclose = null; try { ws.close(); } catch (_) {} }
    this.sb = null; this.queue = [];
    if (this.ms){ try { if (this.ms.readyState === 'open') this.ms.endOfStream(); } catch (_) {} this.ms = null; }
    try { this.v.removeAttribute('src'); this.v.load(); } catch (_) {}
  }
}
