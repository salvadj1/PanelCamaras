/**
 * Controles transparentes sobre el vídeo del directo (estilo reproductor profesional):
 * pausa, sonido, foto, grabar clip, PTZ (rueda), posiciones, ajustes rápidos de imagen, calidad HD/SD, estadísticas,
 * minimizar (imagen en imagen), maximizar y pantalla completa. Se ocultan solos a los 3,5 s sin tocar.
 *
 * Reutiliza lo que ya hace xmcam-directo.js: los botones originales (#cHd, #cSd, #bAudio, #bFoto, #bStats) siguen
 * existiendo ocultos y estos controles los accionan; el estado vuelve por el evento "xm:directo".
 */
(function(){
  const { $, store, toast } = XM;
  const id = $('player').dataset.cam, ov = $('ov'), stage = $('stage'), vid = $('vid');
  const IC = {
    pause: '<path d="M6 4h3.5v16H6zM14.5 4H18v16h-3.5z" fill="currentColor"/>', play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/>', vol: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    max: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', min: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    full: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9H7v1M16 9h1v1M8 15H7v-1M16 15h1v-1"/>', exit: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>'
  };
  const svg = n => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const pops = () => [$('ovPre'), $('ovQp')];
  const popAbierto = () => pops().some(p => !p.hidden);

  // ---------------------------------------------------------------- auto-ocultar
  let timer = 0, arrastrando = false;
  function wake(){
    ov.classList.remove('idle'); clearTimeout(timer);
    timer = setTimeout(() => { if (!popAbierto() && !arrastrando) ov.classList.add('idle'); }, 3500);
  }
  ['pointermove', 'pointerdown', 'touchstart', 'keydown'].forEach(e => stage.addEventListener(e, wake, { passive: true }));
  $('joy').addEventListener('pointerdown', () => { arrastrando = true; });
  window.addEventListener('pointerup', () => { arrastrando = false; wake(); });
  // un toque en el vídeo muestra/oculta los controles
  $('player').addEventListener('click', () => { if (popAbierto()){ cerrarPops(); return; } if (ov.classList.contains('idle')) wake(); else { clearTimeout(timer); ov.classList.add('idle'); } });
  wake();

  function cerrarPops(){ pops().forEach(p => { p.hidden = true; }); }
  function abre(p){ const ab = p.hidden; cerrarPops(); p.hidden = !ab; wake(); return ab; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (popAbierto()) cerrarPops(); else if (document.body.classList.contains('vmax')) maximizar(false); } });

  // ---------------------------------------------------------------- estado que llega del directo
  const q = $('ovQ');
  document.addEventListener('xm:directo', e => {
    const d = e.detail; q.textContent = d.stream === 0 ? 'HD' : 'SD'; q.classList.toggle('hd', d.stream === 0);
    $('ovAudio').innerHTML = svg(d.audio ? 'vol' : 'mute'); $('ovAudio').classList.toggle('act', d.audio);
    $('ovPlay').innerHTML = svg(d.pausado ? 'play' : 'pause'); $('ovLive').textContent = d.pausado ? 'PAUSA' : 'EN VIVO'; $('ovLive').classList.toggle('pz', d.pausado);
  });
  // nombre e IP de la cámara
  fetch('/api/camaras').then(r => r.json()).then(r => { const c = (r.camaras || []).find(x => x.id === id); if (c){ $('ovNombre').textContent = c.nombre; $('ovSub').textContent = c.host; } }).catch(() => {});

  // ---------------------------------------------------------------- botones
  q.onclick = () => ($('ovQ').classList.contains('hd') ? $('cSd') : $('cHd')).click();
  $('ovStats').onclick = () => { $('bStats').click(); $('ovStats').classList.toggle('act'); };
  $('ovStats').classList.toggle('act', store.get('directoStats', '0') === '1');
  $('ovAudio').onclick = () => $('bAudio').click();
  $('ovPlay').onclick = () => { if (!window.XmDirecto) return; XmDirecto.enPausa() ? XmDirecto.reanudar() : XmDirecto.pausar(); };
  $('ovFoto').onclick = () => { $('bFoto').click(); const f = $('ovFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };

  // Maximizar: oculta cabecera, raíl y hoja; el vídeo ocupa toda la ventana.
  function maximizar(on){
    document.body.classList.toggle('vmax', on); $('ovMax').innerHTML = svg(on ? 'min' : 'max'); $('ovMax').title = on ? 'Restaurar' : 'Maximizar'; wake();
  }
  $('ovMax').onclick = () => maximizar(!document.body.classList.contains('vmax'));
  $('player').addEventListener('dblclick', () => maximizar(!document.body.classList.contains('vmax')));
  // Pantalla completa del navegador (con respaldo: si lo bloquea, se maximiza).
  $('ovFs').onclick = async () => {
    try {
      if (document.fullscreenElement){ await document.exitFullscreen(); return; }
      await stage.requestFullscreen();
    } catch (_) { maximizar(true); toast('Pantalla completa no disponible: se ha maximizado'); }
  };
  document.addEventListener('fullscreenchange', () => { const f = !!document.fullscreenElement; $('ovFs').innerHTML = svg(f ? 'exit' : 'full'); stage.classList.toggle('fs', f); });
  // Minimizar = imagen en imagen del navegador: el vídeo flota sobre otras ventanas.
  $('ovMin').onclick = async () => {
    try {
      if (document.pictureInPictureElement){ await document.exitPictureInPicture(); return; }
      if (!document.pictureInPictureEnabled || vid.hidden) throw new Error();
      await vid.requestPictureInPicture();
    } catch (_) { toast('Imagen en imagen no disponible en este navegador o sin vídeo en directo'); }
  };

  // PTZ: rueda transparente (se recuerda por cámara)
  const ptz = $('ovPtz'), pintaPtz = on => { ptz.hidden = !on; $('ovPtzB').classList.toggle('act', on); };
  pintaPtz(store.get('ovPtz_' + id, '0') === '1');
  $('ovPtzB').onclick = () => { const on = ptz.hidden; pintaPtz(on); store.set('ovPtz_' + id, on ? '1' : '0'); wake(); };
  $('ovPreB').onclick = () => { abre($('ovPre')); };

  // Ajustes rápidos: el mismo editor de "Imagen" que en la hoja, montado sobre el vídeo.
  let qListo = false;
  $('ovQs').onclick = () => {
    const ab = abre($('ovQp')); $('ovQs').classList.toggle('act', ab);
    if (ab && !qListo){ qListo = true; XmConfig.mount($('ovQBody'), { id, name: 'Camera.Param', titulo: false }); }
  };
  $('ovQx').onclick = () => { cerrarPops(); $('ovQs').classList.remove('act'); };
  $('ovQall').onclick = () => { cerrarPops(); $('ovQs').classList.remove('act'); if (window.XmHoja) XmHoja.abrir('ajustes', 'img'); };

  // Grabar un clip en este dispositivo (MediaRecorder sobre el propio vídeo; sale en WebM).
  let rec = null, chunks = [], t0 = 0, rt = 0;
  function formato(){ return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''; }
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
