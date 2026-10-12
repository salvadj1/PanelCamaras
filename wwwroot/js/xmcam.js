/* XMCam web — utilidades comunes: almacenamiento, API, avisos y temas. */
const XM = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Almacenamiento local tolerante a fallos (modo privado, bloqueado...). */
  const store = {
    get(k, d){ try { const v = localStorage.getItem('xm.' + k); return v === null ? d : v; } catch (_) { return d; } },
    set(k, v){ try { localStorage.setItem('xm.' + k, String(v)); } catch (_) {} }
  };

  /** Llamada a la API JSON. Lanza Error con el mensaje del servidor si responde con error. */
  async function api(url, method = 'GET', body){
    const r = await fetch(url, {
      method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((data && data.error) || ('Error ' + r.status));
    return data;
  }

  let tt;
  /** Aviso breve en pantalla. */
  function toast(msg, href){
    let t = $('xmToast');
    if (!t){ t = document.createElement('div'); t.id = 'xmToast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    t.style.cursor = href ? 'pointer' : ''; t.onclick = href ? () => { location.href = href; } : null;   // con href, tocar el aviso abre ese enlace
    clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, href ? 9000 : 2600);
  }

  /** Diálogo de confirmación. Devuelve una promesa con true/false. */
  function confirmar(titulo, texto, okTxt = 'Aceptar'){
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.innerHTML = `<h3>${esc(titulo)}</h3><div class="mut">${esc(texto)}</div><div class="row"><button class="btn txt" data-r="0">Cancelar</button><button class="btn txt" data-r="1">${esc(okTxt)}</button></div>`;
      d.onclick = e => { const r = e.target.dataset && e.target.dataset.r; if (r !== undefined && r !== ''){ d.close(); d.remove(); res(r === '1'); } };
      d.oncancel = () => { d.remove(); res(false); };
      document.body.appendChild(d); d.showModal();
    });
  }

  /** Diálogo con un campo de texto. Devuelve el texto escrito o null si se cancela. */
  function pedirTexto(titulo, valor = '', okTxt = 'Guardar'){
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.innerHTML = `<h3>${esc(titulo)}</h3><input class="inp" style="width:100%" value="${esc(valor)}"><div class="row"><button class="btn txt" data-r="0">Cancelar</button><button class="btn txt" data-r="1">${esc(okTxt)}</button></div>`;
      const fin = v => { d.close(); d.remove(); res(v); };
      d.onclick = e => { const r = e.target.dataset && e.target.dataset.r; if (r === '0') fin(null); else if (r === '1') fin(d.querySelector('input').value); };
      d.oncancel = () => { d.remove(); res(null); };
      document.body.appendChild(d); d.showModal(); d.querySelector('input').focus();
    });
  }

  /** Temas disponibles (equivalentes a AppThemeId de la app Android). */
  const THEMES = [
    { id: 'NVR_DARK', label: 'NVR oscuro', desc: 'Negro azulado con acento azul. Aspecto de grabador profesional.', dark: true, c: '#3b82f6' },
    { id: 'MATERIAL_LIGHT', label: 'Material You claro', desc: 'Fondo claro, tarjetas redondeadas y acento violeta.', dark: false, c: '#6750a4' },
    { id: 'AMOLED', label: 'AMOLED negro', desc: 'Negro puro: ahorra batería en pantallas OLED.', dark: true, c: '#8ab4f8' },
    { id: 'CYBER', label: 'Cyber verde', desc: 'Fondo casi negro con acento verde neón, estilo seguridad.', dark: true, c: '#00ff9c' },
    { id: 'MINIMAL', label: 'Minimal blanco', desc: 'Blanco y gris con mucho aire. Sobrio y limpio.', dark: false, c: '#111111' }
  ];
  /** Tema efectivo (misma lógica que resolveTheme de la app). */
  function resolveTheme(){
    const sel = store.get('theme', 'NVR_DARK'), follow = store.get('follow', 'true') === 'true';
    const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const t = THEMES.find(x => x.id === sel) || THEMES[0];
    if (!follow || t.dark === sysDark) return t.id;
    return sysDark ? 'NVR_DARK' : 'MATERIAL_LIGHT';
  }
  function applyTheme(){ document.documentElement.setAttribute('data-theme', resolveTheme()); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  /** Texto "hace 5 min" para una marca de tiempo en ms. */
  function relativo(ms){
    const m = Math.floor((Date.now() - ms) / 60000);
    return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`;
  }

  return { $, esc, store, api, toast, confirmar, pedirTexto, THEMES, applyTheme, resolveTheme, relativo };
})();
