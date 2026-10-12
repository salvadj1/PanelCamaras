/**
 * Avisos de alarma en el navegador (se carga en todas las páginas). Cada 6 s pregunta por eventos nuevos;
 * si una regla pidió "Notificar", muestra un aviso en pantalla y, si el usuario lo permitió, una notificación del sistema.
 */
(function(){
  const KEY = 'xm.ultimoEvento';
  let ultimo = null;
  try { ultimo = parseInt(localStorage.getItem(KEY)); } catch (_) {}
  if (Number.isNaN(ultimo)) ultimo = null;

  async function revisar(){
    try {
      const r = await fetch('/api/eventos' + (ultimo !== null ? '?desde=' + ultimo : ''));
      if (!r.ok) return;
      const l = await r.json();
      if (ultimo === null){ ultimo = l.length ? l[0].id : 0; }   // primera vez: no avisar del historial viejo
      else if (l.length){
        ultimo = Math.max(ultimo, ...l.map(e => e.id));
        l.filter(e => e.notificar).reverse().forEach(e => {
          if (XM.store.get('avisos', 'true') !== 'true') return;   // avisos desactivados en Ajustes
          const t = `${e.camara}: ${e.texto}`, url = `/camara/${e.camaraId}/sd?t=${e.hora}`;   // tocar el aviso abre el vídeo
          XM.toast('🔔 ' + t, url);
          try {
            if (window.Notification && Notification.permission === 'granted'){
              const n = new Notification(t, { body: new Date(e.hora).toLocaleTimeString(), icon: e.foto || undefined });
              n.onclick = () => { window.focus(); location.href = url; n.close(); };
            }
          } catch (_) {}
        });
      }
      try { localStorage.setItem(KEY, String(ultimo)); } catch (_) {}
    } catch (_) {}
  }
  revisar(); setInterval(revisar, 6000);
})();
