/* Añadir cámara: búsqueda en la red del servidor, alta manual con prueba de login y diagnóstico. */
(function(){
  const { $, api, toast, esc } = XM;
  const val = id => $(id).value.trim();
  const datos = probar => ({
    nombre: val('fNombre'), host: val('fHost'), puerto: parseInt(val('fPuerto')) || 34567,
    usuario: val('fUser') || 'admin', password: $('fPass').value, probar
  });

  $('bBuscar').onclick = async () => {
    const b = $('bBuscar'); b.disabled = true; b.textContent = 'Buscando…'; $('msg').textContent = '';
    try {
      const lista = await api('/api/camaras/buscar', 'POST');
      $('hallados').innerHTML = lista.map((f, i) =>
        `<button class="btn out" style="width:100%;margin-top:4px" data-i="${i}" type="button">${esc(f.nombre)}  ·  ${esc(f.ip)}</button>`).join('');
      $('hallados').querySelectorAll('button').forEach(x => x.onclick = () => {
        const f = lista[+x.dataset.i]; $('fHost').value = f.ip; $('fPuerto').value = f.puertoTcp; if (!val('fNombre')) $('fNombre').value = f.nombre;
      });
      if (!lista.length) $('msg').textContent = 'No se encontró ninguna. Introduce la IP y pulsa Diagnóstico.';
    } catch (e) { $('msg').textContent = e.message; }
    b.disabled = false; b.textContent = 'Buscar en la red';
  };

  async function guardar(probar){
    if (!val('fHost')){ toast('Falta la IP'); return; }
    $('msg').textContent = probar ? 'Probando conexión…' : 'Guardando…';
    try { await api('/api/camaras', 'POST', datos(probar)); location.href = '/'; }
    catch (e) { $('msg').textContent = e.message; }
  }
  $('bGuardar').onclick = () => guardar(true);
  $('bSinProbar').onclick = () => guardar(false);

  $('bDiag').onclick = async () => {
    if (!val('fHost')){ toast('Falta la IP'); return; }
    const b = $('bDiag'); b.disabled = true; b.textContent = 'Diagnosticando…';
    try {
      const lineas = await api('/api/camaras/diagnostico', 'POST', datos(false));
      $('diag').textContent = lineas.join('\n'); $('diagBox').hidden = false;
    } catch (e) { $('msg').textContent = e.message; }
    b.disabled = false; b.textContent = 'Diagnóstico de conexión';
  };
  $('bCopiar').onclick = async () => {
    try { await navigator.clipboard.writeText($('diag').textContent); toast('Copiado'); } catch (_) { toast('No se pudo copiar'); }
  };
})();
