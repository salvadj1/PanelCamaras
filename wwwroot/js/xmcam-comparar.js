/**
 * Comparador de bloques entre cámaras (XmCompare.abrir). Muestra lado a lado el mismo bloque de configuración de dos cámaras,
 * resalta las diferencias y permite copiar los valores elegidos en cualquier sentido. Nunca copia lo propio de cada cámara
 * (IP, máscara, puerta de enlace, MAC, nombre en red, Wi‑Fi, contraseñas, número de serie).
 * Uso: XmCompare.abrir({ id, name: 'Bloque', base: json, escribirAqui: async json => {...} })
 */
window.XmCompare = (function(){
  const { $, esc, api, toast, confirmar } = XM;
  const S = XmSchemas;
  /** Claves que identifican a una cámara y no deben copiarse a otra. */
  const PROPIAS = new Set(['HostIP', 'Submask', 'GateWay', 'Gateway', 'MAC', 'DvrMac', 'HostName', 'SerialNo', 'SSID', 'Keys', 'Password', 'PassWord', 'UserName']);
  const ultimo = p => String(p[p.length - 1]);
  const clave = p => p.join('.');
  /** Etiqueta legible de una ruta ("Event Handler › Record Enable"). */
  const etiqueta = p => window.XmDic ? XmDic.etiqueta(blq, p) : p.join('.');
  let blq = '';

  async function leer(id, name){
    const r = await fetch(`/api/camaras/${id}/config?name=${encodeURIComponent(name)}`), j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && j.error) || 'Error ' + r.status);
    return { ef: r.headers.get('X-Config-Name') || name, json: j };
  }
  const mapa = j => { const h = []; S.flatten(j, [], h); const m = new Map(); h.forEach(x => m.set(clave(x.path), x)); return m; };
  const mostrar = (last, v) => window.XmVal ? XmVal.mostrar(last, v) : String(v);

  function abrir(opt){
    blq = opt.name;
    const ov = document.createElement('div'); ov.className = 'cmpov';
    ov.innerHTML = '<div class="cmppn" role="dialog" aria-label="Comparar cámaras"><div class="row" style="margin-bottom:8px"><b style="font-size:16px;flex:1">Comparar con otra cámara</b><button class="ib" data-a="x" aria-label="Cerrar">✕</button></div><div class="chips" data-a="cams" style="flex-wrap:wrap"></div><div data-a="cuerpo" class="mut" style="margin-top:10px">Elige la cámara con la que comparar.</div></div>';
    document.body.appendChild(ov);
    const cerrar = () => ov.remove(); ov.querySelector('[data-a=x]').onclick = cerrar; ov.addEventListener('pointerdown', e => { if (e.target === ov) cerrar(); });
    api('/api/camaras').then(r => {
      const otras = r.camaras.filter(c => c.id !== opt.id);
      ov.querySelector('[data-a=cams]').innerHTML = otras.length ? otras.map(c => `<button class="chip" data-id="${esc(c.id)}"><i class="dot ${c.online ? 'ok' : 'ko'}"></i>${esc(c.nombre)}</button>`).join('') : '<span class="mut">No hay otras cámaras.</span>';
      ov.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { ov.querySelectorAll('[data-id]').forEach(x => x.classList.toggle('sel', x === b)); cargar(otras.find(c => c.id === b.dataset.id)); });
    }).catch(e => toast(e.message));

    async function cargar(otra){
      const cu = ov.querySelector('[data-a=cuerpo]'); cu.textContent = 'Leyendo…';
      let o; try { o = await leer(otra.id, opt.name); } catch (e) { cu.textContent = 'No se pudo leer ese bloque en «' + otra.nombre + '»: ' + e.message; return; }
      const A = mapa(opt.base), B = mapa(o.json), claves = [...new Set([...A.keys(), ...B.keys()])];
      const filas = claves.map(k => { const a = A.get(k), b = B.get(k), p = (a || b).path, last = ultimo(p);
        return { k, p, last, a, b, dif: !a || !b || String(a.orig) !== String(b.orig), propia: PROPIAS.has(last) }; });
      let soloDif = true;
      const pintar = () => {
        const vis = filas.filter(f => !soloDif || f.dif);
        cu.className = ''; cu.innerHTML = `<div class="row" style="margin-bottom:8px"><label class="row" style="gap:6px"><input type="checkbox" data-a="sd" ${soloDif ? 'checked' : ''}> Solo diferencias</label><span class="sp"></span><span class="small mut">${filas.filter(f => f.dif).length} diferencias de ${filas.length} ajustes</span></div>
          <div class="cmptab"><table><thead><tr><th>Ajuste</th><th>Esta cámara</th><th>${esc(otra.nombre)}</th><th>Copiar</th></tr></thead><tbody>${vis.map(f => `<tr class="${f.dif ? 'dif' : ''}"><td title="${esc(f.k)}">${esc(etiqueta(f.p))}</td><td>${f.a ? esc(mostrar(f.last, f.a.orig)) : '—'}</td><td>${f.b ? esc(mostrar(f.last, f.b.orig)) : '—'}</td><td>${f.dif && f.a && f.b ? (f.propia ? '<span class="small mut">propia</span>' : `<input type="checkbox" data-k="${esc(f.k)}" checked>`) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="mut">Los dos bloques son iguales.</td></tr>'}</tbody></table></div>
          <div class="row" style="margin-top:10px"><button class="btn tonal" data-a="aqui">← Traer a esta cámara</button><button class="btn" data-a="alla">Enviar a «${esc(otra.nombre)}» →</button></div><p class="small mut" style="margin:8px 0 0">Solo se copian los ajustes marcados. Lo propio de cada cámara (IP, MAC, Wi‑Fi, contraseñas) nunca se copia. Podrás deshacer desde el botón «Deshacer» del bloque.</p>`;
        cu.querySelector('[data-a=sd]').onchange = e => { soloDif = e.target.checked; pintar(); };
        const marcadas = () => [...cu.querySelectorAll('input[data-k]:checked')].map(c => c.dataset.k);
        /** Construye el JSON destino con los valores elegidos copiados desde el origen. */
        const construir = (dest, orig) => { const j = JSON.parse(JSON.stringify(dest)); const sel = marcadas(); sel.forEach(k => { const f = filas.find(x => x.k === k), v = orig.get(k); if (v) S.setAt(j, f.p, v.orig); }); return { j, n: sel.length }; };
        cu.querySelector('[data-a=aqui]').onclick = async () => {
          const { j, n } = construir(opt.base, B); if (!n){ toast('No hay ajustes marcados'); return; }
          if (!await confirmar('Traer ajustes', `Se copian ${n} ajustes de «${otra.nombre}» a esta cámara.`, 'Copiar')) return;
          try { await opt.escribirAqui(j); toast('Copiado a esta cámara'); cerrar(); } catch (e) { toast(e.message); }
        };
        cu.querySelector('[data-a=alla]').onclick = async () => {
          const { j, n } = construir(o.json, A); if (!n){ toast('No hay ajustes marcados'); return; }
          if (!await confirmar('Enviar ajustes', `Se copian ${n} ajustes de esta cámara a «${otra.nombre}».`, 'Copiar')) return;
          try { window.XmConfig && XmConfig.histPush(otra.id, opt.name.replace(/\.\[0\]$/, ''), o.ef, o.json); await api(`/api/camaras/${otra.id}/config?name=${encodeURIComponent(o.ef)}`, 'PUT', j); toast('Copiado a «' + otra.nombre + '»'); cerrar(); } catch (e) { toast(e.message); }
        };
      };
      pintar();
    }
  }
  return { abrir };
})();
