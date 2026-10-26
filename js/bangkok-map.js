import { BKK } from './bangkok-geodata.js';
import { LANDMARKS, arrivalAt, getLocationLabel } from './bangkok-config.js';

export class BangkokMap {
  constructor(controller, teleport) {
    this.controller = controller;
    this.teleport = teleport;
    this.modal = document.getElementById('fullmap-modal');
    this.mini = document.getElementById('minimap-canvas');
    this.canvas = document.getElementById('fullmap-canvas');
    this.center = { x: -700, z: -900 };
    this.scale = 0.1;
    this.open = false;
    this.drag = null;
    document.getElementById('btn-open-map').onclick = () => this.toggle();
    document.getElementById('minimap-card').onclick = () => this.toggle(true);
    document.querySelector('.radar-attribution').onclick = e => e.stopPropagation();
    document.getElementById('close-fullmap-btn').onclick = () => this.toggle(false);
    document.getElementById('map-zoom-in').onclick = () => this.zoom(1.4);
    document.getElementById('map-zoom-out').onclick = () => this.zoom(1 / 1.4);
    document.getElementById('map-center-player').onclick = () => { this.center = { ...controller.getActiveEntity().position }; this.scale = 0.7; };
    document.getElementById('map-view-all').onclick = () => { this.center = { x: -500, z: -900 }; this.scale = Math.min(innerWidth / 14000, innerHeight / 10500); };
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    this.canvas.addEventListener('pointerdown', e => {
      this.drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      this.center.x -= (e.clientX - this.drag.x) / this.scale;
      this.center.z -= (e.clientY - this.drag.y) / this.scale;
      this.drag.moved ||= Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY) > 5;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    this.canvas.addEventListener('pointerup', e => {
      if (this.drag && !this.drag.moved) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) / this.scale + this.center.x;
        const z = (e.clientY - rect.top - rect.height / 2) / this.scale + this.center.z;
        const result = this.teleport(arrivalAt(x, z));
        if (result) this.toggle(false);
      }
      this.drag = null;
    });
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
    const input = document.getElementById('fullmap-search');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLocaleLowerCase();
      if (q.length < 2) return;
      const landmark = LANDMARKS.find(l => `${l.name} ${l.thai}`.toLocaleLowerCase().includes(q));
      const road = BKK.roads.find(r => r.name.toLocaleLowerCase().includes(q));
      if (landmark) { this.center = { x: landmark.x, z: landmark.z }; this.scale = 0.6; }
      else if (road) { const p = road.points[Math.floor(road.points.length / 2)]; this.center = { x: p[0], z: p[1] }; this.scale = 0.6; }
      document.getElementById('fullmap-hover-info').textContent = landmark?.name || road?.name || 'No matching place. Try Silom, Siam, or Wat Arun.';
    });
    this.modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const targets = [...this.modal.querySelectorAll('button, input, [tabindex="0"]')];
      const first = targets[0], last = targets.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.getElementById('fullmap-counts').textContent = `${BKK.roads.length.toLocaleString()} road segments · ${LANDMARKS.length} places`;
  }
  zoom(factor) { this.scale = Math.max(0.025, Math.min(4, this.scale * factor)); }
  toggle(open = !this.open) {
    this.open = open;
    this.modal.classList.toggle('hidden', !open);
    document.body.classList.toggle('map-open', open);
    if (open) {
      this.previousFocus = document.activeElement;
      this.controller.resetInput();
      document.getElementById('fullmap-search').focus();
    } else this.previousFocus?.focus();
    this.onToggle?.(open);
  }
  draw(canvas, center, scale, full) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio, 2);
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) { canvas.width = width * ratio; canvas.height = height * ratio; }
    const c = canvas.getContext('2d');
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.fillStyle = '#222d2c'; c.fillRect(0, 0, width, height);
    c.save(); c.translate(width / 2, height / 2); c.scale(scale, scale); c.translate(-center.x, -center.z);
    const visible = points => points.some(([x, z]) => Math.abs(x - center.x) < width / scale && Math.abs(z - center.z) < height / scale);
    const path = points => { c.beginPath(); points.forEach(([x, z], i) => i ? c.lineTo(x, z) : c.moveTo(x, z)); };
    for (const area of BKK.water) {
      if (area.line) { path(area.line); c.lineWidth = 260; c.strokeStyle = '#4b777a'; c.stroke(); }
      else { path(area); c.fillStyle = '#4b777a'; c.fill(); }
    }
    for (const p of BKK.parks) { path(p.points); c.fillStyle = '#476348'; c.fill(); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of BKK.roads) {
      if (!visible(r.points)) continue;
      path(r.points); c.lineWidth = r.width + 1 / scale; c.strokeStyle = r.major ? '#a39a7d' : '#59605a'; c.stroke();
    }
    for (const points of BKK.rail) { path(points); c.lineWidth = 1 / scale; c.strokeStyle = '#78a98c'; c.stroke(); }
    c.font = `${(full ? 12 : 9) / scale}px "Noto Sans Thai", sans-serif`;
    c.textAlign = 'left';
    for (const l of LANDMARKS) {
      c.fillStyle = '#e9c579'; c.beginPath(); c.arc(l.x, l.z, 3 / scale, 0, Math.PI * 2); c.fill();
      if (full || scale > 0.3) {
        c.strokeStyle = '#222d2c'; c.lineWidth = 3 / scale; c.strokeText(l.name, l.x + 7 / scale, l.z - 5 / scale);
        c.fillStyle = '#f5e7c9'; c.fillText(l.name, l.x + 7 / scale, l.z - 5 / scale);
      }
    }
    const player = this.controller.getActiveEntity();
    c.translate(player.position.x, player.position.z); c.rotate(-player.heading);
    c.beginPath(); c.moveTo(0, 8 / scale); c.lineTo(-5 / scale, -5 / scale); c.lineTo(5 / scale, -5 / scale); c.closePath();
    c.fillStyle = '#f2c467'; c.strokeStyle = '#222d2c'; c.lineWidth = 2 / scale; c.stroke(); c.fill(); c.restore();
  }
  update() {
    const p = this.controller.getActiveEntity().position;
    this.draw(this.mini, p, 0.16, false);
    if (this.open) {
      this.draw(this.canvas, this.center, this.scale, true);
      document.getElementById('fullmap-player-info').textContent = getLocationLabel(p.x, p.z);
    }
  }
}
