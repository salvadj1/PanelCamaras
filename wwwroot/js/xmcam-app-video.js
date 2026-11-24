/**
 * Controles de cristal sobre el vídeo del directo ("Visor"): cambio de cámara, calidad HD/SD, pantalla completa,
 * pausa, sonido, foto, grabar clip, PTZ, posiciones, ajustes rápidos de imagen, estadísticas, imagen en imagen y
 * llenar pantalla. Se ocultan solos a los 3,5 s sin tocar la pantalla.
 *
 * Reutiliza el motor de xmcam-directo.js: sus botones originales siguen existiendo ocultos (#cHd, #cSd, #bAudio, #bFoto,
 * #bStats) y estos controles los accionan; el estado vuelve por el evento "xm:directo".
 */
(function(){
  const { $, esc, store, toast, api } = XM;
  const id = $('player').dataset.cam, ov = $('ov'), stage = $('stage'), vid = $('vid');
  const IC = {
    pause: '<path d="M6 4h3.5v16H6zM14.5 4H18v16h-3.5z" fill="currentColor"/>', play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/>', vol: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    full: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9H7v1M16 9h1v1M8 15H7v-1M16 15h1v-1"/>', exit: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>'
  };
  const svg = n => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const POPS = ['ovCams', 'ovMoreP', 'ovPre', 'ovQp'];
  const pops = () => POPS.map($);
  const popAbierto = () => pops().some(p => !p.hidden);

  // ---------------------------------------------------------------- auto-ocultar
  let timer = 0, arrastrando = false;
  /** Muestra los controles y reinicia la cuenta atrás para ocultarlos. */
  function wake(){
    ov.classList.remove('idle'); clearTimeout(timer);
    timer = setTimeout(() => { if (!popAbierto() && !arrastrando) ov.classList.add('idle'); }, 3500);
  }
  ['pointermove', 'pointerdown', 'touchstart', 'keydown'].forEach(e => stage.addEventListener(e, wake, { passive: true }));
  $('joy').addEventListener('pointerdown', () => { arrastrando = true; });
  window.addEventListener('pointerup', () => { arrastrando = false; wake(); });
  // un toque en el vídeo cierra ventanas o muestra/oculta los controles
  $('player').addEventListener('click', () => {
    if (popAbierto()){ cerrarPops(); return; }
    if (ov.classList.contains('idle')) wake(); else { clearTimeout(timer); ov.classList.add('idle'); }
  });
  wake();

  /** Cierra todas las ventanas flotantes y apaga los botones que las abren. */
  function cerrarPops(){ pops().forEach(p => { p.hidden = true; }); ['ovPreB', 'ovQs', 'ovMore'].forEach(b => $(b).classList.remove('act')); }
  /** Abre (o cierra) una ventana flotante cerrando las demás; devuelve si ha quedado abierta. */
  function abre(p, btn){ const ab = p.hidden; cerrarPops(); p.hidden = !ab; if (btn) $(btn).classList.toggle('act', ab); wake(); return ab; }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (popAbierto()) cerrarPops(); else if (document.body.classList.contains('vmax')) llenar(false); else if (window.XmPanel && XmPanel.abierto()) XmPanel.cerrar();
  });

  // ---------------------------------------------------------------- estado que llega del directo
  const q = $('ovQ');
  document.addEventListener('xm:directo', e => {
    const d = e.detail; q.textContent = d.stream === 0 ? 'HD' : 'SD'; q.classList.toggle('hd', d.stream === 0);
    $('ovAudio').innerHTML = svg(d.audio ? 'vol' : 'mute'); $('ovAudio').classList.toggle('act', d.audio);
    $('ovPlay').innerHTML = svg(d.pausado ? 'play' : 'pause'); $('ovLive').textContent = d.pausado ? 'PAUSA' : 'EN VIVO'; $('ovLive').classList.toggle('pz', d.pausado);
  });
  document.addEventListener('xm:panel', e => $('ovGear').classList.toggle('act', e.detail.open));
  // nombre, IP y estado de la cámara
  fetch('/api/camaras').then(r => r.json()).then(r => {
    const c = (r.camaras || []).find(x => x.id === id);
    if (c){ $('ovNombre').textContent = c.nombre; $('ovSub').textContent = c.host; $('ovDot').className = 'dot ' + (c.online ? 'ok' : 'ko'); }
  }).catch(() => {});

  // ---------------------------------------------------------------- selector de cámara
  let camsListas = false;
  /** Dirección de la misma pestaña/categoría del panel en otra cámara. */
  function destino(n){
    const b = document.body.dataset, abierto = window.XmPanel && XmPanel.abierto();
    return '/camara/' + n + (abierto && b.tab ? '?tab=' + b.tab + (b.tab === 'ajustes' && b.cat ? '&cat=' + b.cat : '') : '');
  }
  async function pintaCams(){
    try {
      const l = (await api('/api/camaras')).camaras;
      $('csLista').innerHTML = l.map(c => `<a class="cs-r${c.id === id ? ' cur' : ''}" href="${destino(c.id)}"><img alt="" loading="lazy" src="/api/camaras/${esc(c.id)}/captura?t=${Math.floor(Date.now() / 20000)}" onerror="this.style.visibility='hidden'"><span class="tt"><b>${esc(c.nombre)}</b><small>${esc(c.host)} · ${c.online ? 'En línea' : 'Sin conexión'}${c.id === id ? ' · viendo ahora' : ''}</small></span></a>`).join('') || '<p class="small mut" style="padding:8px">No hay cámaras.</p>';
      camsListas = true;
    } catch (_) { $('csLista').textContent = 'No se pudo cargar la lista.'; }
  }
  $('ovCam').onclick = () => { if (abre($('ovCams')) && !camsListas) pintaCams(); };

  // ---------------------------------------------------------------- botones
  q.onclick = () => ($('ovQ').classList.contains('hd') ? $('cSd') : $('cHd')).click();
  $('ovAudio').onclick = () => $('bAudio').click();
  $('ovPlay').onclick = () => { if (!window.XmDirecto) return; XmDirecto.enPausa() ? XmDirecto.reanudar() : XmDirecto.pausar(); };
  $('ovFoto').onclick = () => { $('bFoto').click(); const f = $('ovFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };
  $('ovGear').onclick = () => { if (window.XmPanel) XmPanel.alternar(); };

  // Menú "Más opciones"
  $('ovMore').onclick = () => { abre($('ovMoreP'), 'ovMore'); };
  $('mStats').classList.toggle('act', store.get('directoStats', '0') === '1');
  $('mStats').onclick = () => { $('bStats').click(); $('mStats').classList.toggle('act'); cerrarPops(); };
  // Imagen en imagen del navegador: el vídeo flota sobre otras ventanas.
  $('mPip').onclick = async () => {
    cerrarPops();
    try {
      if (document.pictureInPictureElement){ await document.exitPictureInPicture(); return; }
      if (!document.pictureInPictureEnabled || vid.hidden) throw new Error();
      await vid.requestPictureInPicture();
    } catch (_) { toast('Imagen en imagen no disponible en este navegador o sin vídeo en directo'); }
  };
  /** Llenar pantalla: el vídeo recorta los bordes para cubrir toda la ventana y el panel se cierra. */
  function llenar(on){
    document.body.classList.toggle('vmax', on); $('mFill').classList.toggle('act', on);
    if (on && window.XmPanel) XmPanel.cerrar();
    wake();
  }
  $('mFill').onclick = () => { cerrarPops(); llenar(!document.body.classList.contains('vmax')); };
  $('player').addEventListener('dblclick', () => llenar(!document.body.classList.contains('vmax')));
  // Pantalla completa del navegador (con respaldo: si lo bloquea, se llena la pantalla).
  $('ovFs').onclick = async () => {
    try {
      if (document.fullscreenElement){ await document.exitFullscreen(); return; }
      await stage.requestFullscreen();
    } catch (_) { llenar(true); toast('Pantalla completa no disponible: se ha llenado la ventana'); }
  };
  document.addEventListener('fullscreenchange', () => { const f = !!document.fullscreenElement; $('ovFs').innerHTML = svg(f ? 'exit' : 'full'); stage.classList.toggle('fs', f); });

  // PTZ: rueda de cristal (se recuerda por cámara)
  const ptz = $('ovPtz'), pintaPtz = on => { ptz.hidden = !on; $('ovPtzB').classList.toggle('act', on); };
  pintaPtz(store.get('ovPtz_' + id, '0') === '1');
  $('ovPtzB').onclick = () => { const on = ptz.hidden; pintaPtz(on); store.set('ovPtz_' + id, on ? '1' : '0'); wake(); };
  $('ovPreB').onclick = () => { abre($('ovPre'), 'ovPreB'); };

  // Ajustes rápidos: el mismo editor de "Imagen" que en el panel, montado sobre el vídeo.
  let qListo = false;
  $('ovQs').onclick = () => {
    const ab = abre($('ovQp'), 'ovQs');
    if (ab && !qListo){ qListo = true; XmConfig.mount($('ovQBody'), { id, name: 'Camera.Param', titulo: false }); }
  };
  $('ovQx').onclick = cerrarPops;
  $('ovQall').onclick = () => { cerrarPops(); if (window.XmPanel) XmPanel.abrir('ajustes', 'img'); };

  // Grabar un clip en este dispositivo (MediaRecorder sobre el propio vídeo; sale en WebM).
  let rec = null, chunks = [], t0 = 0, rt = 0;
  const formato = () => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  $('ovGrab').onclick = () => {
    if (rec){ rec.stop(); return; }
    try {
      if (!vid.captureStream && !vid.mozCaptureStream) throw new Error('Este navegador no permite grabar el vídeo');
      if (vid.hidden || vid.readyState < 2) throw new Error('No hay vídeo en directo que grabar');
      const st = (vid.captureStream || vid.mozCaptureStream).call(vid); chunks = [];
      rec = new MediaRecorder(st, formato() ? { mimeType: formato() } : undefined);
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(rt); $('ovRec').hidden = true; $('ovGrab').classList.remove('act'); rec = null;
        if (!chunks.length){ toast('El clip quedó vacío'); return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
        a.download = `xmcam_clip_${Date.now()}.webm`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 8000); toast('Clip guardado en descargas');
      };
      rec.start(1000); t0 = Date.now(); $('ovRec').hidden = false; $('ovGrab').classList.add('act');
      rt = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('ovRecT').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 500);
    } catch (e) { toast(e.message || 'No se pudo empezar a grabar'); rec = null; }
  };
  window.addEventListener('pagehide', () => { try { rec && rec.stop(); } catch (_) {} });
  window.XmOverlay = { wake, cerrarPops };
})();
