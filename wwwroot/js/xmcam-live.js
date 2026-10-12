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
    this.ws = ws; this.lastData = Date.now();
    ws.onopen = () => ws.send(JSON.stringify({ type: 'mse', value: XmLive.codecs() }));
    ws.onmessage = ev => {
      if (this.ws !== ws) return;
      this.lastData = Date.now();
      if (typeof ev.data === 'string'){
        try { const m = JSON.parse(ev.data); if (m.type === 'mse') this._initMse(m.value); else if (m.type === 'error') this.onState('Error: ' + m.value); } catch (_) {}
      } else this._append(ev.data);
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
    const ms = new MediaSource(); this.ms = ms; this.queue = []; this.gotFrame = false;
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
    this.v.play().catch(() => {});
  }
  _append(buf){
    this.queue.push(buf);
    if (this.queue.length > 120) this.queue.splice(0, this.queue.length - 30); // demasiado retraso: descarta lo viejo
    this._pump();
  }
  _pump(){
    const sb = this.sb;
    if (!sb || sb.updating || !this.queue.length || !this.ms || this.ms.readyState !== 'open') return;
    try {
      // Mantener poco búfer y pegado al directo.
      if (sb.buffered.length){
        const end = sb.buffered.end(sb.buffered.length - 1), start = sb.buffered.start(0);
        if (this.v.currentTime < end - 1.2) this.v.currentTime = end - 0.3;
        if (this.v.currentTime - start > 6){ sb.remove(start, this.v.currentTime - 3); return; }
      }
      sb.appendBuffer(this.queue.shift());
      if (this.v.paused) this.v.play().catch(() => {});
    } catch (_) { /* búfer lleno o error transitorio: el vigilante reiniciará si hace falta */ }
  }
  /** Detiene la reproducción y libera conexiones (soft = reinicio interno, no marca el reproductor como parado). */
  stop(soft){
    if (!soft) this.stopped = true;
    clearInterval(this.wd); clearTimeout(this.rt);
    const ws = this.ws; this.ws = null;
    if (ws){ ws.onclose = null; try { ws.close(); } catch (_) {} }
    this.sb = null; this.queue = [];
    if (this.ms){ try { if (this.ms.readyState === 'open') this.ms.endOfStream(); } catch (_) {} this.ms = null; }
    try { this.v.removeAttribute('src'); this.v.load(); } catch (_) {}
  }
}
