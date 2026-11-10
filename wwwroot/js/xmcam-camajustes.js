/**
 * Pestañas Ajustes e Info de una cámara (equivale a SettingsScreen.kt y CameraInfoPanel.kt).
 * Cambia entre paneles sin recargar y gestiona nombre, vigilancia, hash RTSP, bloques de configuración,
 * sincronizar hora y reinicio.
 */
(function(){
  const { $, esc, api, toast, confirmar, pedirTexto } = XM;
  const id = $('player').dataset.cam;
  const P = { directo: $('pDirecto'), ajustes: $('pAjustes'), info: $('pInfo') };
  let cam = null, infoCargada = false;

  /** Muestra un panel; el vídeo se detiene al salir del directo para no gastar red. */
  function ir(p){
    Object.keys(P).forEach(k => P[k].hidden = k !== p);
    $('tabs').querySelectorAll('[data-p]').forEach(a => a.classList.toggle('sel', a.dataset.p === p));
    $('sheet').classList.toggle('sinptz', p !== 'directo');
    document.querySelector('.cambody').classList.toggle('fuera', p !== 'directo');   // fuera del directo: iconos arriba y contenido a todo el ancho   // fuera del directo solo queda la fila de iconos
    if (p === 'info' && !infoCargada) cargarInfo();
  }
  $('tabs').querySelectorAll('[data-p]').forEach(a => a.onclick = e => { e.preventDefault(); ir(a.dataset.p); });

  const lista = () => api('/api/camaras').then(r => r.camaras.find(c => c.id === id));
  const patch = body => api('/api/camaras/' + id, 'PATCH', body);

  function pintarCamara(){
    $('cVigilar').checked = !!cam.vigilar; $('cHash').checked = !!cam.rtspHash;
    $('iNombre').textContent = cam.nombre;
    $('iConex').innerHTML = [['Dirección', cam.host + ':' + cam.puerto], ['Usuario', cam.usuario], ['Canal', cam.canal],
      ['Puerto RTSP', cam.puertoRtsp], ['Puerto HTTP', cam.puertoHttp], ['Estado', cam.online ? 'En línea' : 'Sin conexión']]
      .map(([k, v]) => `<div class="setrow" style="padding:4px 0"><div class="mut">${k}</div><div>${esc(v)}</div></div>`).join('');
  }

  $('bloques').innerHTML = XmSchemas.BLOCKS.map(([t, d, n, f]) =>
    `<a class="blk" href="/camara/${id}/config?name=${encodeURIComponent(n)}${f ? '&filter=' + encodeURIComponent(f) : ''}"><div>${esc(t)}</div><div class="mut">${esc(d)}</div></a>`).join('');
  $('bloqueIr').onclick = () => { const n = $('bloqueOtro').value.trim(); if (n) location.href = `/camara/${id}/config?name=${encodeURIComponent(n)}`; };

  $('cVigilar').onchange = async e => { try { await patch({ vigilar: e.target.checked }); } catch (x) { toast(x.message); e.target.checked = !e.target.checked; } };
  $('cHash').onchange = async e => { try { await patch({ rtspHash: e.target.checked }); toast('Aplicado. Reabre el directo.'); } catch (x) { toast(x.message); e.target.checked = !e.target.checked; } };

  $('bHora').onclick = async () => { try { await api(`/api/camaras/${id}/hora`, 'POST'); toast('Hora sincronizada'); } catch (x) { toast(x.message); } };
  $('bReinicio').onclick = async () => {
    if (!await confirmar('¿Reiniciar la cámara?', 'Estará unos minutos sin conexión.', 'Reiniciar')) return;
    try { await api(`/api/camaras/${id}/reiniciar`, 'POST'); toast('Reiniciando…'); } catch (x) { toast(x.message); }
  };
  $('bNombre').onclick = async () => {
    const n = await pedirTexto('Nombre de la cámara', cam.nombre); if (n === null || !n.trim()) return;
    try { await patch({ nombre: n.trim() }); cam.nombre = n.trim(); pintarCamara(); toast('Nombre cambiado'); } catch (x) { toast(x.message); }
  };

  async function cargarInfo(){
    try {
      const r = await api(`/api/camaras/${id}/info`); infoCargada = true;
      const filas = Object.entries(r.sistema || {}).map(([k, v]) => [k, v]);
      if (r.hora) filas.push(['Hora de la cámara', r.hora]);
      $('iSis').innerHTML = filas.map(([k, v]) => `<div class="setrow" style="padding:4px 0"><div class="mut">${esc(k)}</div><div>${esc(v)}</div></div>`).join('') || 'Sin datos';
    } catch (x) { $('iSis').textContent = x.message; }
  }

  // ---- Conexión: cambiar IP/puertos/credenciales sin volver a añadir la cámara
  const num = (el, def) => parseInt($(el).value) || def;
  function rellenarForm(){
    $('fHost').value = cam.host; $('fPuerto').value = cam.puerto; $('fCanal').value = cam.canal; $('fUser').value = cam.usuario;
    $('fRtsp').value = cam.puertoRtsp; $('fHttp').value = cam.puertoHttp; $('fPass').value = '';
  }
  $('bBuscarIp').onclick = async () => {
    const b = $('bBuscarIp'); b.disabled = true; b.textContent = 'Buscando…'; $('fMsg').textContent = '';
    try {
      const hall = await api('/api/camaras/buscar', 'POST');
      $('fHallados').innerHTML = hall.map((f, i) => `<button class="btn out" style="width:100%;margin-top:4px" data-i="${i}" type="button">${esc(f.nombre)} · ${esc(f.ip)}</button>`).join('');
      $('fHallados').querySelectorAll('button').forEach(x => x.onclick = () => { const f = hall[+x.dataset.i]; $('fHost').value = f.ip; $('fPuerto').value = f.puertoTcp || cam.puerto; });
      if (!hall.length) $('fMsg').textContent = 'No se encontró ninguna cámara. Escribe la IP a mano.';
    } catch (x) { $('fMsg').textContent = x.message; }
    b.disabled = false; b.textContent = 'Buscar en la red';
  };
  $('bGuardarCon').onclick = async () => {
    if (!$('fHost').value.trim()){ toast('Falta la IP'); return; }
    $('fMsg').textContent = 'Probando conexión…';
    try {
      await patch({ host: $('fHost').value.trim(), puerto: num('fPuerto', 34567), canal: num('fCanal', 0), usuario: $('fUser').value.trim(),
        password: $('fPass').value, puertoRtsp: num('fRtsp', 554), puertoHttp: num('fHttp', 80), probar: true });
      $('fMsg').textContent = ''; toast('Conexión actualizada. Reabre el directo.');
      cam = await lista(); pintarCamara(); rellenarForm(); infoCargada = false;
    } catch (x) { $('fMsg').textContent = x.message; }
  };

  // ---- Eliminar la cámara
  $('bEliminar').onclick = async () => {
    if (!await confirmar('¿Eliminar la cámara?', `Se quita «${cam ? cam.nombre : ''}» de Panel Camaras. Las grabaciones de su tarjeta SD no se borran.`, 'Eliminar')) return;
    try { await api('/api/camaras/' + id, 'DELETE'); location.href = '/'; } catch (x) { toast(x.message); }
  };

  lista().then(c => { cam = c; if (cam){ pintarCamara(); rellenarForm(); } }).catch(() => {});
  const q = new URLSearchParams(location.search).get('panel'); if (P[q]) ir(q);
})();
