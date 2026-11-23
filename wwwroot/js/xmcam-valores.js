/**
 * Decodificador de valores de las cámaras XM (XmVal). Las cámaras guardan muchos datos en formatos internos:
 * IPs en hexadecimal "al revés" ("0x1501A8C0" = 192.168.1.21), máscaras de canales ("0x00000005"), horarios
 * ("1 00:00:00-24:00:00") y números en hexadecimal. Este módulo los reconoce por su forma y su nombre y
 * ofrece controles legibles que escriben de vuelta exactamente el mismo formato. Es independiente del resto del proyecto.
 */
window.XmVal = (function(){
  const HEX = /^0x[0-9a-f]{1,8}$/i;
  const HORA = /^([01]) (\d{1,2}:\d\d):\d\d-(\d{1,2}:\d\d):\d\d$/;
  const IP4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const IPN = /^(HostIP|Submask|SubMask|GateWay|Gateway|Address|SpareAddress|PrimaryDNS|SecondaryDNS|Dns\d?|DNS\d?|Netmask|NetMask|IpAddr|IPAddr|DefaultGateway)$/;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');

  /** "0x1501A8C0" → "192.168.1.21" (null si no es hexadecimal). */
  function ipDeHex(h){
    if (!HEX.test(h)) return null; const v = parseInt(h.slice(2), 16) >>> 0;
    return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255].join('.');
  }
  /** "192.168.1.21" → "0x1501A8C0" (null si la IP no es válida); conserva mayúsculas/minúsculas del original. */
  function ipAHex(t, like){
    const m = IP4.exec(String(t).trim()); if (!m) return null; const o = m.slice(1).map(Number); if (o.some(x => x > 255)) return null;
    const v = ((o[3] << 24) | (o[2] << 16) | (o[1] << 8) | o[0]) >>> 0; let h = v.toString(16).padStart(8, '0');
    h = /[a-f]/.test(String(like || '').slice(2)) ? h.toLowerCase() : h.toUpperCase(); return '0x' + h;
  }
  const ipValida = t => { const m = IP4.exec(String(t).trim()); return !!m && m.slice(1).every(x => Number(x) <= 255); };

  /** Tipo de un valor según su nombre de clave y su contenido: iphex, ip, mask, hex, time, bool, num o str. */
  function kind(last, v){
    last = String(last);
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return 'num';
    if (typeof v !== 'string') return 'str';
    if (HORA.test(v)) return 'time';
    if (HEX.test(v)){
      if (IPN.test(last)) return 'iphex';
      if (/Mask$/.test(last) && !/^(Submask|SubMask|Netmask|NetMask)$/.test(last)) return 'mask';
      if (/Enable$/.test(last) || /^(Enable|On)$/.test(last)) return 'bool';
      return 'hex';
    }
    if (IP4.test(v) && IPN.test(last)) return 'ip';
    return 'str';
  }
  /** Los tipos que necesitan un control propio (el resto los pinta el editor con sus controles habituales). */
  const necesitaWidget = k => k === 'iphex' || k === 'ip' || k === 'mask' || k === 'hex' || k === 'time';

  /** Texto legible de un valor (para listas y comparaciones). */
  function mostrar(last, v){
    const k = kind(last, v);
    if (k === 'iphex') return ipDeHex(v);
    if (k === 'hex') return String(parseInt(v.slice(2), 16));
    if (k === 'mask'){ const n = parseInt(v.slice(2), 16) >>> 0; if (!n) return 'Ningún canal'; const c = []; for (let b = 0; b < 32; b++) if ((n >>> b) & 1) c.push(b + 1); return 'Canales ' + c.join(', '); }
    if (k === 'time'){ const m = HORA.exec(v); return (m[1] === '1' ? 'Activo ' : 'Desactivado ') + m[2] + '–' + m[3]; }
    if (k === 'bool') return (typeof v === 'boolean' ? v : parseInt(String(v).replace(/^0x/i, ''), 16) !== 0 && String(v) !== 'false' && Number(v) !== 0) ? 'Sí' : 'No';
    return v === '' ? '—' : String(v);
  }

  /**
   * HTML de un control legible para el valor v. Lleva un <input type="hidden" data-k="clave"> con el valor final
   * ya en el formato de la cámara (el editor lee ese campo al guardar); wire() lo mantiene al día.
   */
  function widget(k, key, v){
    const hid = `<input type="hidden" data-k="${esc(key)}" value="${esc(v)}">`, bad = '<div class="small bad" hidden>Valor no válido</div>';
    if (k === 'iphex' || k === 'ip') return `<div class="w" data-w="${k}" data-orig="${esc(v)}">${hid}<input class="inp" type="text" inputmode="decimal" autocomplete="off" value="${esc(k === 'iphex' ? ipDeHex(v) : v)}" placeholder="0.0.0.0">${bad}</div>`;
    if (k === 'hex'){ const n = parseInt(v.slice(2), 16); return `<div class="w" data-w="hex" data-orig="${esc(v)}">${hid}<input class="inp" type="number" inputmode="numeric" step="1" min="0" value="${n}">${bad}<div class="small mut">Valor interno ${esc(v)}</div></div>`; }
    if (k === 'mask'){
      const n = parseInt(v.slice(2), 16) >>> 0, extra = n >>> 4 ? ` · otros bits: 0x${(n & ~15 >>> 0).toString(16).toUpperCase()}` : '';
      let ch = ''; for (let i = 0; i < 4; i++) ch += `<label class="chip"><input type="checkbox" data-b="${i}" ${(n >>> i) & 1 ? 'checked' : ''}> Canal ${i + 1}</label>`;
      return `<div class="w" data-w="mask" data-orig="${esc(v)}">${hid}<div class="chips" style="flex-wrap:wrap">${ch}</div><div class="small mut">${n ? esc(mostrar('xMask', v)) : 'Ningún canal'}${extra}</div></div>`;
    }
    const m = HORA.exec(v);
    return `<div class="w" data-w="time" data-orig="${esc(v)}">${hid}<div class="row" style="gap:8px;flex-wrap:nowrap"><label class="switch"><input type="checkbox" data-t="en" ${m[1] === '1' ? 'checked' : ''}><i></i></label><input class="inp" style="width:84px" type="text" data-t="a" value="${esc(m[2])}" inputmode="numeric" placeholder="00:00" aria-label="Desde"><span>–</span><input class="inp" style="width:84px" type="text" data-t="b" value="${esc(m[3])}" inputmode="numeric" placeholder="24:00" aria-label="Hasta"></div>${bad}</div>`;
  }
  /** Conecta los controles de widget() dentro de root: al editarlos actualizan el campo oculto con el formato de la cámara. */
  function wire(root){
    root.querySelectorAll('.w[data-w]').forEach(w => {
      const k = w.dataset.w, orig = w.dataset.orig, hid = w.querySelector('input[type=hidden]'), msg = w.querySelector('.bad');
      const set = val => { hid.value = val === null ? orig : val; if (msg) msg.hidden = val !== null; w.classList.toggle('malo', val === null); };
      const calc = () => {
        if (k === 'iphex' || k === 'ip'){ const t = w.querySelector('input.inp').value; if (!ipValida(t)) return set(null); return set(k === 'iphex' ? ipAHex(t, orig) : t.trim()); }
        if (k === 'hex'){ const t = w.querySelector('input.inp').value.trim(); if (!/^\d+$/.test(t)) return set(null); const n = Number(t); if (n > 0xFFFFFFFF) return set(null); let h = n.toString(16).padStart(orig.length - 2, '0'); h = /[a-f]/.test(orig.slice(2)) ? h.toLowerCase() : h.toUpperCase(); return set('0x' + h); }
        if (k === 'mask'){ let n = parseInt(orig.slice(2), 16) >>> 0; w.querySelectorAll('input[data-b]').forEach(c => { const b = +c.dataset.b; n = c.checked ? (n | (1 << b)) >>> 0 : (n & ~(1 << b)) >>> 0; }); return set('0x' + n.toString(16).toUpperCase().padStart(8, '0')); }
        const en = w.querySelector('[data-t=en]').checked ? 1 : 0, a = w.querySelector('[data-t=a]').value.trim(), b = w.querySelector('[data-t=b]').value.trim(), H = /^([01]?\d|2[0-4]):[0-5]\d$/;
        if (!H.test(a) || !H.test(b)) return set(null); return set(en + ' ' + a.replace(/^(\d):/, '0$1:') + ':00-' + b.replace(/^(\d):/, '0$1:') + ':00');
      };
      w.addEventListener('input', calc); w.addEventListener('change', calc);
    });
  }
  return { kind, necesitaWidget, mostrar, widget, wire, ipDeHex, ipAHex, ipValida, esc };
})();
