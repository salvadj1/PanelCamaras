/**
 * Grabaciones de la tarjeta SD de una cámara (equivale a PlaybackScreen.kt + ClipPlayerScreen.kt): selector de 7 días,
 * rejilla de clips con miniatura (foto de alarma si existe, si no el primer fotograma del clip) y reproductor.
 */
(function(){
  const { $, esc, api, toast } = XM;
  const camId = location.pathname.split('/')[2];
  const MARGEN = 10000;   // ms: una alarma cuenta como "del clip" si cae ±10 s dentro
  let dia = null, archivos = [], eventos = [], genAbort = null, genGen = 0, player = null, descAbort = null, actual = null;

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ms = s => new Date(s.replace(' ', 'T')).getTime();
  const durSeg = f => Math.max(0, Math.round((ms(f.EndTime) - ms(f.BeginTime)) / 1000));
  const fmtDur = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60); return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
  /** Motivo según la etiqueta del nombre de archivo: [M] movimiento, [A] alarma, [H] manual, [R] continua. */
  const motivo = n => ({ M: 'Movimiento', A: 'Alarma', H: 'Manual', R: 'Grabación continua' }[((/\[([A-Za-z])\]/.exec(n || '') || [])[1] || '').toUpperCase()] || 'Grabación');

  // ---- caché de miniaturas en IndexedDB
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('xmcam', 1); r.onupgradeneeded = () => r.result.createObjectStore('th'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const thGet = async k => { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('th').objectStore('th').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (_) { return null; } };
  const thSet = async (k, v) => { try { const db = await idb(); db.transaction('th', 'readwrite').objectStore('th').put(v, k); } catch (_) {} };
  const thKey = f => `${camId}|${f.BeginTime}`;

  // ---- días
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d; });
  $('dias').innerHTML = dias.map((d, i) => `<button type="button" class="chip" data-i="${i}">${i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1)}</button>`).join('');
  $('dias').querySelectorAll('.chip').forEach(b => b.onclick = () => elegirDia(+b.dataset.i));

  async function elegirDia(i){
    if (genAbort) genAbort.abort();
    $('dias').querySelectorAll('.chip').forEach((b, k) => b.classList.toggle('sel', k === i));
    dia = ymd(dias[i]); $('msg').textContent = 'Cargando…'; $('clips').innerHTML = ''; $('gen').hidden = true;
    try {
      const [l, ev] = await Promise.all([api(`/api/camaras/${camId}/sd?dia=${dia}`), api('/api/eventos').catch(() => [])]);
      eventos = ev.filter(e => e.camaraId === camId);
      archivos = (l || []).filter(f => f.FileName).sort((a, b) => b.BeginTime.localeCompare(a.BeginTime));
      $('msg').textContent = archivos.length ? `${archivos.length} grabaciones` : 'Sin grabaciones este día';
      pintar(); generar();
    } catch (x) { $('msg').textContent = 'Error: ' + x.message; }
  }

  /** Foto de alarma que cae dentro del clip (la primera con foto). */
  function fotoEvento(f){
    const b = ms(f.BeginTime), e = ms(f.EndTime);
    const c = eventos.filter(x => x.hora >= b - MARGEN && x.hora <= e + MARGEN);
    return (c.find(x => x.foto) || {}).foto || null;
  }

  function pintar(){
    $('clips').innerHTML = archivos.map((f, i) => {
      const foto = fotoEvento(f);
      return `<div class="sdc" data-i="${i}"><div class="th" id="th${i}">${foto ? `<img src="${foto}" alt="">` : 'Sin miniatura'}</div><div class="in"><div>${esc(f.BeginTime.slice(11))}</div><div class="mut">${esc(motivo(f.FileName))} · ${fmtDur(durSeg(f))}</div></div></div>`;
    }).join('');
    $('clips').querySelectorAll('.sdc').forEach(c => c.onclick = () => abrir(archivos[+c.dataset.i]));
    archivos.forEach(async (f, i) => { if (fotoEvento(f)) return; const b = await thGet(thKey(f)); if (b) ponerMini(i, b); });
  }
  const ponerMini = (i, blob) => { const el = $('th' + i); if (el) el.innerHTML = `<img alt="" src="${URL.createObjectURL(blob)}">`; };

  /** Genera, una a una, las miniaturas que faltan (máx. 30) descargando solo el principio de cada clip. */
  async function generar(){
    if (!window.VideoDecoder) return;
    const mi = ++genGen;
    const pend = [];
    for (let i = 0; i < archivos.length && pend.length < 30; i++) if (!fotoEvento(archivos[i]) && !(await thGet(thKey(archivos[i])))) pend.push(i);
    if (!pend.length || mi !== genGen) return;
    genAbort = new AbortController(); const sg = genAbort.signal;
    $('gen').hidden = false; $('genReint').hidden = true; $('genBar').max = pend.length; $('genBar').value = 0;
    let fallos = 0, hechos = 0;
    for (const i of pend){
      if (sg.aborted || mi !== genGen) return;
      try { const b = await XmClip.miniatura(camId, archivos[i], sg); await thSet(thKey(archivos[i]), b); ponerMini(i, b); fallos = 0; }
      catch (x) { if (sg.aborted) return; if (++fallos >= 2){ $('genTxt').textContent = 'No se pudieron generar las miniaturas (la cámara o el navegador no pudieron leer el inicio de los clips).'; $('genReint').hidden = false; return; } }
      $('genBar').value = ++hechos; $('genTxt').textContent = `Generando miniaturas ${hechos}/${pend.length}…`;
    }
    $('gen').hidden = true;
  }
  $('genReint').onclick = generar;

  // ---- reproductor
  async function abrir(f){
    if (genAbort) genAbort.abort();      // la cámara solo atiende una descarga a la vez
    actual = f; $('cTitulo').textContent = `${f.BeginTime.slice(11)} · ${motivo(f.FileName)}`;
    $('cMsg').textContent = 'Descargando… 0 MB'; $('cPos').value = 0; $('cTiempo').textContent = '0:00 / ' + fmtDur(durSeg(f));
    $('dlgClip').showModal();
    descAbort = new AbortController();
    try {
      const raw = await XmClip.descargar(camId, f, 0, descAbort.signal, n => { $('cMsg').textContent = `Descargando… ${(n / 1048576).toFixed(1)} MB`; });
      actual.raw = raw;
      $('cMsg').textContent = 'Preparando…';
      player = new XmClip.Player($('cv'), raw, durSeg(f) || 30, ev => estado(ev));
      await player.iniciar();
      $('cMsg').textContent = ''; $('cMute').disabled = !player.tieneAudio; $('cMute').textContent = player.tieneAudio ? 'Audio' : 'Sin audio';
      $('cPlay').textContent = 'Pausa';
    } catch (x) { if (!descAbort.signal.aborted) $('cMsg').textContent = x.message; }
  }
  function estado(ev){
    if (!player) return;
    if (ev === 'fin') $('cPlay').textContent = 'Repetir';
    $('cTiempo').textContent = fmtDur(player.clock) + ' / ' + fmtDur(player.dur);
    if (!arrastrando) $('cPos').value = Math.round(1000 * player.clock / player.dur);
  }
  let arrastrando = false;
  $('cPos').addEventListener('pointerdown', () => arrastrando = true);
  $('cPos').addEventListener('input', () => { if (player) player.saltar(player.dur * $('cPos').value / 1000); });
  $('cPos').addEventListener('change', () => { arrastrando = false; });
  $('cPlay').onclick = () => { if (!player) return; player.alternar(); $('cPlay').textContent = player.pausado ? 'Reproducir' : 'Pausa'; };
  $('cMute').onclick = () => { if (!player) return; const m = !player.mudo; player.silencio(m); $('cMute').textContent = m ? 'Silenciado' : 'Audio'; };
  $('cFoto').onclick = async () => {
    if (!player) return; const b = await player.foto(); if (!b) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `foto_${actual.BeginTime.replace(/[: ]/g, '-')}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('cDesc').onclick = () => {
    if (!actual || !actual.raw) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([actual.raw])); a.download = `clip_${actual.BeginTime.replace(/[: ]/g, '-')}.xm`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  function cerrar(){
    if (descAbort) descAbort.abort();
    if (player){ player.cerrar(); player = null; }
    if ($('dlgClip').open) $('dlgClip').close();
    actual = null;
    if (archivos.length) generar();   // reanuda las miniaturas pendientes
  }
  $('cCerrar').onclick = cerrar;
  $('dlgClip').addEventListener('cancel', e => { e.preventDefault(); cerrar(); });
  window.addEventListener('pagehide', () => { if (genAbort) genAbort.abort(); if (descAbort) descAbort.abort(); });

  elegirDia(0);
})();
