/**
 * Red profesional de la cámara: IP, máscara, puerta de enlace, DHCP, DNS, puertos, Wi‑Fi e IPv6 (si el firmware lo trae).
 * Se adapta a lo que la cámara devuelve: solo muestra y guarda los campos que existen. Antes de cambiar la IP comprueba
 * que sea válida, esté en tu subred y no la use otro equipo, pide confirmación y, después, actualiza la ficha de la
 * cámara en el panel (buscándola por MAC si hiciera falta).
 */
(function(){
  const host = XM.$('redPro'); if (!host) return;
  const { $, esc, api, toast, confirmar } = XM;
  const S = XmSchemas, V = XmVal;
  const id = $('player').dataset.cam;
  const BLQ = { common: 'NetWork.NetCommon', dhcp: 'NetWork.NetDHCP', dns: 'NetWork.NetDNS', wifi: 'NetWork.Wifi' };
  const V6 = ['NetWork.NetIPv6', 'NetWork.NetIPV6', 'NetWork.IPv6', 'NetWork.Ipv6'];
  let orig = {}, work = {}, reg = [], cargado = false;

  const url = n => `/api/camaras/${id}/config?name=${encodeURIComponent(n)}`;
  /** Lee un bloque; null si la cámara no lo tiene. */
  async function leer(n){
    try { const r = await fetch(url(n)); if (!r.ok) return null; const j = await r.json(); if (j === null || typeof j !== 'object') return null; return { ef: r.headers.get('X-Config-Name') || n, json: j }; }
    catch (e) { return null; }
  }
  const raiz = b => b && (Array.isArray(b.json) ? b.json[0] : b.json);
  /** Entrada de NetDHCP de una interfaz ("eth0", "wlan0"); si no hay nombres, por posición. */
  function dhcp(b, iface, pos){
    if (!b) return null; const a = Array.isArray(b.json) ? b.json : [b.json];
    return a.find(x => x && x.Interface === iface) || (a.every(x => !x || !x.Interface) ? a[pos] || null : null);
  }
  const copia = o => JSON.parse(JSON.stringify(o));

  /** Registra un campo editable (objeto + clave) y devuelve su fila HTML; '' si la cámara no tiene ese campo. */
  function campo(blk, o, claves, label, help, t, dis){
    if (!o) return ''; const key = claves.find(k => k in o && (o[k] === null || typeof o[k] !== 'object')); if (!key) return '';
    const n = reg.push({ blk, o, key, t, orig: o[key] }) - 1, v = o[key]; let ctl;
    if (t === 'bool') ctl = `<label class="switch"><input type="checkbox" data-r="${n}" ${S.toBool(v) ? 'checked' : ''}><i></i></label>`;
    else if (t === 'ip'){ const hex = typeof v === 'string' && /^0x/i.test(v); ctl = `<input class="inp" type="text" inputmode="decimal" data-r="${n}" value="${esc(hex ? V.ipDeHex(v) : v)}" ${dis ? 'disabled' : ''} placeholder="0.0.0.0"><div class="small bad" hidden>IP no válida</div>`; }
    else if (t === 'num') ctl = `<input class="inp" type="number" inputmode="numeric" data-r="${n}" value="${esc(v)}">`;
    else if (t === 'ro') ctl = `<b>${esc(v)}</b>`;
    else ctl = `<input class="inp" type="${t === 'pass' ? 'password' : 'text'}" data-r="${n}" value="${esc(v)}" autocomplete="off">`;
    const vals = window.XmDic ? XmDic.valores(BLQ.common, key, v, t === 'ip' ? 'iphex' : t === 'bool' ? 'bool' : t === 'num' ? 'num' : 'str') : '';
    return `<div class="cfg-f${t === 'bool' ? ' tog' : ''}${dis ? ' dim' : ''}"><div class="tx"><div class="t">${label}</div>${help ? `<div class="h">${help}</div>` : ''}${t === 'ro' || !vals ? '' : `<div class="v">Valores: ${esc(vals)}</div>`}</div><div class="ctl">${ctl}</div></div>`;
  }
  const tarjeta = (tit, filas) => filas.join('') ? `<div class="h2">${tit}</div><div class="cfg-card">${filas.join('')}</div>` : '';

  function pintar(){
    reg = []; const c = raiz(work.common), w = raiz(work.wifi), dn = raiz(work.dns);
    const eth = dhcp(work.dhcp, 'eth0', 0), wl = dhcp(work.dhcp, 'wlan0', 1);
    const cableDhcp = !!(eth && S.toBool(eth.Enable)), wifiDhcp = !!(wl && S.toBool(wl.Enable));
    let h = '';
    if (!c) h += '<p class="mut">Esta cámara no devolvió el bloque NetWork.NetCommon, así que no se puede leer su red desde aquí. Usa «Analizar la cámara» (en Herramientas) para ver qué bloques admite.</p>';
    h += tarjeta('Cable (Ethernet)', [
      campo('common', c, ['MAC', 'DvrMac'], 'Dirección MAC', '', 'ro'),
      campo('dhcp', eth, ['Enable'], 'Obtener IP automáticamente (DHCP)', 'Si lo activas, el router asigna la IP y la cámara puede cambiar de dirección.', 'bool'),
      campo('common', c, ['HostIP'], 'Dirección IP', 'Debe estar en la misma red que este equipo y no usarla otro dispositivo.', 'ip', cableDhcp),
      campo('common', c, ['Submask'], 'Máscara de subred', 'Casi siempre 255.255.255.0.', 'ip', cableDhcp),
      campo('common', c, ['GateWay', 'Gateway'], 'Puerta de enlace', 'La IP de tu router.', 'ip', cableDhcp)]);
    h += tarjeta('DNS', [
      campo('dns', dn, ['Address', 'PrimaryDNS', 'Dns', 'DNS'], 'DNS principal', 'Por ejemplo la IP de tu router, 8.8.8.8 (Google) o 1.1.1.1.', 'ip', cableDhcp),
      campo('dns', dn, ['SpareAddress', 'SecondaryDNS', 'Dns2', 'DNS2'], 'DNS secundario', 'Opcional; se usa si el principal falla.', 'ip', cableDhcp)]);
    h += tarjeta('Nombre y puertos', [
      campo('common', c, ['HostName'], 'Nombre en la red', '', 'str'),
      campo('common', c, ['HttpPort'], 'Puerto web (HTTP)', 'Por defecto 80.', 'num'),
      campo('common', c, ['TCPPort'], 'Puerto de control', 'Por defecto 34567. Si lo cambias, hay que cambiarlo también en la ficha de la cámara.', 'num'),
      campo('common', c, ['UDPPort'], 'Puerto de descubrimiento', 'Por defecto 34568.', 'num'),
      campo('common', c, ['SSLPort'], 'Puerto seguro (HTTPS)', '', 'num')]);
    h += tarjeta('Wi‑Fi', [
      campo('wifi', w, ['Enable'], 'Wi‑Fi activado', '', 'bool'),
      campo('wifi', w, ['SSID'], 'Nombre de la red', '', 'str'),
      campo('wifi', w, ['Keys', 'Key', 'Password'], 'Contraseña', '', 'pass'),
      campo('dhcp', wl, ['Enable'], 'Wi‑Fi: DHCP', 'La IP de la conexión Wi‑Fi la da el router.', 'bool'),
      campo('wifi', w, ['HostIP'], 'Wi‑Fi: dirección IP', '', 'ip', wifiDhcp),
      campo('wifi', w, ['Submask'], 'Wi‑Fi: máscara de subred', '', 'ip', wifiDhcp),
      campo('wifi', w, ['GateWay', 'Gateway'], 'Wi‑Fi: puerta de enlace', '', 'ip', wifiDhcp)]);
    h += '<div id="red6"></div><div class="cfgbar"><button class="btn out" data-a="rec" type="button">Recargar</button><button class="btn" data-a="save" type="button">Guardar red</button></div><p class="small mut">Antes de aplicar se comprueba la IP nueva. Si algo falla, el panel busca la cámara por su MAC. Cada bloque guardado se puede deshacer desde su editor.</p>';
    $('redBody').innerHTML = h;
    $('redBody').querySelectorAll('[data-r]').forEach(el => {
      const r = reg[+el.dataset.r];
      const fn = () => {
        if (r.t === 'bool'){ r.o[r.key] = S.boolLike(r.orig, el.checked); if (r.blk === 'dhcp') pintar(); return; }
        if (r.t === 'ip'){ const ok = V.ipValida(el.value), msg = el.nextElementSibling; if (msg) msg.hidden = ok; if (!ok) return; const hex = typeof r.orig === 'string' && /^0x/i.test(r.orig); r.o[r.key] = hex ? V.ipAHex(el.value, r.orig) : el.value.trim(); return; }
        if (r.t === 'num'){ const n = S.parseLike(typeof r.orig === 'number' ? r.orig : 0, el.value); if (n !== undefined) r.o[r.key] = n; return; }
        r.o[r.key] = el.value;
      };
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', fn);
    });
    $('redBody').querySelector('[data-a=rec]').onclick = cargar; $('redBody').querySelector('[data-a=save]').onclick = guardar;
    // IPv6: si el firmware lo trae, se edita con el editor genérico
    (async () => { const cont = $('red6'); if (!cont) return; for (const n of V6){ const b = await leer(n); if (b){ cont.innerHTML = '<div class="h2">IPv6</div><div class="ac-v6"></div>'; XmConfig.mount(cont.querySelector('.ac-v6'), { id, name: n, titulo: false }); return; } }
      cont.innerHTML = '<div class="h2">IPv6</div><p class="small mut">Esta cámara no expone ajustes de IPv6 (el firmware no los incluye).</p>'; })();
  }

  async function cargar(){
    $('redBody').innerHTML = '<p class="mut">Leyendo la red de la cámara…</p>';
    orig = {}; work = {};
    for (const k of Object.keys(BLQ)){ const b = await leer(BLQ[k]); if (b){ orig[k] = b; work[k] = copia(b); } }
    cargado = true; pintar();
  }

  const mac = () => { const c = raiz(orig.common); return c ? String(c.MAC || c.DvrMac || '').toLowerCase().replace(/[^0-9a-f]/g, '') : ''; };
  const ipDe = c => { if (!c) return ''; const v = c.HostIP; return typeof v === 'string' && /^0x/i.test(v) ? V.ipDeHex(v) : String(v || ''); };
  const dormir = ms => new Promise(r => setTimeout(r, ms));

  /** Tras cambiar la IP, actualiza la ficha del panel; si la cámara no responde en la IP nueva, la busca por MAC. */
  async function reconectar(ipNueva){
    for (let i = 0; i < 3 && ipNueva; i++){ await dormir(3000); try { await api('/api/camaras/' + id, 'PATCH', { host: ipNueva, probar: true }); return ipNueva; } catch (e) { /* aún no responde */ } }
    try {
      const hall = await api('/api/camaras/buscar', 'POST'), m = mac(), f = hall.find(x => String(x.mac || '').toLowerCase().replace(/[^0-9a-f]/g, '') === m);
      if (f){ await api('/api/camaras/' + id, 'PATCH', { host: f.ip, probar: true }); return f.ip; }
    } catch (e) { /* sin resultado */ }
    return null;
  }

  async function guardar(){
    const sucios = Object.keys(work).filter(k => JSON.stringify(work[k].json) !== JSON.stringify(orig[k].json));
    if (!sucios.length){ toast('Sin cambios'); return; }
    const c0 = raiz(orig.common), c1 = raiz(work.common), ipVieja = ipDe(c0), ipNueva = ipDe(c1), cambiaIp = !!c0 && ipVieja !== ipNueva;
    const e0 = dhcp(orig.dhcp, 'eth0', 0), e1 = dhcp(work.dhcp, 'eth0', 0), pasaADhcp = !!(e1 && S.toBool(e1.Enable) && !(e0 && S.toBool(e0.Enable)));
    const avisos = [];
    if (cambiaIp && !(e1 && S.toBool(e1.Enable))){
      let r; try { r = await api(`/api/camaras/${id}/red/comprobar`, 'POST', { ip: ipNueva }); } catch (e) { toast(e.message); return; }
      if (!r.valida){ toast('La IP nueva no es válida'); return; }
      if (r.enUso){ toast(`La IP ${r.ip} ya la usa otro dispositivo. Elige otra.`); return; }
      if (!r.mismaSubred) avisos.push('La IP nueva está fuera de la red de este equipo: el panel no podrá volver a conectar con la cámara.');
    }
    if (pasaADhcp) avisos.push('Con DHCP la cámara recibirá una IP del router; el panel la buscará por su MAC.');
    if (sucios.includes('wifi')) avisos.push('Cambiar el Wi‑Fi puede desconectar la cámara.');
    const resumen = (cambiaIp ? `IP: ${ipVieja} → ${ipNueva}. ` : '') + (avisos.length ? avisos.join(' ') + ' ' : '') + '¿Aplicar los cambios?';
    if (!await confirmar('Cambiar la red de la cámara', resumen, 'Aplicar')) return;
    const orden = ['wifi', 'dns', 'dhcp', 'common'].filter(k => sucios.includes(k));
    let conexionPerdida = false;
    for (const k of orden){
      try { XmConfig.histPush(id, BLQ[k], orig[k].ef, orig[k].json); await api(url(orig[k].ef), 'PUT', work[k].json); }
      catch (e) { if (k === 'common' || k === 'dhcp' || k === 'wifi') conexionPerdida = true; else { toast(`No se pudo guardar ${BLQ[k]}: ${e.message}`); return; } }
    }
    if (cambiaIp || pasaADhcp || conexionPerdida){
      toast('Aplicado. Buscando la cámara…');
      const ip = await reconectar(cambiaIp ? ipNueva : null);
      if (ip){ toast('Cámara actualizada en ' + ip); setTimeout(() => { location.href = `/camara/${id}?panel=ajustes`; }, 1200); }
      else toast('No encuentro la cámara. Búscala por su MAC en «Conexión → Buscar en la red».');
    } else { toast('Red guardada'); cargar(); }
  }

  host.innerHTML = '<div class="ac-it" id="redIt"><button class="ac-h" type="button" aria-expanded="false"><span class="bt"><b>Red profesional</b><span class="sm mut">IP, máscara, puerta de enlace, DHCP, DNS, Wi‑Fi e IPv6</span></span><svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><div class="ac-b" id="redBody" hidden></div></div>';
  $('redIt').querySelector('.ac-h').onclick = () => { const b = $('redBody'), abrir = b.hidden; b.hidden = !abrir; $('redIt').classList.toggle('open', abrir); if (abrir && !cargado) cargar(); };
})();
