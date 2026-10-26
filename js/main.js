import * as THREE from 'three/webgpu';
import { LANDMARKS, arrivalAt, getLocationLabel, isTypingInField } from './bangkok-config.js';
import { buildBangkok } from './bangkok-world.js';
import { BangkokMap } from './bangkok-map.js';
import { ThirdPersonControllerManager } from './controllers.js';
import { CameraSystem, CAMERA_PRESETS } from './cameras.js';
import { TouchControls } from './touch-controls.js';
import { GamepadControls } from './gamepad-controls.js';
import { LightingSystem } from './lighting.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'slop-bangkok-player-v1';
async function initApp() {
  $('loading-status').textContent = 'Starting the renderer…';
  const renderer = new THREE.WebGPURenderer({ antialias: true, reversedDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1, 1600 / innerWidth));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  $('canvas-container').appendChild(renderer.domElement);
  await renderer.init();
  await document.fonts.ready;
  $('loading-status').textContent = 'Building Bangkok’s roads, river, and skyline…';
  const scene = new THREE.Scene();
  const lighting = new LightingSystem(scene, renderer);
  lighting.sunLight.shadow.mapSize.set(1024, 1024);
  const world = buildBangkok(scene);
  const controller = new ThirdPersonControllerManager(scene, world.colliders);
  const camera = new CameraSystem(renderer.domElement, controller);
  const touch = new TouchControls(controller);
  const modes = ['person', 'car', 'cyclist', 'helicopter'];
  let map;
  const gamepad = new GamepadControls(controller, camera, {
    onCycleMode: step => selectMode(modes[(modes.indexOf(controller.activeMode) + step + 4) % 4]),
    onCycleCamera: cycleCamera, onToggleMap: () => map.toggle(), onCloseMap: () => map.toggle(false)
  });
  // Save keys are city-specific so Manhattan coordinates cannot leak into Bangkok.
  const start = LANDMARKS[0];
  for (let i = 0; i < modes.length; i++) {
    controller.setMode(modes[i]);
    const p = arrivalAt(start.x + 100 + i * 12, start.z + 100);
    controller.teleportActiveTo(p.x, p.z, p.heading, modes[i] === 'helicopter' ? 110 : null);
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1) for (const mode of modes) {
      const p = saved.entities?.[mode];
      if (!p || ![p.x, p.y, p.z, p.heading].every(Number.isFinite)) continue;
      controller.setMode(mode); controller.teleportActiveTo(p.x, p.z, p.heading, p.y);
    }
    controller.setMode(modes.includes(saved?.mode) ? saved.mode : 'car');
  } catch { controller.setMode('car'); }
  function save() {
    try {
      const entities = Object.fromEntries(modes.map(mode => {
        const e = controller.entities[mode]; return [mode, { x: e.position.x, y: e.position.y, z: e.position.z, heading: e.heading }];
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, mode: controller.activeMode, entities }));
    } catch { /* Disabled storage does not prevent play. */ }
  }
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  const hints = {
    person: 'W / S Walk · A / D Turn · Shift Run · Space Jump · Drag Orbit',
    car: 'W / S Drive & reverse · A / D Steer · B Horn · Drag Orbit',
    cyclist: 'W / S Pedal & brake · A / D Turn · Drag Orbit',
    helicopter: 'W / S Pitch · A / D Yaw · Space / E Ascend · Q / C Descend'
  };
  function placeIndicator() {
    const b = document.querySelector('.mode-btn.active'); if (!b) return;
    $('mode-switch').style.setProperty('--ind-x', `${b.offsetLeft}px`);
    $('mode-switch').style.setProperty('--ind-w', `${b.offsetWidth}px`);
  }
  function selectMode(mode) {
    controller.setMode(mode); touch.setMode(mode); gamepad.reset(); document.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('[data-mode]')) {
      b.classList.toggle('active', b.dataset.mode === mode); b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    }
    $('hud-active-mode').textContent = controller.getActiveEntity().label;
    $('hud-controls-hint').textContent = hints[mode]; placeIndicator();
    if (camera.getActivePreset().category !== 'follow') selectCamera('chase');
  }
  function selectCamera(id) {
    camera.setCameraPreset(id, true); $('hud-active-camera').textContent = camera.getActivePreset().name;
    for (const b of document.querySelectorAll('[data-camera]')) b.classList.toggle('active', b.dataset.camera === id);
  }
  function cycleCamera(step = 1) {
    const i = CAMERA_PRESETS.findIndex(p => p.id === camera.activePresetId);
    selectCamera(CAMERA_PRESETS[(i + step + CAMERA_PRESETS.length) % CAMERA_PRESETS.length].id);
  }
  function teleport(p) {
    const result = controller.teleportActiveTo(p.x, p.z, p.heading);
    if (!result) { $('fullmap-hover-info').textContent = 'No clear landing nearby. Try another street.'; return null; }
    camera.initialized = false; selectCamera('chase'); return result;
  }
  map = new BangkokMap(controller, teleport);
  map.onToggle = open => { touch.setEnabled(!open); gamepad.enabled = !open; controller.resetInput(); };
  for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => selectMode(b.dataset.mode);
  for (const b of document.querySelectorAll('[data-camera]')) b.onclick = () => { selectCamera(b.dataset.camera); closePopovers(); };
  for (const b of document.querySelectorAll('[data-time]')) b.onclick = () => {
    lighting.applyPreset(b.dataset.time);
    for (const btn of document.querySelectorAll('[data-time]')) {
      btn.classList.toggle('active', btn === b); btn.setAttribute('aria-pressed', String(btn === b));
    }
  };
  for (const b of document.querySelectorAll('[data-teleport]')) b.onclick = () => {
    const l = LANDMARKS.find(l => l.id === b.dataset.teleport);
    if (l) teleport(arrivalAt(l.x + l.size * 0.65, l.z + l.size * 0.65)); closePopovers();
  };
  $('cam-prev').onclick = () => cycleCamera(-1); $('cam-next').onclick = () => cycleCamera(1);
  function closePopovers() { for (const p of document.querySelectorAll(':popover-open')) p.hidePopover(); }
  for (const pop of document.querySelectorAll('[popover]')) pop.addEventListener('beforetoggle', e => {
    if (e.newState !== 'open') return;
    const anchor = $(pop.dataset.anchor), align = $(pop.dataset.align) || anchor; if (!anchor) return;
    const r = anchor.getBoundingClientRect(), above = pop.dataset.side === 'above' && r.top > 200;
    pop.style.right = `${Math.max(8, innerWidth - align.getBoundingClientRect().right)}px`;
    pop.style.top = above ? 'auto' : `${r.bottom + 8}px`; pop.style.bottom = above ? `${innerHeight - r.top + 8}px` : 'auto';
    pop.style.maxHeight = `${Math.max(100, above ? r.top - 20 : innerHeight - r.bottom - 20)}px`;
  });
  const toggleHUD = () => {
    const hidden = document.body.classList.toggle('hud-minimized');
    $('btn-toggle-hud').setAttribute('aria-pressed', String(hidden)); $('btn-toggle-hud').setAttribute('aria-label', hidden ? 'Show HUD' : 'Hide HUD');
  };
  $('btn-toggle-hud').onclick = toggleHUD;
  // Audio starts only after a gesture. A local synthesizer supplies engine and horn sounds.
  let audio, engine, gain, sound = false;
  async function toggleSound() {
    try {
      if (!audio) {
        audio = new AudioContext(); engine = audio.createOscillator(); gain = audio.createGain();
        engine.type = 'triangle'; engine.frequency.value = 45; gain.gain.value = 0;
        engine.connect(gain).connect(audio.destination); engine.start();
      }
      await audio.resume(); sound = !sound;
      $('btn-sound').setAttribute('aria-pressed', String(sound)); $('btn-sound').setAttribute('aria-label', sound ? 'Mute sound' : 'Enable sound');
      $('btn-sound').querySelector('use').setAttribute('href', sound ? '#i-sound' : '#i-sound-off');
    } catch { $('btn-sound').disabled = true; }
  }
  function horn() {
    if (!audio || !sound) return;
    const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 370;
    g.gain.setValueAtTime(0.06, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.4);
  }
  $('btn-sound').onclick = toggleSound;
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { map.toggle(false); return; }
    if (isTypingInField(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyM') { map.toggle(); return; } if (map.open) return;
    if (/^Digit[1-4]$/.test(e.code)) selectMode(modes[Number(e.code.at(-1)) - 1]);
    if (e.code === 'KeyV') cycleCamera(e.shiftKey ? -1 : 1); if (e.code === 'KeyH') toggleHUD();
    if (e.code === 'KeyN') toggleSound(); if (e.code === 'KeyB') horn();
    const shortcuts = { Digit5: 'chase', Digit6: 'action', Digit7: 'pov', Digit8: 'fifthAve', Digit9: 'timesSquare', Digit0: 'chryslerGCT' };
    if (shortcuts[e.code]) selectCamera(shortcuts[e.code]);
  });
  window.addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(1, 1600 / innerWidth));
    renderer.setSize(innerWidth, innerHeight); camera.camera.aspect = innerWidth / innerHeight; camera.camera.updateProjectionMatrix(); placeIndicator();
  });
  selectMode(controller.activeMode);
  $('loading-status').textContent = 'Compiling the city’s materials…';
  controller.update(0.016, 0); camera.update(0.016, 0);
  await renderer.compileAsync(scene, camera.camera); await renderer.renderAsync(scene, camera.camera);
  if (renderer.backend.device) await renderer.backend.device.queue.onSubmittedWorkDone();
  $('loading-overlay').classList.add('hidden'); $('loading-progress').style.transform = 'scaleX(1)'; document.body.dataset.ready = 'true';
  let last = performance.now(), elapsed = 0, frames = 0, fpsTime = 0, uiTime = 0, saveTime = 0;
  renderer.setAnimationLoop(now => {
    const raw = (now - last) / 1000, dt = Math.min(0.05, Math.max(0.001, raw)); last = now;
    elapsed += dt; frames++; fpsTime += raw; uiTime += raw; saveTime += raw;
    if (!map.open) { gamepad.update(dt); controller.update(dt, elapsed); }
    camera.update(dt, elapsed); lighting.update(camera.currentPos); const active = controller.getActiveEntity();
    world.update(dt, elapsed, camera.currentPos);
    if (audio) {
      engine.frequency.setTargetAtTime(42 + Math.abs(active.speed) * 5, audio.currentTime, 0.08);
      gain.gain.setTargetAtTime(sound && !document.hidden && ['car', 'helicopter'].includes(controller.activeMode) ? 0.018 : 0, audio.currentTime, 0.1);
    }
    if (uiTime > 0.15) {
      uiTime = 0; map.update(); $('hud-location').textContent = getLocationLabel(active.position.x, active.position.z);
      const speed = Math.round(Math.abs(active.speed) * 3.6);
      $('hud-speed').textContent = String(speed); $('hud-altitude').textContent = String(Math.max(0, Math.round(active.position.y)));
      $('hud-speed-meter').style.transform = `scaleX(${Math.min(1, speed / (controller.activeMode === 'helicopter' ? 190 : 130))})`;
    }
    if (fpsTime > 0.5) { $('hud-fps').textContent = String(Math.round(frames / fpsTime)); frames = 0; fpsTime = 0; }
    if (saveTime > 5) { save(); saveTime = 0; } renderer.render(scene, camera.camera);
  });
  window.bangkok = { scene, controller, camera, map, renderer, landmarks: LANDMARKS };
}
initApp().catch(error => {
  console.error('[bangkok] Startup failed', error);
  $('loading-status').textContent = 'Bangkok could not start. Reload in a browser with WebGPU or WebGL 2 support.';
  const retry = document.createElement('button'); retry.textContent = 'Reload'; retry.onclick = () => location.reload(); $('loading-status').after(retry);
});
