/**
 * Componente reutilizable "editor de un bloque de configuración" (XmConfig.mount).
 * Lee el JSON del bloque de la cámara, lo muestra en secciones plegables (resto en "Avanzado", agrupado y con nombres
 * legibles), y al guardar envía solo lo cambiado, relee y avisa de lo que la cámara rechazó.
 * Se usa tanto en la página /camara/{id}/config como dentro de las tarjetas desplegables de Ajustes.
 *
 * Uso: XmConfig.mount(elementoContenedor, { id: 'camId', name: 'Bloque', filter: 'regex'|RegExp|null, titulo: true|false });
 */
window.XmConfig = (function(){
  const { esc, api, toast, confirmar } = XM;
  const S = XmSchemas;
  const RIESGO = ['NetWork.NetCommon', 'NetWork.Wifi'];
  const esNum = s => /^\d+$/.test(String(s));
  const HEX = /^0x[0-9a-f]{8}$/i;
  const HORA = /^([01]) (\d\d:\d\d):\d\d-(\d\d:\d\d):\d\d$/;

  /** Separa una ruta en {grupo: [segmentos], etiqueta}; los índices finales se añaden al nombre ("Horario 1.2"). El nombre sale del diccionario en español. */
  function partir(path, pref, blq){
    const p = path.slice(pref ? 1 : 0); let i = p.length - 1; const idx = [];
    while (i >= 0 && esNum(p[i])){ idx.unshift(Number(p[i]) + 1); i--; }
    const last = i >= 0 ? p[i] : '';
    return { grp: p.slice(0, Math.max(i, 0)), last, etq: XmDic.nombre(blq, last) + (idx.length ? ' ' + idx.join('.') : '') };
  }
  /** Título legible de un grupo de rutas ("Acciones al ocurrir el evento › Horario"). */
  const tituloGrupo = (g, blq) => g.length ? g.map(s => esNum(s) ? '#' + (Number(s) + 1) : XmDic.nombre(blq, s)).join(' › ') : 'General';
  /** Texto "Valores posibles" de un campo del esquema, según su tipo de control. */
  function valoresEsquema(k){
    if (k.t === 'toggle') return XmDic.SN;
    if (k.t === 'slider') return `Entero de ${k.min} a ${k.max}${k.unit ? ' ' + k.unit.trim() : ''}`;
    if (k.t === 'choice') return k.options.map(o => o[1]).join(' · ');
    if (k.t === 'num') return 'Número entero' + (k.unit ? ' en ' + k.unit : '');
    if (k.t === 'ro') return 'Solo lectura';
    return 'Texto';
  }

  /** Texto de ayuda para valores crípticos: máscaras de canales y horarios. */
  function pista(nombre, v){
    const s = String(v);
    if (HEX.test(s) && /Mask$/i.test(nombre)){
      const n = parseInt(s, 16); if (!n) return 'Ningún canal';
      const c = []; for (let b = 0; b < 32; b++) if (n & (1 << b)) c.push(b + 1); return 'Canales ' + c.join(', ');
    }
    const m = HORA.exec(s); if (m) return m[1] === '1' ? 'Activo de ' + m[2] + ' a ' + m[3] : 'Desactivado (' + m[2] + '–' + m[3] + ')';
    return '';
  }

  // ---- historial en localStorage (clave por cámara y bloque)
  const hk = (id, n) => `xm.hist.${id}.${n}`;
  function histGet(id, n){ try { return JSON.parse(localStorage.getItem(hk(id, n)) || '[]'); } catch (e) { return []; } }
  function histSet(id, n, a){ try { localStorage.setItem(hk(id, n), JSON.stringify(a.slice(0, 8))); } catch (e) {} }
  /** Guarda [json] (valor anterior de la cámara) como la versión más reciente del historial del bloque. */
  function histPush(id, n, efectivo, json){ histSet(id, n, [{ t: Date.now(), n: efectivo, j: json }, ...histGet(id, n)]); }

  function mount(el, opt){
    const id = opt.id, name = opt.name;
    const filter = opt.filter ? (opt.filter instanceof RegExp ? opt.filter : new RegExp(opt.filter)) : null;
    let base = null, snap = null, hojas = [], efectivo = name, P = '';
    let abiertas = {}, advAbierto = false;
    el.classList.add('cp'); if (opt.titulo === false) el.classList.add('cp-inline');
    el.innerHTML = '<div class="cp-body"><p class="mut">Cargando…</p></div><div class="cfgbar"><button class="btn out" data-a="json" type="button">Ver JSON</button><button class="btn tonal" data-a="rec" type="button">Recargar</button><button class="btn tonal" data-a="undo" type="button" hidden>Deshacer</button><button class="btn tonal" data-a="cmp" type="button">Comparar</button><button class="btn" data-a="save" type="button">Guardar</button></div><pre class="cp-json small" hidden></pre>';
    const body = el.querySelector('.cp-body'), jsonEl = el.querySelector('.cp-json');
    const url = () => `/api/camaras/${id}/config?name=${encodeURIComponent(efectivo)}`;
    const hoja = key => hojas.find(h => h.path.join('.') === key);
    const clave = h => h.path.join('.');

    /** Control de edición para la hoja h con el tipo k. */
    function control(h, k, ph){
      const v = S.getPath(base, clave(h)), k0 = clave(h);
      if (k.t === 'toggle') return `<label class="switch"><input type="checkbox" data-k="${k0}" ${S.toBool(v) ? 'checked' : ''}><i></i></label>`;
      if (k.t === 'slider') return `<input type="range" data-k="${k0}" min="${k.min}" max="${k.max}" value="${v}"><span class="small" data-lbl="${k0}">${esc(k.labels[v] || v + (k.unit || ''))}</span>`;
      if (k.t === 'choice'){
        const op = k.options.slice(); if (!op.some(o => String(o[0]) === String(v))) op.push([v, String(v)]);
        return `<select class="inp" data-k="${k0}">${op.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
      }
      if (k.t === 'ro') return `<div>${esc(v)}</div>`;
      return `<input class="inp" type="${k.t === 'pass' ? 'password' : 'text'}" ${typeof v === 'number' ? 'inputmode="decimal"' : ''} data-k="${k0}" value="${esc(v)}" placeholder="${esc(ph || '')}">${k.unit ? ' <span class="small mut">' + esc(k.unit) + '</span>' : ''}`;
    }

    /** Fila del bloque "Avanzado": nombre legible, control según el tipo de valor (IP, máscara, horario, número…) y pista; la ruta técnica queda en el tooltip. */
    function filaAv(x, etq, lastReal){
      const last = lastReal || String(x.path[x.path.length - 1]), k0 = clave(x), V = window.XmVal;   // lastReal: la clave sin los índices finales (TimeSection, no 0)
      const tipo = V ? V.kind(last, x.orig) : 'str';
      const esBool = typeof x.orig === 'boolean' || (typeof x.orig === 'string' && HEX.test(x.orig) && /Enable$/.test(last));
      const desc = XmDic.descripcion(name, last, x.orig), vals = XmDic.valores(name, last, x.orig, esBool ? 'bool' : tipo);
      const info = `<div class="h">${esc(desc)}</div><div class="v">Valores: ${esc(vals)}</div>`;
      if (V && !esBool && V.necesitaWidget(tipo)) return `<div class="cfg-f" title="${esc(k0)}"><div class="tx"><div class="t">${esc(etq)}</div>${info}</div><div class="ctl">${V.widget(tipo, k0, x.orig)}</div></div>`;
      const ro = /^No editable/.test(vals);   // MAC, estado, capacidad…: se muestran pero no se editan
      const ctl = ro ? `<b>${esc(x.orig)}</b>` : control(x, { t: esBool ? 'toggle' : 'str' }, '—');
      const p = esBool ? '' : pista(last, x.orig);
      return `<div class="cfg-f${esBool ? ' tog' : ''}" title="${esc(k0)}"><div class="tx"><div class="t">${esc(etq)}</div>${info}${p ? `<div class="h">${esc(p)}</div>` : ''}</div><div class="ctl">${ctl}</div></div>`;
    }

    function pintar(){
      hojas = []; S.flatten(base, [], hojas);
      snap = JSON.parse(JSON.stringify(base));
      P = Array.isArray(base) ? '0.' : '';
      const sch = S.get(name), usadas = new Set();
      let h = '';
      if (opt.titulo !== false) h += `<h2 class="sec">${esc(sch ? sch.title : name)}</h2>`;
      if (sch && sch.intro) h += `<p class="mut small">${esc(sch.intro)}</p>`;
      if (name === 'StorageInfo') h += '<p class="mut small">Solo lectura.</p>';
      let n = 0;
      if (sch) for (const s of sch.sections){
        const campos = s.fields.filter(f => S.getPath(base, P + f.key) !== undefined);
        if (!campos.length) continue;
        let filas = '';
        for (const f of campos){
          usadas.add(P + f.key);
          const tog = f.kind.t === 'toggle';
          filas += `<div class="cfg-f${tog ? ' tog' : ''}"><div class="tx"><div class="t">${esc(f.title)}</div><div class="h">${esc(f.help)}</div><div class="v">Valores: ${esc(valoresEsquema(f.kind))}</div></div><div class="ctl">${control(hoja(P + f.key), f.kind)}</div></div>`;
        }
        const i = n++, ab = abiertas[i] === undefined ? i === 0 : abiertas[i];
        h += `<details class="cfg-sec" data-i="${i}" ${ab ? 'open' : ''}><summary>${esc(s.title || 'Ajustes')}<small>${campos.length}</small></summary><div class="cfg-card">${filas}</div></details>`;
      }
      // Avanzado: el resto de valores simples (máx. 300), agrupados por ruta y con nombres legibles
      let rest = hojas.filter(x => !usadas.has(clave(x)) && (!filter || filter.test(clave(x))));
      const total = rest.length; rest = rest.slice(0, 300);
      if (rest.length){
        const grupos = new Map();
        for (const x of rest){ const p = partir(x.path, P, name); const k = p.grp.join('\u0001'); if (!grupos.has(k)) grupos.set(k, { g: p.grp, f: [] }); grupos.get(k).f.push(filaAv(x, p.etq, p.last)); }
        h += `<details class="cfg-sec adv" data-adv ${advAbierto ? 'open' : ''}><summary>Avanzado<small>${total}</small></summary>`;
        for (const g of grupos.values()) h += `<h4 class="cfg-sub">${esc(tituloGrupo(g.g, name))}</h4><div class="cfg-card cfg-grid">${g.f.join('')}</div>`;
        h += '</details>';
      }
      body.innerHTML = h || '<p class="mut">Esta cámara no devolvió ajustes en este bloque.</p>';
      if (window.XmVal) XmVal.wire(body);
      refrescarDeshacer();
      body.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => {
        const f = sch && sch.sections.flatMap(s => s.fields).find(x => P + x.key === r.dataset.k);
        const l = body.querySelector(`[data-lbl="${r.dataset.k}"]`); if (l) l.textContent = (f && f.kind.labels[r.value]) || r.value + ((f && f.kind.unit) || '');
      });
    }

    /** Recuerda qué secciones están abiertas para no plegarlas al repintar. */
    body.addEventListener('toggle', e => {
      const d = e.target; if (!d.matches || !d.matches('details.cfg-sec')) return;
      if (d.hasAttribute('data-adv')) advAbierto = d.open; else abiertas[d.dataset.i] = d.open;
    }, true);

    /** Lee los controles y devuelve el JSON modificado más la lista de claves tocadas. */
    function recoger(){
      const nuevo = JSON.parse(JSON.stringify(snap)), tocadas = [];
      body.querySelectorAll('[data-k]').forEach(c => {
        const h = hoja(c.dataset.k); if (!h) return;
        let val;
        if (c.type === 'checkbox') val = S.boolLike(h.orig, c.checked);
        else if (c.type === 'range' || typeof h.orig === 'number'){ val = S.parseLike(h.orig, c.value); if (val === undefined) val = S.parseLike(h.orig, String(Number(c.value))); }
        else if (c.tagName === 'SELECT') val = typeof h.orig === 'number' ? Number(c.value) : c.value;
        else val = c.value;
        if (val === undefined) return;
        if (S.norm(val) !== S.norm(h.orig)){ S.setAt(nuevo, h.path, val); tocadas.push({ h, val }); }
      });
      return { nuevo, tocadas };
    }
    /** Marca con una barra lateral los ajustes cambiados y aún sin guardar. */
    function marcar(){
      const cambiadas = new Set(recoger().tocadas.map(t => clave(t.h)));
      body.querySelectorAll('[data-k]').forEach(c => { const f = c.closest('.cfg-f'); if (f) f.classList.toggle('chg', cambiadas.has(c.dataset.k)); });
    }
    body.addEventListener('input', marcar); body.addEventListener('change', marcar);

    async function cargar(){
      try {
        efectivo = name;
        const r = await fetch(url()), j = await r.json().catch(() => null);
        if (!r.ok) throw new Error((j && j.error) || 'Error ' + r.status);
        efectivo = r.headers.get('X-Config-Name') || name;
        base = j; pintar();
        if (!jsonEl.hidden) jsonEl.textContent = `Bloque: ${efectivo}\n` + JSON.stringify(base, null, 2);
      } catch (x) { body.innerHTML = `<p class="mut">${esc(x.message)}</p>`; }
    }
    // ---- historial: antes de cada guardado se conserva el valor anterior del bloque (hasta 8 versiones, solo en este navegador)
    const hget = () => histGet(id, name);
    function refrescarDeshacer(){ const b = el.querySelector('[data-a=undo]'); if (b) b.hidden = !hget().length; }
    async function deshacer(){
      const h = hget(); if (!h.length) return; const x = h[0], f = new Date(x.t).toLocaleString();
      if (!await confirmar('Deshacer el último guardado', `Se restauran los valores que tenía este bloque antes del cambio del ${f}.`, 'Restaurar')) return;
      try { const rel = await api(`/api/camaras/${id}/config?name=${encodeURIComponent(x.n)}`, 'PUT', x.j); histSet(id, name, h.slice(1)); base = rel; pintar(); toast('Valores anteriores restaurados'); }
      catch (e) { toast(e.message); }
    }
    /** Escribe un JSON completo en este bloque (lo usa «Comparar → traer de otra cámara»). */
    async function escribir(json){
      histPush(id, name, efectivo, snap);
      const rel = await api(url(), 'PUT', json); base = rel; pintar(); return rel;
    }
    async function guardar(){
      const { nuevo, tocadas } = recoger();
      if (!tocadas.length){ toast('Sin cambios'); return; }
      if (RIESGO.includes(name) && !await confirmar('Cambio delicado', 'Si cambias red o WiFi, la cámara puede quedar inaccesible. ¿Continuar?', 'Guardar')) return;
      try {
        const previo = snap; const rel = await api(url(), 'PUT', nuevo);
        histPush(id, name, efectivo, previo);
        base = rel; const antes = tocadas.slice(); pintar();
        const rechazados = antes.filter(t => { const v = S.getPath(rel, clave(t.h)); return v === undefined || S.norm(v) !== S.norm(t.val); });
        if (rechazados.length) toast('La cámara rechazó: ' + rechazados.map(t => S.friendly(String(t.h.path[t.h.path.length - 1]))).join(', '));
        else toast('Guardado');
      } catch (x) { toast(x.message); }
    }
    el.querySelector('[data-a=rec]').onclick = cargar;
    el.querySelector('[data-a=save]').onclick = guardar;
    el.querySelector('[data-a=undo]').onclick = deshacer;
    el.querySelector('[data-a=cmp]').onclick = () => window.XmCompare ? XmCompare.abrir({ id, name: efectivo, base, escribirAqui: escribir }) : toast('Comparador no cargado');
    el.querySelector('[data-a=json]').onclick = () => {
      jsonEl.hidden = !jsonEl.hidden;
      if (!jsonEl.hidden) jsonEl.textContent = `Bloque: ${efectivo}\n` + JSON.stringify(base, null, 2);
    };
    cargar();
    return { cargar, guardar };
  }
  return { mount, histPush, histGet };
})();
