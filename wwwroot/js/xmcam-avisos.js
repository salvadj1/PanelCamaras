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
          const t = `${e.camara}: ${e.texto}`;
          XM.toast('🔔 ' + t);
          try { if (window.Notification && Notification.permission === 'granted') new Notification(t, { body: new Date(e.hora).toLocaleTimeString(), icon: e.foto || undefined }); } catch (_) {}
        });
      }
      try { localStorage.setItem(KEY, String(ultimo)); } catch (_) {}
    } catch (_) {}
  }
  revisar(); setInterval(revisar, 6000);
})();
