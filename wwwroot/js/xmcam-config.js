/**
 * Editor de un bloque de configuración (equivale a ConfigScreen.kt): lee el JSON de la cámara, muestra los
 * ajustes con controles según el esquema (resto en "Avanzado"), y al guardar envía solo lo cambiado,
 * relee y avisa de los valores que la cámara rechazó.
 */
(function(){
  const { $, esc, api, toast, confirmar } = XM;
  const S = XmSchemas;
  const id = $('cfg').dataset.cam;
  const qs = new URLSearchParams(location.search);
  const name = qs.get('name') || '';
  const filter = qs.get('filter') ? new RegExp(qs.get('filter')) : null;
  const RIESGO = ['NetWork.NetCommon', 'NetWork.Wifi'];
  let base = null, snap = null, hojas = [];

  const url = () => `/api/camaras/${id}/config?name=${encodeURIComponent(name)}`;

  /** Hoja (valor simple) por ruta de texto. */
  const hoja = key => hojas.find(h => h.path.join('.') === key);
  const clave = h => h.path.join('.');

  /** Pinta un control para la hoja h con el tipo k. */
  function control(h, k){
    const v = S.getPath(base, clave(h));
    const k0 = clave(h);
    if (k.t === 'toggle') return `<label class="switch"><input type="checkbox" data-k="${k0}" ${S.toBool(v) ? 'checked' : ''}><i></i></label>`;
    if (k.t === 'slider') return `<input type="range" data-k="${k0}" min="${k.min}" max="${k.max}" value="${v}"><span class="small" data-lbl="${k0}">${esc(k.labels[v] || v + (k.unit || ''))}</span>`;
    if (k.t === 'choice'){
      const op = k.options.slice(); if (!op.some(o => String(o[0]) === String(v))) op.push([v, String(v)]);
      return `<select class="inp" data-k="${k0}">${op.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    }
    if (k.t === 'ro') return `<div>${esc(v)}</div>`;
    return `<input class="inp" type="${k.t === 'pass' ? 'password' : 'text'}" data-k="${k0}" value="${esc(v)}">${k.unit ? ' <span class="small mut">' + esc(k.unit) + '</span>' : ''}`;
  }

  function pintar(){
    hojas = []; S.flatten(base, [], hojas);
    snap = JSON.parse(JSON.stringify(base));
    const sch = S.get(name), usadas = new Set();
    let h = `<h2 class="sec">${esc(sch ? sch.title : name)}</h2>`;
    if (sch && sch.intro) h += `<p class="mut small">${esc(sch.intro)}</p>`;
    if (name === 'StorageInfo') h += '<p class="mut small">Solo lectura.</p>';
    if (sch) for (const s of sch.sections){
      const campos = s.fields.filter(f => S.getPath(base, f.key) !== undefined);
      if (!campos.length) continue;
      if (s.title) h += `<h3 class="sec">${esc(s.title)}</h3>`;
      for (const f of campos){
        usadas.add(f.key);
        h += `<div class="cfg-f"><div class="setrow" style="padding:0"><div>${esc(f.title)}</div>${f.kind.t === 'toggle' ? control(hoja(f.key), f.kind) : ''}</div><div class="h">${esc(f.help)}</div>${f.kind.t === 'toggle' ? '' : control(hoja(f.key), f.kind)}</div>`;
      }
    }
    // Avanzado: el resto de valores simples (máx. 300), aplicando el filtro de la tarjeta si lo hay
    let rest = hojas.filter(x => !usadas.has(clave(x)) && (!filter || filter.test(clave(x))));
    const total = rest.length;
    rest = rest.slice(0, 300);
    if (rest.length){
      h += `<details style="margin-top:14px"><summary class="sec">Avanzado (${total})</summary>`;
      for (const x of rest){
        const k0 = clave(x), last = String(x.path[x.path.length - 1]);
        const ctl = typeof x.orig === 'boolean' ? control(x, { t: 'toggle' }) : control(x, { t: 'str' });
        h += `<div class="cfg-f"><div>${esc(S.friendly(last))}</div><div class="h">${esc(k0)}</div>${ctl}</div>`;
      }
      h += '</details>';
    }
    $('cfg').innerHTML = h;
    $('cfg').querySelectorAll('input[type=range]').forEach(r => r.oninput = () => {
      const f = sch && sch.sections.flatMap(s => s.fields).find(x => x.key === r.dataset.k);
      const l = $('cfg').querySelector(`[data-lbl="${r.dataset.k}"]`); if (l) l.textContent = (f && f.kind.labels[r.value]) || r.value + ((f && f.kind.unit) || '');
    });
  }

  /** Lee los controles y devuelve el JSON modificado más la lista de claves tocadas. */
  function recoger(){
    const nuevo = JSON.parse(JSON.stringify(snap)), tocadas = [];
    $('cfg').querySelectorAll('[data-k]').forEach(el => {
      const h = hoja(el.dataset.k); if (!h) return;
      let val;
      if (el.type === 'checkbox') val = S.boolLike(h.orig, el.checked);
      else if (el.type === 'range' || typeof h.orig === 'number'){ val = S.parseLike(h.orig, el.value); if (val === undefined) val = S.parseLike(h.orig, String(Number(el.value))); }
      else if (el.tagName === 'SELECT') val = typeof h.orig === 'number' ? Number(el.value) : el.value;
      else val = el.value;
      if (val === undefined) return;
      if (S.norm(val) !== S.norm(h.orig)){ S.setAt(nuevo, h.path, val); tocadas.push({ h, val }); }
    });
    return { nuevo, tocadas };
  }

  async function cargar(){
    try { base = await api(url()); pintar(); } catch (x) { $('cfg').innerHTML = `<p class="mut">${esc(x.message)}</p>`; }
  }

  $('bRec').onclick = cargar;
  $('bGuardar').onclick = async () => {
    const { nuevo, tocadas } = recoger();
    if (!tocadas.length){ toast('Sin cambios'); return; }
    if (RIESGO.includes(name) && !await confirmar('Cambio delicado', 'Si cambias red o WiFi, la cámara puede quedar inaccesible. ¿Continuar?', 'Guardar')) return;
    try {
      const rel = await api(url(), 'PUT', nuevo);
      base = rel; const antes = tocadas.slice(); pintar();
      const rechazados = antes.filter(t => { const v = S.getPath(rel, clave(t.h)); return v === undefined || S.norm(v) !== S.norm(t.val); });
      if (rechazados.length) toast('La cámara rechazó: ' + rechazados.map(t => S.friendly(String(t.h.path[t.h.path.length - 1]))).join(', '));
      else toast('Guardado');
    } catch (x) { toast(x.message); }
  };
  cargar();
})();
