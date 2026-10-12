/**
 * Pantalla de directo de una cámara (equivale a LiveScreen.kt): carrusel de cámaras, vídeo (HD/SD, audio),
 * foto, joystick PTZ, zoom/enfoque con botones de mantener y 6 posiciones guardadas.
 */
(function(){
  const { $, esc, api, store, toast } = XM;
  const id = $('player').dataset.cam;
  let stream = store.get('stream', '1') === '0' ? 0 : 1;
  let audio = false, live = null, video = { disponible: false, mensaje: '' }, snapTimer = null, audioTimer = null;

  const setEstado = t => { $('estado').textContent = t || ''; };
  const srcName = () => `${id}_${stream === 0 ? 'hd' : 'sd'}${audio ? '_a' : ''}`;

  function parar(){
    if (live){ live.stop(); live = null; }
    clearInterval(snapTimer); clearTimeout(audioTimer);
  }

  /** Arranca el directo con la calidad/audio actuales (o capturas si no hay motor de vídeo). */
  function arrancar(){
    parar();
    $('bQ').textContent = stream === 0 ? 'HD' : 'SD';
    $('cHd').classList.toggle('sel', stream === 0); $('cSd').classList.toggle('sel', stream === 1);
    $('bAudio').textContent = audio ? 'Audio' : 'Sin audio';
    if (video.disponible && XmLive.soportado()){
      $('vid').hidden = false; $('snap').hidden = true; $('vid').muted = !audio;
      live = new XmLive($('vid'), srcName(), { onFrame: () => setEstado(''), onState: setEstado });
      live.start();
      if (audio){
        // Sin ffmpeg en el servidor no hay stream con audio: se vuelve al vídeo sin audio.
        audioTimer = setTimeout(() => {
          if ($('vid').readyState < 2){ audio = false; toast('Audio no disponible (el servidor necesita ffmpeg)'); arrancar(); }
        }, 10000);
      }
    } else {
      $('vid').hidden = true; $('snap').hidden = false;
      setEstado(video.disponible ? 'Este navegador no soporta vídeo en directo; se muestran capturas.' : 'Vídeo en directo no disponible (' + video.mensaje + '); se muestran capturas.');
      const tomar = () => { const i = new Image(); i.onload = () => { $('snap').src = i.src; }; i.src = `/api/camaras/${id}/captura?t=${Date.now()}`; };
      tomar(); snapTimer = setInterval(tomar, 1500);
    }
  }

  $('cHd').onclick = () => { stream = 0; arrancar(); };
  $('cSd').onclick = () => { stream = 1; arrancar(); };
  $('bAudio').onclick = () => { audio = !audio; arrancar(); };
  $('bFoto').onclick = async () => {
    setEstado('Capturando…');
    try {
      const r = await fetch(`/api/camaras/${id}/captura?descargar=1&t=${Date.now()}`);
      if (!r.ok) throw new Error();
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob());
      a.download = `xmcam_${Date.now()}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setEstado('Foto guardada en descargas');
    } catch (_) { setEstado('No se pudo capturar'); }
  };

  // ---------------------------------------------------------------- PTZ
  /**
   * Envía el movimiento al servidor. Mientras se mantiene una orden se repite cada 500 ms (latido): si se perdiera
   * la orden de parada, el servidor detiene la cámara solo. `seq` crece siempre para descartar órdenes desordenadas.
   */
  const Ptz = {
    cmd: null, step: 0, n: 0, last: 0, hb: null, tt: null,
    send(cmd, step){
      const seq = Date.now() * 1000 + (this.n++ % 1000);
      fetch(`/api/camaras/${id}/ptz`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, step, seq }), keepalive: true }).catch(() => {});
    },
    set(cmd, step){
      const cambio = cmd !== this.cmd || step !== this.step;
      this.cmd = cmd; this.step = step;
      clearInterval(this.hb); clearTimeout(this.tt);
      if (cmd === null){ this.send(null, 0); setTimeout(() => this.send(null, 0), 90); return; }
      if (cambio){
        const espera = Math.max(0, 70 - (performance.now() - this.last));   // ~14 órdenes/s como máximo
        this.tt = setTimeout(() => { this.last = performance.now(); this.send(this.cmd, this.step); }, espera);
      }
      this.hb = setInterval(() => this.send(this.cmd, this.step), 500);
    }
  };

  const joy = new XmJoystick($('joy'), (cmd, step) => Ptz.set(cmd, step));
  document.querySelectorAll('.hold').forEach(b => {
    b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); Ptz.set(b.dataset.cmd, 5); e.preventDefault(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, () => { if (Ptz.cmd === b.dataset.cmd) Ptz.set(null, 0); }));
    b.addEventListener('contextmenu', e => e.preventDefault());
  });

  // Presets: toque = ir, pulsación larga = guardar la posición actual.
  const pr = $('presets');
  for (let n = 1; n <= 6; n++){
    const b = document.createElement('button'); b.type = 'button'; b.textContent = n; pr.appendChild(b);
    let timer = null, largo = false;
    const ordena = async cmd => {
      try { await api(`/api/camaras/${id}/preset`, 'POST', { cmd, n }); setEstado(cmd === 'SetPreset' ? `Preset ${n} guardado` : `Preset ${n}`); }
      catch (e) { setEstado(e.message); }
    };
    b.addEventListener('pointerdown', () => { largo = false; timer = setTimeout(() => { largo = true; try { navigator.vibrate && navigator.vibrate(30); } catch (_) {} ordena('SetPreset'); }, 600); });
    ['pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => clearTimeout(timer)));
    b.addEventListener('pointerup', () => { clearTimeout(timer); if (!largo) ordena('GotoPreset'); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------------------------------------------------------------- pantalla encendida y ciclo de vida
  let wake = null;
  async function pedirWake(){
    if (store.get('keepOn', 'true') !== 'true' || !navigator.wakeLock) return;
    try { wake = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden){ Ptz.set(null, 0); parar(); }
    else { arrancar(); pedirWake(); }
  });
  window.addEventListener('pagehide', () => { Ptz.set(null, 0); parar(); try { wake && wake.release(); } catch (_) {} });

  // ---------------------------------------------------------------- arranque
  (async () => {
    try {
      const r = await api('/api/camaras'); video = r.video;
      $('carrusel').innerHTML = r.camaras.map(c => `<button class="chip ${c.id === id ? 'sel' : ''}" data-id="${c.id}" type="button">${esc(c.nombre)}</button>`).join('');
      $('carrusel').querySelectorAll('.chip').forEach(b => b.onclick = () => { if (b.dataset.id !== id) location.replace('/camara/' + b.dataset.id); });
    } catch (_) {}
    arrancar(); pedirWake();
    Ptz.send(null, 0);   // abre por adelantado la conexión PTZ para que el primer movimiento sea inmediato
  })();
})();
