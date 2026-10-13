/**
 * Joystick analógico para PTZ (equivale a PtzJoystick.kt).
 *  - Dirección: 8 sectores con histéresis. Velocidad: proporcional a lo que se aleja el mando (1..8).
 *  - Al soltar el mando vuelve al centro con un muelle y se avisa onMove(null, 0).
 *  - onMove solo se llama cuando cambia la dirección o la velocidad.
 * Los colores salen de las variables CSS del tema activo.
 */
class XmJoystick {
  constructor(canvas, onMove){
    this.c = canvas; this.g = canvas.getContext('2d'); this.onMove = onMove;
    this.knob = { x: 0, y: 0 }; this.sector = -1; this.inten = 0; this.press = 0; this.pressed = false;
    this.lastCmd = null; this.lastStep = 0; this.cur = -1; this.pid = null; this.raf = 0; this.vel = { x: 0, y: 0 };
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas);
    canvas.addEventListener('pointerdown', e => this._down(e));
    canvas.addEventListener('pointermove', e => this._move(e));
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => canvas.addEventListener(t, e => this._up(e)));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    this._draw();
  }
  static SECTORS = ['DirectionRight', 'DirectionRightUp', 'DirectionUp', 'DirectionLeftUp', 'DirectionLeft', 'DirectionLeftDown', 'DirectionDown', 'DirectionRightDown'];
  static TRAVEL = 0.64; static DEAD = 0.16;

  _resize(){
    const r = this.c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    this.c.width = Math.max(1, Math.round(r.width * d)); this.c.height = Math.max(1, Math.round(r.height * d)); this.d = d;
    this._draw();
  }
  _pos(e){ const r = this.c.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.d, y: (e.clientY - r.top) * this.d }; }
  _down(e){
    if (this.pid !== null) return;
    this.pid = e.pointerId; this.c.setPointerCapture(e.pointerId); cancelAnimationFrame(this.raf);
    this.pressed = true; this.cur = -1; this._update(this._pos(e)); try { navigator.vibrate && navigator.vibrate(15); } catch (_) {}
    e.preventDefault();
  }
  _move(e){ if (e.pointerId === this.pid){ this._update(this._pos(e)); e.preventDefault(); } }
  _up(e){
    if (e.pointerId !== this.pid) return;
    this.pid = null; this.pressed = false; this.sector = -1; this.inten = 0; this.cur = -1;
    this.lastCmd = null; this.lastStep = 0; this.onMove(null, 0);
    this._spring();
  }
  _update(p){
    const s = this.c.width, c = s / 2, limit = s / 2 * XmJoystick.TRAVEL;
    const dx = p.x - c, dy = p.y - c, len = Math.hypot(dx, dy), n = Math.min(len, limit) / limit;
    this.knob = len > 0 ? { x: dx / len * n, y: dy / len * n } : { x: 0, y: 0 };
    this.inten = n < XmJoystick.DEAD ? 0 : n;
    if (n < XmJoystick.DEAD) this.cur = -1;
    else {
      let ang = Math.atan2(-dy, dx) * 180 / Math.PI; if (ang < 0) ang += 360;
      const ideal = Math.round(ang / 45) % 8;
      const diff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
      this.cur = (this.cur >= 0 && diff(ang, this.cur * 45) < 28) ? this.cur : ideal;
    }
    const cmd = this.cur >= 0 ? XmJoystick.SECTORS[this.cur] : null;
    const t = Math.min(1, Math.max(0, (n - XmJoystick.DEAD) / (1 - XmJoystick.DEAD)));
    const step = cmd === null ? 0 : 1 + Math.round(Math.pow(t, 1.3) * 7);
    if (this.cur !== this.sector){ if (this.cur >= 0) try { navigator.vibrate && navigator.vibrate(5); } catch (_) {} this.sector = this.cur; }
    if (cmd !== this.lastCmd || step !== this.lastStep){ this.lastCmd = cmd; this.lastStep = step; this.onMove(cmd, step); }
    this._draw();
  }
  /** Devuelve el mando al centro con un muelle amortiguado. */
  _spring(){
    const k = 0.22, damp = 0.72;
    const tick = () => {
      this.vel.x = (this.vel.x - this.knob.x * k) * damp; this.vel.y = (this.vel.y - this.knob.y * k) * damp;
      this.knob.x += this.vel.x; this.knob.y += this.vel.y;
      this._draw();
      if (Math.hypot(this.knob.x, this.knob.y) > 0.004 || Math.hypot(this.vel.x, this.vel.y) > 0.004) this.raf = requestAnimationFrame(tick);
      else { this.knob = { x: 0, y: 0 }; this.vel = { x: 0, y: 0 }; this._draw(); }
    };
    this.vel = { x: 0, y: 0 }; this.raf = requestAnimationFrame(tick);
  }
  _css(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  _rgba(hex, a){
    const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return `rgba(${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)},${a})`;
  }
  _draw(){
    const g = this.g, S = this.c.width, c = S / 2, r = S / 2, d = this.d || 1, T = XmJoystick.TRAVEL;
    if (!S) return;
    const acc = this._css('--primary') || '#3b82f6', baseHi = this._css('--surface-variant') || '#171b22', baseLo = this._css('--bg') || '#0e1116';
    const line = this._css('--outline') || '#2a3140', knobHi = this._css('--primary-container') || '#1d3a6b';
    const kr = r * 0.27, limit = r * T, kx = c + this.knob.x * limit, ky = c + this.knob.y * limit;
    const act = this.sector, inten = this.inten, pr = this.pressed ? 1 : 0;
    g.clearRect(0, 0, S, S);
    // base
    let gr = g.createRadialGradient(c, c, 0, c, c, r); gr.addColorStop(0, baseHi); gr.addColorStop(1, baseLo);
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill();
    g.strokeStyle = this._rgba(line.startsWith('#') ? line : '#2a3140', .6); g.lineWidth = 2 * d; g.beginPath(); g.arc(c, c, r - d, 0, 7); g.stroke();
    // sector activo y arco de velocidad
    if (act >= 0){
      g.fillStyle = this._rgba(acc, .16 + .34 * inten); g.beginPath(); g.moveTo(c, c);
      const a0 = -(act * 45 + 22.5) * Math.PI / 180, a1 = -(act * 45 - 22.5) * Math.PI / 180;
      g.arc(c, c, r, a0, a1); g.closePath(); g.fill();
    }
    if (inten > 0){
      g.strokeStyle = acc; g.lineWidth = 4 * d; g.lineCap = 'round'; g.beginPath();
      g.arc(c, c, r - 6 * d, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * inten); g.stroke();
    }
    // anillo guía y flechas
    g.strokeStyle = this._rgba(line.startsWith('#') ? line : '#2a3140', .35); g.lineWidth = d; g.setLineDash([10 * d, 12 * d]);
    g.beginPath(); g.arc(c, c, limit, 0, 7); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 8; i++){
      const active = i === act, s = r * (active ? .085 : .06);
      g.save(); g.translate(c, c); g.rotate(-i * Math.PI / 4);
      const x = r * .84;
      g.fillStyle = active ? acc : this._rgba(line.startsWith('#') ? line : '#2a3140', .55);
      g.beginPath(); g.moveTo(x + s, 0); g.lineTo(x - s * .7, -s * .8); g.lineTo(x - s * .7, s * .8); g.closePath(); g.fill(); g.restore();
    }
    g.fillStyle = this._rgba(line.startsWith('#') ? line : '#2a3140', .5); g.beginPath(); g.arc(c, c, 3 * d, 0, 7); g.fill();
    // estela, sombra y mando
    if (this.knob.x || this.knob.y){
      g.strokeStyle = this._rgba(acc, .25 + .3 * inten); g.lineWidth = kr * .55; g.lineCap = 'round';
      g.beginPath(); g.moveTo(c, c); g.lineTo(kx, ky); g.stroke();
    }
    const kR = kr * (1 + .10 * pr);
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(kx, ky + 4 * d, kR, 0, 7); g.fill();
    gr = g.createRadialGradient(kx - kr * .3, ky - kr * .3, 0, kx - kr * .3, ky - kr * .3, kr * 1.5);
    gr.addColorStop(0, knobHi); gr.addColorStop(1, acc);
    g.fillStyle = gr; g.beginPath(); g.arc(kx, ky, kR, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2 * d; g.beginPath(); g.arc(kx, ky, kR * .55, 0, 7); g.stroke();
  }
  /** Vuelve a pintar (p. ej. tras cambiar de tema). */
  refresh(){ this._draw(); }
}
