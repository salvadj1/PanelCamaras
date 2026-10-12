/** Editor de una regla (equivale a RuleEditScreen.kt): cámara, eventos, condiciones, acciones. */
(function(){
  const { $, esc, api, toast, confirmar } = XM;
  const ed = $('ed'), idUrl = ed.dataset.id, nueva = idUrl === 'nueva';
  const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
  const aMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1; };
  const aHHmm = m => m < 0 ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  (async () => {
    let d, cams;
    try { [d, cams] = await Promise.all([api('/api/reglas'), api('/api/camaras').then(r => r.camaras)]); }
    catch (x) { ed.innerHTML = `<p class="mut">${esc(x.message)}</p>`; return; }
    const ex = nueva ? null : d.reglas.find(r => r.id === idUrl);
    if (!nueva && !ex){ ed.innerHTML = '<p class="mut">Regla no encontrada.</p>'; return; }
    const r = ex || { id: nuevoId(), nombre: 'Nueva regla', activa: true, camaraId: '', eventos: ['*'], soloInicio: true, desde: -1, hasta: -1, perfil: '', esperaSeg: 30, acciones: [{ tipo: 'NOTIFY', param: '' }] };
    const acc = t => r.acciones.find(a => a.tipo === t);
    const chk = (id, txt, v) => `<label class="setrow" style="padding:4px 0"><div>${txt}</div><span class="switch"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}><i></i></span></label>`;
    ed.innerHTML = `
      <div class="field"><input id="rNombre" value="${esc(r.nombre)}" placeholder="Nombre"></div>
      <h2 class="sec">Cámara</h2>
      <div class="row" style="flex-wrap:wrap" id="rCam">${[{ id: '', nombre: 'Todas' }, ...cams].map(c => `<button type="button" class="chip ${c.id === r.camaraId ? 'sel' : ''}" data-id="${c.id}">${esc(c.nombre)}</button>`).join('')}</div>
      <h2 class="sec">Cuando ocurra</h2>
      ${chk('eAll', 'Cualquier evento', r.eventos.includes('*'))}
      ${d.eventos.map(e => chk('e_' + e.clave, esc(e.texto), r.eventos.includes(e.clave))).join('')}
      ${chk('rInicio', 'Solo al empezar (no al terminar)', r.soloInicio)}
      <h2 class="sec">Condiciones</h2>
      <div class="row"><input class="inp" id="rDesde" placeholder="Desde HH:mm" value="${aHHmm(r.desde)}" style="flex:1"><input class="inp" id="rHasta" placeholder="Hasta HH:mm" value="${aHHmm(r.hasta)}" style="flex:1"></div>
      <p class="mut small">Vacío = a cualquier hora. Admite franjas que cruzan la medianoche.</p>
      <div class="mut small">Solo con el perfil:</div>
      <div class="row" style="flex-wrap:wrap" id="rPerfil">${['', ...d.perfiles].map(p => `<button type="button" class="chip ${p === r.perfil ? 'sel' : ''}" data-p="${esc(p)}">${p ? esc(p) : 'Cualquiera'}</button>`).join('')}</div>
      <div class="field" style="margin-top:10px"><div class="mut small">Anti-spam: segundos mínimos entre ejecuciones</div><input id="rEspera" type="number" min="0" value="${r.esperaSeg}"></div>
      <h2 class="sec">Hacer (en el servidor)</h2>
      ${chk('aNot', 'Aviso en el navegador', !!acc('NOTIFY'))}
      ${chk('aFoto', 'Tomar foto', !!acc('SNAPSHOT'))}
      ${chk('aPtz', 'Mover PTZ a posición', !!acc('PTZ_PRESET'))}
      <div class="field" id="fPtz" ${acc('PTZ_PRESET') ? '' : 'hidden'}><input id="rPtz" type="number" min="1" max="6" value="${acc('PTZ_PRESET') ? esc(acc('PTZ_PRESET').param) : 1}"></div>
      ${chk('aUrl', 'Llamar a una URL (GET)', !!acc('HTTP_GET'))}
      <div class="field" id="fUrl" ${acc('HTTP_GET') ? '' : 'hidden'}><input id="rUrl" placeholder="https://…" value="${acc('HTTP_GET') ? esc(acc('HTTP_GET').param) : ''}"><div class="mut small">Variables: {camera} {event} {status} {time} {channel}</div></div>
      <p class="mut small">Grabar, email, FTP, sirena... se configuran en la propia cámara (Ajustes › Alarma).</p>
      <div class="row" style="margin:14px 0"><button class="btn" id="rGuardar" type="button">Guardar regla</button>${ex ? '<button class="btn tonal" id="rBorrar" type="button">Borrar</button>' : ''}</div>`;

    let cam = r.camaraId, perfil = r.perfil;
    const grupo = (id, fn) => $(id).querySelectorAll('.chip').forEach(b => b.onclick = () => { fn(b); $(id).querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === b)); });
    grupo('rCam', b => cam = b.dataset.id); grupo('rPerfil', b => perfil = b.dataset.p);
    $('aPtz').onchange = e => $('fPtz').hidden = !e.target.checked;
    $('aUrl').onchange = e => $('fUrl').hidden = !e.target.checked;
    // "Cualquier evento" excluye a los demás y viceversa (igual que la app).
    $('eAll').onchange = e => { if (e.target.checked) d.eventos.forEach(x => $('e_' + x.clave).checked = false); };
    d.eventos.forEach(x => $('e_' + x.clave).onchange = () => { $('eAll').checked = !d.eventos.some(y => $('e_' + y.clave).checked); });

    $('rGuardar').onclick = async () => {
      const ev = d.eventos.filter(x => $('e_' + x.clave).checked).map(x => x.clave);
      const f = aMin($('rDesde').value), t = aMin($('rHasta').value);
      const acciones = [];
      if ($('aFoto').checked) acciones.push({ tipo: 'SNAPSHOT', param: '' });
      if ($('aPtz').checked) acciones.push({ tipo: 'PTZ_PRESET', param: $('rPtz').value || '1' });
      if ($('aUrl').checked && $('rUrl').value.trim()) acciones.push({ tipo: 'HTTP_GET', param: $('rUrl').value.trim() });
      if ($('aNot').checked) acciones.push({ tipo: 'NOTIFY', param: '' });
      const body = { id: r.id, nombre: $('rNombre').value || 'Regla', activa: r.activa, camaraId: cam, eventos: ev.length ? ev : ['*'], soloInicio: $('rInicio').checked,
        desde: f >= 0 && t >= 0 ? f : -1, hasta: f >= 0 && t >= 0 ? t : -1, perfil, esperaSeg: parseInt($('rEspera').value) || 0, acciones };
      try { await api('/api/reglas/' + r.id, 'PUT', body); location.href = '/reglas'; } catch (x) { toast(x.message); }
    };
    if (ex) $('rBorrar').onclick = async () => {
      if (!await confirmar('¿Borrar la regla?', r.nombre, 'Borrar')) return;
      try { await api('/api/reglas/' + r.id, 'DELETE'); location.href = '/reglas'; } catch (x) { toast(x.message); }
    };
  })();
})();
