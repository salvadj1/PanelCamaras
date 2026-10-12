/** Historial de alarmas (equivale a EventsScreen.kt): miniatura, evento, cámara y hora; se refresca cada 5 s. */
(function(){
  const { $, esc, api, confirmar, toast } = XM;
  let firma = '';
  async function cargar(){
    try {
      const l = await api('/api/eventos');
      const f = l.length + ':' + (l[0] ? l[0].id : 0);
      if (f === firma) return; firma = f;
      $('lista').innerHTML = l.length ? l.map(e => `<div class="setrow" style="gap:10px">${e.foto ? `<a href="${e.foto}" target="_blank"><img src="${e.foto}" alt="" loading="lazy" style="width:88px;height:60px;object-fit:cover;border-radius:8px"></a>` : ''}<div><div>${esc(e.texto)} · ${esc(e.camara)}</div><div class="mut small">${new Date(e.hora).toLocaleString()}</div></div></div>`).join('') : '<p class="mut">Aún no hay eventos.</p>';
    } catch (x) { $('lista').innerHTML = `<p class="mut">${esc(x.message)}</p>`; }
  }
  $('bBorrar').onclick = async () => {
    if (!await confirmar('¿Borrar el historial?', 'Se eliminarán también las fotos.', 'Borrar')) return;
    try { await api('/api/eventos', 'DELETE'); firma = ''; cargar(); } catch (x) { toast(x.message); }
  };
  if (window.Notification && Notification.permission === 'default'){
    $('avisoNotif').hidden = false;
    $('bNotif').onclick = async () => { await Notification.requestPermission(); $('avisoNotif').hidden = true; };
  }
  cargar(); setInterval(cargar, 5000);
})();
