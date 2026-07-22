/* ============================================================
   ck-player — engine

   One idea, carried all the way through: the rule under a song IS
   that song's waveform.

     · the shape is the SONG — a real peak/RMS envelope extracted
       from the master by tools/waveforms.py and shipped as data.
       Nothing about it is invented or animated.
     · un-played  → the shape, pale, small. On hover it rises to
       full height and one flex travels through it.
     · playing    → everything behind the playhead is inked pink,
       left to right. The playhead bead breathes with the live
       level (slowly — it is a breath, not a wiggle).
     · the rule   → is also the scrubber.

   Cost: one grain quad + one thin strip per row, all sharing a
   single program. No models, no post stack.
   ============================================================ */
import * as THREE from "three";

/* ---------------- tunables ---------------- */
const P = {
  waveH:      68,     // px tall strip the wave is drawn into
  amp:        12,     // px half-height of a full-scale peak
  restGain:   0.55,   // how tall the shape sits when untouched
  pluckMs:    780,    // hover flex duration
  sweepEvery: 11.0,   // s between idle sweeps
  sweepMs:    1500,
  sweepStep:  0.13,   // s stagger per row
  scrambleMs: 420,
  levelUp:    6.0,    // playhead bead: attack (per second)
  levelDown:  2.5,    // …and release. Low on purpose — a breath.
  dpr:        2,
};
const CHARS = "·—/\\|+=*<>_:;~^";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse  = matchMedia("(pointer: coarse)").matches;

/* ---------------- playlist ---------------- */
const LISTS = window.PLAYLISTS || {};
const KEY   = new URLSearchParams(location.search).get("list");
const LIST  = LISTS[KEY] || LISTS[Object.keys(LISTS)[0]] || { tracks: [] };
const TRACKS = LIST.tracks || [];
const WAVES = window.WAVEFORMS || {};

/* ---------------- dom ---------------- */
const mod    = document.getElementById("mod");
const canvas = document.getElementById("gl");
const listEl = document.getElementById("list");
const audio  = document.getElementById("au");

document.getElementById("headTag").textContent  = LIST.tag  || "[ listen ]";
document.getElementById("headNote").textContent = LIST.note || "";
document.getElementById("footSign").textContent = LIST.sign || "clay and kelsy";
const footLink = document.getElementById("footLink");
if (LIST.foot && LIST.foot.href) {
  footLink.textContent = LIST.foot.label || "[ more ]";
  footLink.href = LIST.foot.href;
} else footLink.remove();

const footCta = document.getElementById("footCta");
if (LIST.cta && LIST.cta.href) {
  footCta.textContent = LIST.cta.label || "[ explore ]";
  footCta.href = LIST.cta.href;
} else footCta.remove();

const ICON_PLAY  = `<svg viewBox="0 0 11 13" aria-hidden="true"><path d="M0.5 0.6 L10.5 6.5 L0.5 12.4 Z"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 11 13" aria-hidden="true"><rect x="0.6" y="0.5" width="3.4" height="12"/><rect x="7" y="0.5" width="3.4" height="12"/></svg>`;

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
};

/* a track's waveform is keyed by its mp3 basename, so adding a song is just
   dropping the file in and re-running tools/waveforms.py */
function waveBytes(tr) {
  const key = tr.wave || (tr.src || "").split("/").pop().replace(/\.[a-z0-9]+$/i, "");
  const b64 = WAVES[key];
  if (!b64) return new Uint8Array(1024).fill(8);   // no data yet → a plain rule
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* build the rows */
const rows = TRACKS.map((tr, i) => {
  const li = document.createElement("li");
  li.className = "row";
  li.innerHTML = `
    <button class="row__hit" type="button" aria-label="Play ${(tr.title || "").replace(/"/g, "")}"></button>
    <div class="row__grid">
      <span class="row__n"><span class="row__num">${String(i + 1).padStart(2, "0")}</span><span class="row__ico">${ICON_PLAY}</span></span>
      <span class="row__t"></span>
      <span class="row__m">${tr.meta || ""}</span>
      <span class="row__d">${fmt(tr.dur || 0)}</span>
      ${tr.url ? `<a class="row__go" href="${tr.url}" target="_top" rel="noopener">[ ↗ ]</a>` : `<span></span>`}
    </div>
    <div class="row__scrub"></div>
    <div class="row__bar"></div>`;
  listEl.appendChild(li);

  const o = {
    i, tr, el: li,
    hit:   li.querySelector(".row__hit"),
    ico:   li.querySelector(".row__ico"),
    tEl:   li.querySelector(".row__t"),
    dEl:   li.querySelector(".row__d"),
    scrub: li.querySelector(".row__scrub"),
    bar:   li.querySelector(".row__bar"),
    hover: 0, play: 0, pluck: 1, scr: 1,
    seed: [...(tr.title || "x")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) / 997,
    wave: waveBytes(tr),
    px: { left: 0, width: 1 },
  };
  o.tEl.textContent = tr.title || "";
  if (!tr.src) o.hit.disabled = true;
  return o;
});

/* ---------------- audio ---------------- */
let actx = null, anode = null, tdata = null, srcNode = null;
let cur = -1, level = 0;

function ensureGraph() {
  if (actx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    srcNode = actx.createMediaElementSource(audio);
    anode = actx.createAnalyser();
    anode.fftSize = 1024;
    anode.smoothingTimeConstant = 0.8;
    tdata = new Uint8Array(anode.fftSize);
    srcNode.connect(anode);
    anode.connect(actx.destination);
  } catch (e) {
    anode = null;               // no analyser → the bead simply won't breathe
  }
}

/* only one ck-player audible per page (same-origin iframes can talk) */
let chan = null;
const ME = Math.random().toString(36).slice(2);
try {
  chan = new BroadcastChannel("ckp-audio");
  chan.onmessage = (e) => { if (e.data && e.data.id !== ME) audio.pause(); };
} catch (e) {}

function load(i) {
  const r = rows[i];
  if (!r || !r.tr.src) return;
  cur = i;
  audio.src = r.tr.src;
  audio.load();
}
function play(i) {
  if (i !== cur) load(i);
  ensureGraph();
  if (actx && actx.state === "suspended") actx.resume();
  const p = audio.play();
  if (p && p.catch) p.catch(() => {});
  if (chan) chan.postMessage({ id: ME });
}
function toggle(i) {
  if (i === cur && !audio.paused) audio.pause();
  else play(i);
}

audio.addEventListener("ended", () => {
  const next = rows.findIndex((r, i) => i > cur && r.tr.src);
  if (next >= 0) play(next); else syncClasses();
});
["play", "pause", "waiting", "playing", "canplay", "loadedmetadata"].forEach((ev) =>
  audio.addEventListener(ev, syncClasses));

function syncClasses() {
  rows.forEach((r, i) => {
    const live = i === cur && !audio.paused && !audio.ended;
    r.el.classList.toggle("is-live", live);
    r.el.classList.toggle("is-load", i === cur && audio.readyState < 3 && !audio.paused);
    r.ico.innerHTML = live ? ICON_PAUSE : ICON_PLAY;
    r.hit.setAttribute("aria-label", (live ? "Pause " : "Play ") + (r.tr.title || ""));
  });
  const anyLive = rows.some((r) => r.el.classList.contains("is-live"));
  rows.forEach((r, i) => r.el.classList.toggle("is-dim", anyLive && i !== cur));
}

/* ---------------- interaction ---------------- */
let hot = -1, idleT = 0, sweepRun = -1;
function setHot(i) {
  if (hot === i) return;
  if (hot >= 0) rows[hot].el.classList.remove("is-hot");
  hot = i;
  if (hot >= 0) {
    const r = rows[hot];
    r.el.classList.add("is-hot");
    if (!reduced) { r.pluck = 0; r.scr = 0; }
    idleT = 0; sweepRun = -1;
  }
}

rows.forEach((r, i) => {
  r.el.addEventListener("pointerenter", () => { if (!coarse) setHot(i); });
  r.el.addEventListener("pointerleave", () => { if (!coarse && hot === i) setHot(-1); });
  r.hit.addEventListener("click", () => toggle(i));
  r.hit.addEventListener("focus", () => setHot(i));
  r.hit.addEventListener("blur",  () => { if (hot === i) setHot(-1); });

  /* the rule is the scrubber */
  let dragging = false;
  const seek = (e) => {
    const b = r.scrub.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - b.left) / Math.max(1, b.width)));
    if (isFinite(audio.duration) && audio.duration > 0) audio.currentTime = f * audio.duration;
  };
  r.scrub.addEventListener("pointerdown", (e) => {
    setHot(i);
    if (i !== cur || !isFinite(audio.duration)) { toggle(i); return; }
    dragging = true;
    r.scrub.setPointerCapture(e.pointerId);
    seek(e);
    e.preventDefault();
  });
  r.scrub.addEventListener("pointermove", (e) => { if (dragging) seek(e); });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { r.scrub.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  r.scrub.addEventListener("pointerup", end);
  r.scrub.addEventListener("pointercancel", end);
});

/* ---------------- GL ---------------- */
let renderer, scene, cam, grain, W = 1, H = 1, GL_OK = true;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, P.dpr));
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);   // top=0 → pixel space, y down
} catch (e) {
  GL_OK = false;
  document.body.classList.add("no-gl");
}

const C = {
  hair: new THREE.Color(0xe4dfd8),
  ink:  new THREE.Color(0x2b2333),
  pink: new THREE.Color(0xcc5f97),
};

const VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const WAVE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uW, uH, uAmp, uAA, uRest, uProg, uPlay, uHover, uPluck, uSweep, uLevel;
  uniform sampler2D uWave;
  uniform vec3 cHair, cInk, cPink;

  void main(){
    float x = vUv.x;
    float yPix = (vUv.y - 0.5) * uH;

    /* THE SONG ITSELF — a real envelope measured from the master */
    float pk = texture2D(uWave, vec2(x, 0.5)).r;

    /* a whisper at rest, full height once you touch it or play it */
    float gain = mix(uRest, 1.0, max(uHover, uPlay));

    /* one flex travels the waveform on hover. It scales the song's own shape
       rather than displacing it — the shape must stay the shape. */
    float pp = uPluck * 1.22 - 0.11;
    gain *= 1.0 + exp(-pow((x - pp) / 0.085, 2.0)) * (1.0 - uPluck) * 0.55;

    /* idle sweep, same treatment */
    float sw = exp(-pow((x - uSweep) / 0.12, 2.0)) * step(0.0, uSweep);
    gain *= 1.0 + sw * 0.42;

    float h = pk * uAmp * gain;
    float d = abs(yPix);

    float body = 1.0 - smoothstep(h - uAA, h + uAA, d);      /* mirrored waveform */
    float rule = 1.0 - smoothstep(0.55, 0.55 + uAA, d);      /* centre rule, always */

    float heard = step(x, uProg) * step(0.0, uProg);

    vec3 col = mix(cHair, cInk, uHover * 0.30);
    col = mix(col, cPink, max(heard * (0.55 + 0.45 * uPlay), sw * 0.28));

    /* the body stays airy — a dense master at full alpha reads as a grey slab,
       not as a waveform */
    float a = max(body * mix(0.28 + 0.14 * uHover, 0.66, heard),
                  rule * mix(0.62 + 0.28 * uHover, 0.95, heard));

    /* playhead: hairline tick + a bead breathing with the live level */
    float dx   = abs(x - uProg) * uW;
    float tick = (1.0 - smoothstep(0.0, 1.1, dx)) * uPlay;
    float br   = 2.0 + 2.2 * uLevel;
    float bead = (1.0 - smoothstep(br, br + 1.4, length(vec2(dx, yPix)))) * uPlay;
    col = mix(col, cPink, max(tick, bead));
    a = max(a, max(tick * 0.42, bead));

    if (a <= 0.003) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

const quad = GL_OK ? new THREE.PlaneGeometry(1, 1) : null;

if (GL_OK) {
  /* paper grain — the family's signature, one quad */
  grain = new THREE.Mesh(quad, new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uT;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float g = h(gl_FragCoord.xy + fract(uT) * 7.0) * 0.030;
        float edge = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.84, vUv.y);
        gl_FragColor = vec4(vec3(0.0), g * (0.35 + 0.65 * edge));
      }`,
  }));
  grain.renderOrder = 0;
  scene.add(grain);

  rows.forEach((r) => {
    r.waveTex = new THREE.DataTexture(r.wave, r.wave.length, 1, THREE.RedFormat);
    r.waveTex.minFilter = THREE.LinearMipmapLinearFilter;   // clean when squeezed onto a phone
    r.waveTex.magFilter = THREE.LinearFilter;
    r.waveTex.generateMipmaps = true;
    r.waveTex.needsUpdate = true;

    r.u = {
      uW: { value: 1 }, uH: { value: P.waveH }, uAmp: { value: P.amp },
      uAA: { value: 1 / Math.min(window.devicePixelRatio || 1, P.dpr) },
      uRest: { value: P.restGain },
      uProg: { value: -1 }, uPlay: { value: 0 }, uHover: { value: 0 },
      uPluck: { value: 1 }, uSweep: { value: -1 }, uLevel: { value: 0 },
      uWave: { value: r.waveTex },
      cHair: { value: C.hair }, cInk: { value: C.ink }, cPink: { value: C.pink },
    };
    /* DoubleSide is REQUIRED: the pixel-space camera (top:0, bottom:H) puts a
       negative Y scale in the projection matrix, which flips triangle winding —
       FrontSide quads get backface-culled and render nothing at all. */
    r.mesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: r.u, vertexShader: VERT, fragmentShader: WAVE_FRAG,
    }));
    r.mesh.renderOrder = 1;
    scene.add(r.mesh);
  });
}

/* ---------------- layout ---------------- */
let postedH = -1;
function layout() {
  const box = mod.getBoundingClientRect();
  W = Math.max(1, Math.round(mod.clientWidth));
  H = Math.max(1, Math.round(mod.clientHeight || box.height));

  if (GL_OK) {
    renderer.setSize(W, H, false);
    cam.right = W; cam.bottom = H; cam.updateProjectionMatrix();
    grain.position.set(W / 2, H / 2, 0);
    grain.scale.set(W, H, 1);
  }

  rows.forEach((r) => {
    const b = r.scrub.getBoundingClientRect();
    r.px.left = b.left - box.left;
    r.px.width = Math.max(1, b.width);
    if (!GL_OK) return;
    r.mesh.position.set(r.px.left + r.px.width / 2, b.top - box.top + b.height / 2, 0);
    r.mesh.scale.set(r.px.width, P.waveH, 1);
    r.u.uW.value = r.px.width;
  });

  postHeight();
}

function postHeight() {
  const h = Math.ceil(mod.getBoundingClientRect().height);
  if (h > 0 && Math.abs(h - postedH) > 2) {
    postedH = h;
    if (window.parent !== window) {
      try { window.parent.postMessage({ ckp: "player", type: "height", h }, "*"); } catch (e) {}
    }
  }
}

new ResizeObserver(() => { layout(); frame(); }).observe(mod);
addEventListener("resize", () => { layout(); frame(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); frame(); });

/* ---------------- live level (the bead's breath) ---------------- */
function readLevel(dt) {
  let target = 0;
  if (anode) {
    anode.getByteTimeDomainData(tdata);
    let sum = 0;
    for (let i = 0; i < tdata.length; i += 4) {
      const v = (tdata[i] - 128) / 128;
      sum += v * v;
    }
    target = Math.min(1, Math.sqrt(sum / (tdata.length / 4)) * 2.6);
  }
  const rate = target > level ? P.levelUp : P.levelDown;
  level += (target - level) * (1 - Math.exp(-rate * dt));
}

/* ---------------- scramble ---------------- */
function scramble(r, dt) {
  if (r.scr >= 1) return;
  r.scr = Math.min(1, r.scr + dt * 1000 / P.scrambleMs);
  const src = r.tr.title || "";
  const rev = r.scr * src.length * 1.35 - src.length * 0.2;
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    out += (c === " " || i < rev) ? c : CHARS[(Math.random() * CHARS.length) | 0];
  }
  r.tEl.textContent = r.scr >= 1 ? src : out;
}

/* ---------------- loop ---------------- */
let tSec = 0, lastT = 0;
const nowS = () => performance.now() / 1000;

function step(dt) {
  tSec += dt;
  const playing = !audio.paused && !audio.ended && cur >= 0;
  const dur = isFinite(audio.duration) && audio.duration > 0
    ? audio.duration : (rows[cur] ? rows[cur].tr.dur : 0);
  const prog = (cur >= 0 && (playing || audio.currentTime > 0))
    ? Math.min(1, audio.currentTime / (dur || 1)) : -1;

  if (playing) readLevel(dt); else level += (0 - level) * (1 - Math.exp(-P.levelDown * dt));

  /* idle sweep — only when the module is resting */
  if (!reduced && !playing && hot < 0) {
    idleT += dt;
    if (sweepRun < 0 && idleT > P.sweepEvery) { sweepRun = 0; idleT = 0; }
    if (sweepRun >= 0) {
      sweepRun += dt;
      if (sweepRun > P.sweepMs / 1000 + rows.length * P.sweepStep) sweepRun = -1;
    }
  } else { idleT = 0; sweepRun = -1; }

  rows.forEach((r, i) => {
    const isCur = i === cur;
    const k = 1 - Math.exp(-9 * dt);
    r.hover += (((hot === i) ? 1 : 0) - r.hover) * k;
    r.play  += (((isCur && playing) ? 1 : (isCur && prog > 0 ? 0.45 : 0)) - r.play) * k;
    if (r.pluck < 1) r.pluck = Math.min(1, r.pluck + dt * 1000 / P.pluckMs);
    scramble(r, dt);

    /* elapsed time reads out in the row while it plays */
    if (isCur && prog >= 0) r.dEl.textContent = fmt(audio.currentTime);
    else if (r.dEl.textContent !== fmt(r.tr.dur || 0)) r.dEl.textContent = fmt(r.tr.dur || 0);

    let sw = -1;
    if (sweepRun >= 0) {
      const local = (sweepRun - i * P.sweepStep) / (P.sweepMs / 1000);
      if (local > 0 && local < 1) sw = local;
    }

    if (GL_OK) {
      r.u.uHover.value = r.hover;
      r.u.uPlay.value  = r.play;
      r.u.uPluck.value = reduced ? 1 : r.pluck;
      r.u.uSweep.value = sw;
      r.u.uLevel.value = isCur ? level : 0;
      r.u.uProg.value  = isCur ? prog : -1;
      /* debug: __ckp.poster(i, 0.4) pins a row as part-played so the played
         look can be inspected without waiting on (or seeking) real audio */
      if (r.poster != null) { r.u.uProg.value = r.poster; r.u.uPlay.value = 1; r.u.uLevel.value = 0.55; }
    } else {
      r.bar.style.setProperty("--p", isCur && prog > 0 ? prog : 0);
    }
  });

  if (GL_OK) grain.material.uniforms.uT.value = reduced ? 0 : tSec;
}

function frame() { if (GL_OK) renderer.render(scene, cam); }

let running = false;
function start() {
  if (running || !GL_OK) return;
  running = true;
  lastT = nowS();
  renderer.setAnimationLoop(() => {
    const n = nowS(), dt = Math.min(n - lastT, 0.1);
    lastT = n;
    step(dt);
    frame();
  });
}
function stop() {
  if (!running || !GL_OK) return;
  running = false;
  renderer.setAnimationLoop(null);
}

/* pause rendering off-screen — but NEVER while a song is playing, and any
   interaction wakes it (an IO inside a cross-origin iframe can misreport) */
if (GL_OK && "IntersectionObserver" in window) {
  new IntersectionObserver((es) => {
    const vis = es.some((e) => e.isIntersecting);
    if (vis || !audio.paused) start(); else stop();
  }, { rootMargin: "120px" }).observe(mod);
}
["pointerenter", "pointermove", "focusin"].forEach((ev) => mod.addEventListener(ev, start, { passive: true }));
addEventListener("message", (e) => { if (e.data && e.data.ckpHost) start(); });
addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
audio.addEventListener("play", start);

/* boot: lay out, draw one frame synchronously (a hidden tab pauses rAF), reveal */
layout();
step(1 / 60);
frame();
canvas.classList.add("on");
start();
syncClasses();
setTimeout(postHeight, 400);
setTimeout(postHeight, 1600);

/* ---------------- resilience ---------------- */
if (GL_OK) {
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); }, false);
  canvas.addEventListener("webglcontextrestored", () => { layout(); frame(); }, false);
}
addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  if (GL_OK) {
    const gl = renderer.getContext && renderer.getContext();
    if (gl && gl.isContextLost && gl.isContextLost()) { location.reload(); return; }
    layout(); frame(); start();
  }
  postedH = -1; postHeight();
});

/* ---------------- debug ---------------- */
window.__ckp = {
  P, rows, audio,
  get gl() { return { renderer, scene, cam, W, H, running, info: renderer && renderer.info }; },
  play: (i) => play(i),
  hover: (i) => { setHot(i); step(1 / 60); frame(); },
  renderOnce: (n = 1) => { for (let i = 0; i < n; i++) { step(1 / 60); frame(); } },
  /* pin a row as part-played (or pass null to clear). Honoured by the running
     loop, so it survives to the next composited frame. */
  poster: (i, p) => { rows[i].poster = p; start(); },
  height: () => Math.ceil(mod.getBoundingClientRect().height),
  layout, frame, stop, start,
};
