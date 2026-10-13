/** Lista de reglas y perfiles (equivale a RulesScreen.kt). */
(function(){
  const { $, esc, api, toast, pedirTexto } = XM;
  const ACC = { NOTIFY: 'Notificar', SNAPSHOT: 'Foto', HTTP_GET: 'Llamar URL', PTZ_PRESET: 'Mover PTZ' };
  let d = null, cams = [];

  async function cargar(){
    try {
      [d, cams] = await Promise.all([api('/api/reglas'), api('/api/camaras').then(r => r.camaras)]);
      const ev = Object.fromEntries(d.eventos.map(e => [e.clave, e.texto]));
      $('perfiles').innerHTML = d.perfiles.map(p => `<button class="chip ${p === d.perfilActivo ? 'sel' : ''}" data-p="${esc(p)}" type="button">${esc(p)}</button>`).join('');
      $('perfiles').querySelectorAll('.chip').forEach(b => b.onclick = async () => { await api('/api/perfiles/activo?nombre=' + encodeURIComponent(b.dataset.p), 'PUT'); cargar(); });
      $('sFoto').checked = d.fotoAutomatica;
      $('reglas').innerHTML = d.reglas.length ? d.reglas.map(r => {
        const cam = (cams.find(c => c.id === r.camaraId) || {}).nombre || 'Todas las cámaras';
        const e = r.eventos.includes('*') ? 'Cualquier evento' : r.eventos.map(x => ev[x] || x).join(', ');
        return `<div class="card" style="margin:6px 0;display:flex;gap:10px;align-items:center"><a href="/reglas/${r.id}" style="flex:1;text-decoration:none;color:inherit"><div>${esc(r.nombre)}</div><div class="mut small">${esc(cam)} · ${esc(e)}</div><div class="mut small">${esc(r.acciones.map(a => ACC[a.tipo] || a.tipo).join(', ') || 'Sin acciones')}</div></a><label class="switch"><input type="checkbox" data-r="${r.id}" ${r.activa ? 'checked' : ''}><i></i></label></div>`;
      }).join('') : '<p class="mut">No hay reglas. Crea una con «+ Nueva regla».</p>';
      $('reglas').querySelectorAll('input[data-r]').forEach(i => i.onchange = async () => {
        const r = d.reglas.find(x => x.id === i.dataset.r);
        try { await api('/api/reglas/' + r.id, 'PUT', { ...r, activa: i.checked }); r.activa = i.checked; } catch (x) { toast(x.message); i.checked = !i.checked; }
      });
    } catch (x) { $('reglas').innerHTML = `<p class="mut">${esc(x.message)}</p>`; }
  }
  $('sFoto').onchange = e => api('/api/alarmas/foto-automatica?valor=' + e.target.checked, 'PUT').catch(x => toast(x.message));
  $('bPerfiles').onclick = async () => {
    const t = await pedirTexto('Perfiles (separados por comas)', d.perfiles.join(', '));
    if (t === null) return;
    try { await api('/api/perfiles', 'PUT', t.split(',').map(s => s.trim()).filter(Boolean)); cargar(); } catch (x) { toast(x.message); }
  };
  cargar();
})();
