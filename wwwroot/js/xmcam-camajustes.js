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
    document.body.dataset.panel = p;   // lo lee la barra de cámaras para conservar la sección al cambiar de cámara
    Object.keys(P).forEach(k => P[k].hidden = k !== p);
    $('tabs').querySelectorAll('[data-p]').forEach(a => a.classList.toggle('sel', a.dataset.p === p));
    $('sheet').classList.toggle('sinptz', p !== 'directo');
    document.querySelector('.cambody').classList.toggle('fuera', p !== 'directo');
    $('camfuera').hidden = p !== 'ajustes'; $('tabs').hidden = p === 'ajustes';   // en Ajustes: botón «Directo» en vez de los 4 iconos
    if ((p === 'info' || p === 'ajustes') && !infoCargada) cargarInfo();
  }
  $('tabs').querySelectorAll('[data-p]').forEach(a => a.onclick = e => { e.preventDefault(); ir(a.dataset.p); });

  const lista = () => api('/api/camaras').then(r => r.camaras.find(c => c.id === id));
  const patch = body => api('/api/camaras/' + id, 'PATCH', body);

  function pintarCamara(){
    $('cVigilar').checked = !!cam.vigilar; $('cHash').checked = !!cam.rtspHash;
    $('iNombre').textContent = cam.nombre; pintarResumen(null);
    $('iConex').innerHTML = [['Dirección', cam.host + ':' + cam.puerto], ['Usuario', cam.usuario], ['Canal', cam.canal],
      ['Puerto RTSP', cam.puertoRtsp], ['Puerto HTTP', cam.puertoHttp], ['Estado', cam.online ? 'En línea' : 'Sin conexión']]
      .map(([k, v]) => `<div class="setrow" style="padding:4px 0"><div class="mut">${k}</div><div>${esc(v)}</div></div>`).join('');
  }

  /** Lista de bloques de la cámara como tarjetas desplegables: al abrir una se monta el editor en el mismo sitio (solo una abierta). */
  $('bloques').innerHTML = XmSchemas.BLOCKS.map(([t, d], i) =>
    `<div class="blk-it" data-i="${i}"><button class="blk" type="button" aria-expanded="false"><span class="bt"><span>${esc(t)}</span><span class="mut">${esc(d)}</span></span><svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><div class="blk-body" hidden></div></div>`).join('');
  $('bloques').querySelectorAll('.blk-it').forEach(it => it.querySelector('.blk').onclick = () => {
    const abrir = it.querySelector('.blk-body').hidden;
    $('bloques').querySelectorAll('.blk-it').forEach(o => { o.classList.remove('open'); o.querySelector('.blk-body').hidden = true; o.querySelector('.blk').setAttribute('aria-expanded', 'false'); });
    if (!abrir) return;
    it.classList.add('open'); it.querySelector('.blk-body').hidden = false; it.querySelector('.blk').setAttribute('aria-expanded', 'true');
    if (!it.dataset.listo){   // el editor se crea la primera vez que se abre
      it.dataset.listo = '1'; const [, , n, f] = XmSchemas.BLOCKS[+it.dataset.i];
      XmConfig.mount(it.querySelector('.blk-body'), { id, name: n, filter: f || null, titulo: false });
    }
    if (it.scrollIntoView) it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
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

  /** Tarjeta "Resumen" al principio de Ajustes: datos guardados (IP, usuario…) y, si la cámara responde, MAC, modelo y firmware. */
  let ultimaInfo = null;   // última respuesta de /info, para repintar el resumen si la cámara se carga después
  function pintarResumen(r){
    if (r) ultimaInfo = r; else r = ultimaInfo;
    if (!cam) return;
    const s = (r && r.sistema) || {}, red = (r && r.red) || {};
    const filas = [['Estado', cam.online ? 'En línea' : 'Sin conexión'], ['Dirección', cam.host + ':' + cam.puerto], ['MAC', red.mac],
      ['Máscara / puerta', red.mascara ? red.mascara + ' / ' + (red.puerta || '—') : ''], ['Modelo', s.HardWare || s.DeviceType], ['Firmware', s.SoftWareVersion],
      ['Número de serie', s.SerialNo], ['Usuario / canal', cam.usuario + ' / ' + cam.canal]];
    $('aResumen').innerHTML = '<div class="resg">' + filas.filter(f => f[1] !== undefined && f[1] !== '')
      .map(([k, v]) => `<div class="rc"><div class="l">${esc(k)}</div><div class="v">${k === 'Estado' ? `<i class="dot ${cam.online ? 'ok' : 'ko'}"></i>` : ''}${esc(v)}</div></div>`).join('') + '</div>';
  }

  async function cargarInfo(){
    try {
      const r = await api(`/api/camaras/${id}/info`); infoCargada = true; pintarResumen(r);
      const filas = Object.entries(r.sistema || {}).map(([k, v]) => [k, v]);
      if (r.red && r.red.mac) filas.unshift(['MAC', r.red.mac]);
      if (r.hora) filas.push(['Hora de la cámara', r.hora]);
      $('iSis').innerHTML = filas.map(([k, v]) => `<div class="setrow" style="padding:4px 0"><div class="mut">${esc(k)}</div><div>${esc(v)}</div></div>`).join('') || 'Sin datos';
    } catch (x) { $('iSis').textContent = x.message; pintarResumen(null); }
  }

  // ---- Ajustes: botón para volver al directo (las cámaras están en la barra superior)
  $('cfVolver').onclick = () => ir('directo');

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
      $('fHallados').innerHTML = hall.map((f, i) => `<button class="btn out" style="width:100%;margin-top:4px;height:auto;padding:8px 12px;text-align:left" data-i="${i}" type="button"><div>${esc(f.nombre)}  ·  ${esc(f.ip)}</div><div class="small mut">${f.mac ? 'MAC ' + esc(f.mac) : ''}${f.serie ? '  ·  SN ' + esc(f.serie) : ''}</div></button>`).join('');
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
