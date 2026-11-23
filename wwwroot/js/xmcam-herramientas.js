/**
 * Herramientas de la cámara: explorador de bloques (qué admite de verdad la cámara, IPv6 incluido) y copia de seguridad
 * (exportar e importar toda la configuración como un archivo .json). Las copias no incluyen nada propio de la cámara por defecto
 * en el bloque de red.
 */
(function(){
  const host = XM.$('herram'); if (!host) return;
  const { $, esc, api, toast, confirmar } = XM;
  const id = $('player').dataset.cam;
  const SOLO_LECTURA = /^(Ability\.|StorageInfo$|Storage$)/;
  const RED = /^NetWork\.(NetCommon|NetDHCP|NetDNS|Wifi|NetIPv6|NetIPV6|IPv6|Ipv6)$/;

  host.innerHTML = `<div class="card"><p class="small mut" style="margin:0 0 8px">Descubre qué bloques de configuración admite esta cámara y guarda o restaura una copia de seguridad.</p>
    <div class="row"><button class="btn tonal" data-a="ex" type="button">Analizar la cámara</button><button class="btn tonal" data-a="exp" type="button">Exportar copia</button><label class="btn tonal" style="cursor:pointer">Importar copia<input type="file" accept=".json,application/json" data-a="imp" hidden></label></div>
    <div data-a="res" style="margin-top:10px"></div></div>`;
  const res = host.querySelector('[data-a=res]');

  /** Copia texto al portapapeles; si el navegador lo impide, lo muestra seleccionado para copiarlo a mano. */
  async function copiar(txt){
    try { await navigator.clipboard.writeText(txt); toast('Copiado'); return; } catch (e) { /* sin permiso */ }
    res.insertAdjacentHTML('beforeend', '<textarea class="inp" style="height:160px;margin-top:8px" readonly></textarea>'); const t = res.lastElementChild; t.value = txt; t.focus(); t.select(); toast('Selecciona y copia (Ctrl+C)');
  }
  function descargar(nombre, obj){
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const nombreCam = async () => { try { const r = await api('/api/camaras'); const c = r.camaras.find(x => x.id === id); return c ? c.nombre : id; } catch (e) { return id; } };

  /** Analizar: lista de bloques con su estado; cada uno se puede abrir y editar. */
  host.querySelector('[data-a=ex]').onclick = async e => {
    const b = e.target; b.disabled = true; b.textContent = 'Analizando (puede tardar un minuto)…'; res.innerHTML = '';
    try {
      const r = await api(`/api/camaras/${id}/explorar`), ok = r.bloques.filter(x => x.ok), no = r.bloques.filter(x => !x.ok);
      res.innerHTML = `<p style="margin:0 0 8px"><b>${ok.length}</b> bloques compatibles de ${r.bloques.length} probados.</p>
        <div class="row" style="margin-bottom:8px"><button class="btn out" data-a="cp" type="button">Copiar todo el JSON</button><button class="btn out" data-a="dl" type="button">Descargar .json</button></div>
        <div>${ok.map((x, i) => `<div class="ac-it" data-i="${i}"><button class="ac-h" type="button"><span class="bt"><b>${esc(x.nombre)}</b><span class="sm mut">${x.bytes} caracteres${x.efectivo !== x.nombre ? ' · responde como ' + esc(x.efectivo) : ''}</span></span><span class="badge" style="color:var(--ok)">✓</span></button><div class="ac-b" hidden></div></div>`).join('')}</div>
        <details style="margin-top:8px"><summary class="small mut">No disponibles en esta cámara (${no.length})</summary><p class="small mut" style="overflow-wrap:anywhere">${no.map(x => esc(x.nombre)).join(' · ')}</p></details>
        <p class="small mut">${ok.some(x => /IPv6/i.test(x.nombre)) ? 'Esta cámara admite IPv6: aparece en «Red profesional».' : 'Ningún bloque de IPv6: esta cámara no lo soporta con los nombres habituales.'}</p>`;
      res.querySelectorAll('.ac-it').forEach(it => it.querySelector('.ac-h').onclick = () => {
        const bd = it.querySelector('.ac-b'), abrir = bd.hidden; bd.hidden = !abrir; it.classList.toggle('open', abrir);
        if (abrir && !bd.dataset.ok){ bd.dataset.ok = 1; XmConfig.mount(bd, { id, name: ok[+it.dataset.i].nombre, titulo: false }); }
      });
      const todo = async () => { const f = await api(`/api/camaras/${id}/explorar?completo=1`); const o = {}; f.bloques.filter(x => x.ok).forEach(x => o[x.efectivo] = x.datos); return o; };
      res.querySelector('[data-a=cp]').onclick = async () => copiar(JSON.stringify(await todo(), null, 2));
      res.querySelector('[data-a=dl]').onclick = async () => descargar(`bloques_${await nombreCam()}.json`, await todo());
    } catch (x) { res.innerHTML = `<p class="mut">${esc(x.message)}</p>`; }
    b.disabled = false; b.textContent = 'Analizar la cámara';
  };

  /** Exportar: todos los bloques compatibles en un archivo. */
  host.querySelector('[data-a=exp]').onclick = async e => {
    const b = e.target; b.disabled = true; b.textContent = 'Exportando…';
    try {
      const f = await api(`/api/camaras/${id}/explorar?completo=1`), nom = await nombreCam(), bloques = {};
      f.bloques.filter(x => x.ok && !SOLO_LECTURA.test(x.nombre)).forEach(x => bloques[x.efectivo] = x.datos);
      descargar(`copia_${nom}_${new Date().toISOString().slice(0, 10)}.json`, { formato: 'PanelCamaras-config-1', camara: nom, fecha: new Date().toISOString(), bloques });
      toast(Object.keys(bloques).length + ' bloques exportados');
    } catch (x) { toast(x.message); }
    b.disabled = false; b.textContent = 'Exportar copia';
  };

  /** Importar: elegir qué bloques restaurar (la red viene sin marcar). */
  host.querySelector('[data-a=imp]').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    let d; try { d = JSON.parse(await file.text()); } catch (x) { toast('El archivo no es un JSON válido'); return; }
    const bl = d && d.bloques && typeof d.bloques === 'object' ? d.bloques : d, nombres = Object.keys(bl).filter(n => bl[n] && typeof bl[n] === 'object' && !SOLO_LECTURA.test(n));
    if (!nombres.length){ toast('El archivo no contiene bloques'); return; }
    res.innerHTML = `<p style="margin:0 0 6px"><b>Restaurar desde ${esc(file.name)}</b>${d.camara ? ' (cámara «' + esc(d.camara) + '»)' : ''}</p>${nombres.map((n, i) => `<label class="row" style="gap:8px;padding:4px 0"><input type="checkbox" data-i="${i}" ${RED.test(n.replace(/\.\[0\]$/, '')) ? '' : 'checked'}> ${esc(n)}${RED.test(n.replace(/\.\[0\]$/, '')) ? ' <span class="small mut">(red: puede dejar la cámara sin conexión)</span>' : ''}</label>`).join('')}<div class="row" style="margin-top:8px"><button class="btn" data-a="ok" type="button">Restaurar los marcados</button></div>`;
    res.querySelector('[data-a=ok]').onclick = async () => {
      const sel = [...res.querySelectorAll('input[data-i]:checked')].map(c => nombres[+c.dataset.i]); if (!sel.length){ toast('Nada marcado'); return; }
      if (!await confirmar('Restaurar configuración', `Se escribirán ${sel.length} bloques en esta cámara. Cada uno se puede deshacer después desde su editor.`, 'Restaurar')) return;
      let bien = 0; const mal = [];
      for (const n of sel){
        try { const act = await fetch(`/api/camaras/${id}/config?name=${encodeURIComponent(n)}`).then(r => r.ok ? r.json() : null); if (act) XmConfig.histPush(id, n.replace(/\.\[0\]$/, ''), n, act);
          await api(`/api/camaras/${id}/config?name=${encodeURIComponent(n)}`, 'PUT', bl[n]); bien++; } catch (x) { mal.push(n); }
      }
      toast(`${bien} bloques restaurados` + (mal.length ? `; fallaron: ${mal.join(', ')}` : '')); res.innerHTML = '';
    };
  };
})();
