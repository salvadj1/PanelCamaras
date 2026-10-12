/* Ajustes de la web: tema, vídeo, avisos, almacenamiento, red, sistema y copia de seguridad. */
(function(){
  const { $, store, THEMES, applyTheme, esc } = XM;
  function drawThemes(){
    const sel = store.get('theme', 'NVR_DARK');
    $('temas').innerHTML = THEMES.map(t => `
      <button class="themecard ${t.id === sel ? 'sel' : ''}" data-id="${t.id}" type="button">
        <span class="swatch" style="background:${t.c}"></span>
        <span><b>${esc(t.label)}</b><br><span class="mut small">${esc(t.desc)}</span></span>
      </button>`).join('');
    $('temas').querySelectorAll('.themecard').forEach(b => b.onclick = () => { store.set('theme', b.dataset.id); applyTheme(); drawThemes(); });
  }
  $('sFollow').checked = store.get('follow', 'true') === 'true';
  $('sFollow').onchange = e => { store.set('follow', e.target.checked); applyTheme(); };
  function drawStream(){
    const s = store.get('stream', '1');
    $('sHd').classList.toggle('sel', s === '0'); $('sSd').classList.toggle('sel', s === '1');
  }
  $('sHd').onclick = () => { store.set('stream', 0); drawStream(); };
  $('sSd').onclick = () => { store.set('stream', 1); drawStream(); };
  $('sKeep').checked = store.get('keepOn', 'true') === 'true';
  $('sKeep').onchange = e => store.set('keepOn', e.target.checked);
  // Calidad del mosaico: auto | hd | sd
  function drawMosaico(){
    const q = store.get('mosaicoQ', 'auto');
    $('mAuto').classList.toggle('sel', q !== 'hd' && q !== 'sd'); $('mHd').classList.toggle('sel', q === 'hd'); $('mSd').classList.toggle('sel', q === 'sd');
  }
  [['mAuto', 'auto'], ['mHd', 'hd'], ['mSd', 'sd']].forEach(([id, v]) => $(id).onclick = () => { store.set('mosaicoQ', v); drawMosaico(); });
  drawThemes(); drawStream(); drawMosaico();
})();

// Avisos: interruptor de la web, permiso del navegador y opciones del servidor.
(function(){
  const { $, store, api, toast, esc } = XM;
  $('sAvisos').checked = store.get('avisos', 'true') === 'true';
  $('sAvisos').onchange = e => store.set('avisos', e.target.checked);
  function estadoNotif(){
    const ok = !!window.Notification, p = ok ? Notification.permission : 'unsupported';
    $('notifEstado').textContent = !ok ? 'Este navegador no admite notificaciones.' : p === 'granted' ? 'Permitidas en este navegador.' : p === 'denied' ? 'Bloqueadas: cámbialo en los permisos del sitio del navegador.' : 'Aún no has dado permiso.';
    $('bNotif').hidden = p !== 'default'; $('bProbar').hidden = p !== 'granted';
  }
  $('bNotif').onclick = async () => { await Notification.requestPermission(); estadoNotif(); };
  $('bProbar').onclick = () => { try { new Notification('Panel Camaras', { body: 'Así se verán los avisos.' }); } catch (_) { toast('No se pudo mostrar la notificación'); } };
  estadoNotif();
  api('/api/reglas').then(r => {
    $('sFotoAuto').checked = !!r.fotoAutomatica;
    $('sFotoAuto').onchange = e => api('/api/alarmas/foto-automatica?valor=' + e.target.checked, 'PUT').catch(x => toast(x.message));
    $('sPerfil').innerHTML = r.perfiles.map(p => `<option ${p === r.perfilActivo ? 'selected' : ''}>${esc(p)}</option>`).join('');
    $('sPerfil').onchange = e => api('/api/perfiles/activo?nombre=' + encodeURIComponent(e.target.value), 'PUT').then(() => toast('Perfil: ' + e.target.value)).catch(x => toast(x.message));
  }).catch(() => { $('sFotoAuto').disabled = true; $('sPerfil').disabled = true; });
})();

// Almacenamiento, red y sistema (datos del servidor).
(function(){
  const { $, api, toast, esc, confirmar } = XM;
  const mb = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : (n / 1048576).toFixed(1) + ' MB';
  const fila = (k, v) => `<b>${esc(k)}</b><span>${v}</span>`;
  function dur(ms){ const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60); return (d ? d + ' d ' : '') + h + ' h ' + (m % 60) + ' min'; }
  async function cargar(){
    try {
      const s = await api('/api/sistema');
      const pto = ':7001', nombre = 'https://' + s.equipo + pto;
      $('dirNombre').textContent = nombre; $('bAbrir').href = nombre;
      $('bCopiar').onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(nombre) : Promise.reject()).then(() => toast('Dirección copiada')).catch(() => toast(nombre)); };
      $('kvRed').innerHTML = fila('Esta página', esc(location.origin)) + fila('Conexión', location.protocol === 'https:' ? 'HTTPS (cifrada)' : 'HTTP (sin cifrar)')
        + fila('Por IP', s.ips.length ? s.ips.map(i => `https://${esc(i)}${pto}`).join('<br>') : 'Sin red');
      $('kvAlm').innerHTML = fila('Eventos guardados', s.eventos) + fila('Fotos de alarma', mb(s.fotosBytes)) + fila('Miniaturas de la SD', mb(s.miniaturasBytes))
        + fila('Rutas de grabaciones', s.rutas.length ? s.rutas.map(r => esc(r.nombre) + (r.disponible ? '' : ' (no disponible)')).join('<br>') : 'Ninguna');
      $('kvSis').innerHTML = fila('Versión', esc(s.version || '—')) + fila('Sistema', esc(s.so)) + fila('Runtime', esc(s.runtime))
        + fila('En marcha desde hace', dur(Date.now() - s.inicio)) + fila('Cámaras', `${s.camaras} (${s.vigilando} vigiladas)`)
        + fila('Conversor de vídeo (go2rtc)', (s.go2rtc.disponible ? '✓ ' : '✗ ') + esc(s.go2rtc.mensaje))
        + fila('ffmpeg (audio en directo)', s.ffmpeg ? '✓ Disponible' : '✗ No encontrado (carpeta ffmpeg junto al programa)');
    } catch (x) { $('kvAlm').textContent = x.message; $('kvSis').textContent = x.message; }
  }
  $('bMini').onclick = async () => {
    if (!await confirmar('¿Borrar las miniaturas?', 'Se volverán a crear al abrir las grabaciones de cada cámara.', 'Borrar')) return;
    try { await api('/api/sistema/miniaturas', 'DELETE'); toast('Miniaturas borradas'); cargar(); } catch (x) { toast(x.message); }
  };
  $('bGo2rtc').onclick = async () => {
    try { await api('/api/sistema/reiniciar-go2rtc', 'POST'); toast('Reiniciando el conversor de vídeo…'); setTimeout(cargar, 2500); } catch (x) { toast(x.message); }
  };
  cargar();
})();

// Copia de seguridad: reglas y perfiles del servidor + preferencias de esta web (localStorage "xm.*").
(function(){
  const { $, api, toast } = XM;
  const claves = () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k.startsWith('xm.') && k !== 'xm.ultimoEvento') o[k] = localStorage.getItem(k); } } catch (_) {} return o; };
  $('bExp').onclick = async () => {
    try {
      const c = await api('/api/copia'); c.web = claves(); c.app = 'PanelCamaras'; c.fecha = new Date().toISOString();
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }));
      a.download = 'PanelCamaras_copia_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (x) { toast(x.message); }
  };
  $('bImp').onclick = () => $('fImp').click();
  $('fImp').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const c = JSON.parse(await f.text());
      if (c.app !== 'PanelCamaras') throw new Error('No es una copia de Panel Camaras');
      if (!await XM.confirmar('¿Importar la copia?', 'Sustituirá las reglas, los perfiles y las preferencias actuales.', 'Importar')) return;
      const r = await api('/api/copia', 'PUT', { reglas: c.reglas, perfiles: c.perfiles, perfilActivo: c.perfilActivo, fotoAutomatica: c.fotoAutomatica });
      Object.entries(c.web || {}).forEach(([k, v]) => { if (k.startsWith('xm.')) try { localStorage.setItem(k, String(v)); } catch (_) {} });
      toast(`Copia importada (${r.reglas} reglas)`); setTimeout(() => location.reload(), 900);
    } catch (x) { toast(x.message); }
  };
})();

// Estado de la conexión (certificado) en la sección de seguridad.
(function(){
  const el = document.getElementById('certEstado'); if (!el) return;
  el.textContent = location.protocol === 'https:'
    ? 'Conexión segura (HTTPS) activa en este equipo.'
    : 'Esta página va por HTTP sin cifrar. Instala el certificado y abre la dirección https.';
})();
