// JSAB Level Kit (vanilla JS + Canvas)
// - Level = JSON timeline events
// - Player = movement + dash + invincibility window
// - Obstacles = beats (contact damage), lasers (with warnings), bombs (explode bullets + flash), walls (closing)
// Drop this into GitHub as a template.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  levelName: document.getElementById("levelName"),
  timeText: document.getElementById("timeText"),
  livesText: document.getElementById("livesText"),
  restartBtn: document.getElementById("restartBtn"),
  levelFile: document.getElementById("levelFile"),
  loadExampleBtn: document.getElementById("loadExampleBtn"),
};

function resize() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// ------------------------- Input -------------------------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function axis() {
  const left  = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const up    = keys.has("w") || keys.has("arrowup");
  const down  = keys.has("s") || keys.has("arrowdown");
  return {
    x: (right ? 1 : 0) - (left ? 1 : 0),
    y: (down ? 1 : 0) - (up ? 1 : 0),
    dash: keys.has(" "),
  };
}

// ------------------------- Helpers -------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const len = (x, y) => Math.hypot(x, y);

function nowSec() { return performance.now() / 1000; }

function normToWorld(nx, ny) {
  return { x: nx * W(), y: ny * H() };
}
function W() { return window.innerWidth; }
function H() { return window.innerHeight; }

function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= cr ** 2;
}

function circleCircle(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= (a.r + b.r) ** 2;
}

// ------------------------- Game State -------------------------
let level = null;
let timeline = [];
let timelineIndex = 0;

let state = {
  startedAt: 0,
  t: 0,
  lives: 3,
  deadLock: 0,     // short invuln after hit
  screenFlash: 0,  // flash intensity 0..1
};

const player = {
  x: W() / 2,
  y: H() / 2,
  r: 14,
  speed: 420,
  // dash
  dashSpeed: 1050,
  dashDuration: 0.14,
  dashCooldown: 0.5,
  dashTimeLeft: 0,
  dashCdLeft: 0,
  dashVX: 0,
  dashVY: 0,
  invincibleDuringDash: true,
  // visuals
  squash: 0, // 0..1
  crack: 0,  // 0..(lives lost)
};

const entities = {
  beats: [],
  lasers: [],
  bombs: [],
  bullets: [],
  walls: [],
};

// ------------------------- Level Loading -------------------------
async function loadLevelFromUrl(url) {
  const res = await fetch(url);
  const json = await res.json();
  loadLevel(json);
}

function loadLevel(json) {
  level = json;
  timeline = (json.events || []).slice().sort((a, b) => a.t - b.t);
  timelineIndex = 0;

  // settings
  const s = (json.settings || {});
  state.lives = s.lives ?? 3;
  player.speed = s.playerSpeed ?? 420;
  player.dashSpeed = s.dashSpeed ?? 1050;
  player.dashDuration = s.dashDuration ?? 0.14;
  player.dashCooldown = s.dashCooldown ?? 0.50;
  player.invincibleDuringDash = s.invincibleDuringDash ?? true;
  state.deadLock = 0;
  state.screenFlash = 0;

  // reset
  clearEntities();
  resetPlayer();

  state.startedAt = nowSec();
  state.t = 0;

  ui.levelName.textContent = json.name || "Unnamed Level";
  ui.livesText.textContent = String(state.lives);
}

function clearEntities() {
  for (const k of Object.keys(entities)) entities[k].length = 0;
}

function resetPlayer() {
  player.x = W() / 2;
  player.y = H() / 2;
  player.dashTimeLeft = 0;
  player.dashCdLeft = 0;
  player.dashVX = 0;
  player.dashVY = 0;
  player.squash = 0;
  player.crack = 0;
}

function restart() {
  if (!level) return;
  loadLevel(level);
}

// ------------------------- Spawning -------------------------
function spawnBeat(ev) {
  const p = normToWorld(ev.x ?? 0.5, ev.y ?? 0.5);
  entities.beats.push({
    x: p.x, y: p.y,
    r: ev.r ?? 18,
    life: ev.life ?? 9999,
    pulse: 1, // spawn flash
  });
}

function spawnLaser(ev) {
  // dir: left/right/up/down
  entities.lasers.push({
    dir: ev.dir || "right",
    warn: ev.warn ?? 0.7,
    thickness: ev.thickness ?? 18,
    speed: ev.speed ?? 900,
    length: ev.length ?? 1600,
    bornAt: state.t,
    phase: "warn",  // warn -> fire -> done
    progress: 0,
  });
}

function spawnBomb(ev) {
  const p = normToWorld(ev.x ?? 0.5, ev.y ?? 0.5);
  entities.bombs.push({
    x: p.x, y: p.y,
    r: ev.r ?? 16,
    fuse: ev.fuse ?? 1.0,
    bornAt: state.t,
    bullets: ev.bullets ?? 16,
    bulletSpeed: ev.bulletSpeed ?? 380,
    flash: ev.flash ?? true,
    pulse: 1,
    exploded: false,
  });
}

function spawnWall(ev) {
  // side: left/right/up/down (moves inward)
  entities.walls.push({
    side: ev.side || "left",
    warn: ev.warn ?? 0.6,
    width: ev.width ?? 220,
    speed: ev.speed ?? 240,
    bornAt: state.t,
    phase: "warn",
    offset: 0, // how far moved inward
  });
}

function spawnBulletsFromBomb(bomb) {
  const n = bomb.bullets;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    entities.bullets.push({
      x: bomb.x,
      y: bomb.y,
      r: 6,
      vx: Math.cos(a) * bomb.bulletSpeed,
      vy: Math.sin(a) * bomb.bulletSpeed,
      life: 3.0
    });
  }
}

// ------------------------- Damage Logic -------------------------
function playerInvincible() {
  if (state.deadLock > 0) return true;
  if (player.invincibleDuringDash && player.dashTimeLeft > 0) return true;
  return false;
}

function hurtPlayer() {
  if (playerInvincible()) return;

  state.lives -= 1;
  ui.livesText.textContent = String(state.lives);

  player.crack += 1;
  state.deadLock = 0.9;      // post-hit invuln
  state.screenFlash = 0.55;  // subtle flash on hit

  if (state.lives <= 0) {
    // soft "game over" = just restart for this template
    restart();
  } else {
    // reposition a bit to avoid immediate re-hit
    player.x = W() / 2;
    player.y = H() / 2;
  }
}

// ------------------------- Update -------------------------
let last = nowSec();

function update(dt) {
  if (!level) return;

  // time
  state.t = nowSec() - state.startedAt;
  ui.timeText.textContent = state.t.toFixed(2);

  // consume timeline events
  while (timelineIndex < timeline.length && timeline[timelineIndex].t <= state.t) {
    const ev = timeline[timelineIndex++];
    if (ev.type === "beat") spawnBeat(ev);
    else if (ev.type === "laser") spawnLaser(ev);
    else if (ev.type === "bomb") spawnBomb(ev);
    else if (ev.type === "wall") spawnWall(ev);
  }

  // decay global effects
  state.deadLock = Math.max(0, state.deadLock - dt);
  state.screenFlash = Math.max(0, state.screenFlash - dt * 1.8);

  // player movement
  const ax = axis();
  let mx = ax.x, my = ax.y;
  const mlen = len(mx, my);
  if (mlen > 1e-6) { mx /= mlen; my /= mlen; }

  // dash trigger
  if (ax.dash && player.dashCdLeft <= 0 && player.dashTimeLeft <= 0 && mlen > 0) {
    player.dashTimeLeft = player.dashDuration;
    player.dashCdLeft = player.dashCooldown;
    player.dashVX = mx * player.dashSpeed;
    player.dashVY = my * player.dashSpeed;
    state.screenFlash = Math.max(state.screenFlash, 0.35);
  }

  player.dashCdLeft = Math.max(0, player.dashCdLeft - dt);

  const padding = (level.settings?.arenaPadding ?? 18);

  // apply velocity
  let vx = mx * player.speed;
  let vy = my * player.speed;

  // during dash override
  if (player.dashTimeLeft > 0) {
    player.dashTimeLeft = Math.max(0, player.dashTimeLeft - dt);
    vx = player.dashVX;
    vy = player.dashVY;
  }

  player.x += vx * dt;
  player.y += vy * dt;

  // clamp
  player.x = clamp(player.x, padding, W() - padding);
  player.y = clamp(player.y, padding, H() - padding);

  // squash visuals (more speed = more squash)
  const speedNow = len(vx, vy);
  player.squash = lerp(player.squash, clamp(speedNow / 1200, 0, 1), 1 - Math.pow(0.0001, dt));

  // update beats
  for (let i = entities.beats.length - 1; i >= 0; i--) {
    const b = entities.beats[i];
    b.life -= dt;
    b.pulse = Math.max(0, b.pulse - dt * 2.5);
    if (b.life <= 0) entities.beats.splice(i, 1);
  }

  // update lasers
  for (let i = entities.lasers.length - 1; i >= 0; i--) {
    const l = entities.lasers[i];
    const age = state.t - l.bornAt;

    if (l.phase === "warn") {
      if (age >= l.warn) {
        l.phase = "fire";
        l.progress = 0;
      }
    } else if (l.phase === "fire") {
      l.progress += l.speed * dt;
      if (l.progress >= l.length) {
        entities.lasers.splice(i, 1);
        continue;
      }

      // collision: treat laser as moving thick rectangle
      // Starting off-screen then sweeping across
      const thick = l.thickness;
      let rx=0, ry=0, rw=0, rh=0;

      if (l.dir === "right") {
        rx = -l.length + l.progress;
        ry = 0;
        rw = l.length;
        rh = thick;
        // pick a random lane? for template: center line
        ry = (H()/2) - thick/2;
      } else if (l.dir === "left") {
        rx = W() - l.progress;
        ry = (H()/2) - thick/2;
        rw = l.length;
        rh = thick;
      } else if (l.dir === "down") {
        rx = (W()/2) - thick/2;
        ry = -l.length + l.progress;
        rw = thick;
        rh = l.length;
      } else if (l.dir === "up") {
        rx = (W()/2) - thick/2;
        ry = H() - l.progress;
        rw = thick;
        rh = l.length;
      }

      if (!playerInvincible() && rectCircleCollide(rx, ry, rw, rh, player.x, player.y, player.r)) {
        hurtPlayer();
      }
    }
  }

  // update bombs
  for (let i = entities.bombs.length - 1; i >= 0; i--) {
    const b = entities.bombs[i];
    const age = state.t - b.bornAt;
    b.pulse = Math.max(0, b.pulse - dt * 2.5);

    if (!b.exploded && age >= b.fuse) {
      b.exploded = true;
      spawnBulletsFromBomb(b);
      if (b.flash) state.screenFlash = Math.max(state.screenFlash, 0.95);
      entities.bombs.splice(i, 1);
      continue;
    }

    // bomb contact hurts
    if (!playerInvincible() && circleCircle({x:player.x,y:player.y,r:player.r},{x:b.x,y:b.y,r:b.r})) {
      hurtPlayer();
    }
  }

  // update bullets
  for (let i = entities.bullets.length - 1; i >= 0; i--) {
    const bu = entities.bullets[i];
    bu.x += bu.vx * dt;
    bu.y += bu.vy * dt;
    bu.life -= dt;

    if (!playerInvincible() && circleCircle({x:player.x,y:player.y,r:player.r},{x:bu.x,y:bu.y,r:bu.r})) {
      hurtPlayer();
    }

    if (bu.life <= 0 || bu.x < -50 || bu.y < -50 || bu.x > W()+50 || bu.y > H()+50) {
      entities.bullets.splice(i, 1);
    }
  }

  // update walls (closing rectangles)
  for (let i = entities.walls.length - 1; i >= 0; i--) {
    const w = entities.walls[i];
    const age = state.t - w.bornAt;

    if (w.phase === "warn") {
      if (age >= w.warn) w.phase = "move";
    } else if (w.phase === "move") {
      w.offset += w.speed * dt;

      // wall rectangle based on side
      let rx=0, ry=0, rw=0, rh=0;
      if (w.side === "left") { rx = -w.width + w.offset; ry = 0; rw = w.width; rh = H(); }
      if (w.side === "right"){ rx = W() - w.offset; ry = 0; rw = w.width; rh = H(); }
      if (w.side === "up")   { rx = 0; ry = -w.width + w.offset; rw = W(); rh = w.width; }
      if (w.side === "down") { rx = 0; ry = H() - w.offset; rw = W(); rh = w.width; }

      // if fully passed inward, remove
      if (w.offset > w.width + Math.max(W(), H())) {
        entities.walls.splice(i, 1);
        continue;
      }

      if (!playerInvincible() && rectCircleCollide(rx, ry, rw, rh, player.x, player.y, player.r)) {
        hurtPlayer();
      }
    }
  }

  // beat collisions
  for (const b of entities.beats) {
    if (!playerInvincible() && circleCircle({x:player.x,y:player.y,r:player.r},{x:b.x,y:b.y,r:b.r})) {
      hurtPlayer();
    }
  }
}

// ------------------------- Render -------------------------
function render() {
  // background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W(), H());

  // arena outline
  const pad = (level?.settings?.arenaPadding ?? 18);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, W() - pad * 2, H() - pad * 2);

  // lasers (warning + beam)
  for (const l of entities.lasers) {
    const thick = l.thickness;

    if (l.phase === "warn") {
      // warning line at center lane
      ctx.strokeStyle = "rgba(255, 80, 180, 0.55)";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 10]);

      if (l.dir === "right" || l.dir === "left") {
        const y = (H()/2);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W(), y); ctx.stroke();
      } else {
        const x = (W()/2);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H()); ctx.stroke();
      }

      ctx.setLineDash([]);
    } else {
      // beam rect
      ctx.fillStyle = "rgba(255, 40, 160, 0.9)";

      if (l.dir === "right") {
        const x = -l.length + l.progress;
        const y = (H()/2) - thick/2;
        ctx.fillRect(x, y, l.length, thick);
      } else if (l.dir === "left") {
        const x = W() - l.progress;
        const y = (H()/2) - thick/2;
        ctx.fillRect(x, y, l.length, thick);
      } else if (l.dir === "down") {
        const x = (W()/2) - thick/2;
        const y = -l.length + l.progress;
        ctx.fillRect(x, y, thick, l.length);
      } else if (l.dir === "up") {
        const x = (W()/2) - thick/2;
        const y = H() - l.progress;
        ctx.fillRect(x, y, thick, l.length);
      }
    }
  }

  // walls
  for (const w of entities.walls) {
    const alpha = (w.phase === "warn") ? 0.35 : 0.85;
    ctx.fillStyle = `rgba(255, 80, 180, ${alpha})`;

    if (w.phase === "warn") {
      // draw a thin preview at edge
      ctx.fillStyle = "rgba(255, 80, 180, 0.25)";
      if (w.side === "left") ctx.fillRect(0, 0, 10, H());
      if (w.side === "right") ctx.fillRect(W()-10, 0, 10, H());
      if (w.side === "up") ctx.fillRect(0, 0, W(), 10);
      if (w.side === "down") ctx.fillRect(0, H()-10, W(), 10);
    } else {
      if (w.side === "left") ctx.fillRect(-w.width + w.offset, 0, w.width, H());
      if (w.side === "right") ctx.fillRect(W() - w.offset, 0, w.width, H());
      if (w.side === "up") ctx.fillRect(0, -w.width + w.offset, W(), w.width);
      if (w.side === "down") ctx.fillRect(0, H() - w.offset, W(), w.width);
    }
  }

  // beats
  for (const b of entities.beats) {
    const pulse = b.pulse; // 1..0
    // outer glow
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 60, 170, ${0.25 + pulse * 0.35})`;
    ctx.arc(b.x, b.y, b.r + 10 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();

    // core
    ctx.beginPath();
    ctx.fillStyle = "rgb(255, 80, 180)";
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    // spawn flash ring
    if (pulse > 0) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.lineWidth = 3;
      ctx.arc(b.x, b.y, b.r + 6 + (1 - pulse) * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // bombs
  for (const b of entities.bombs) {
    const pulse = b.pulse;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${0.08 + pulse * 0.18})`;
    ctx.arc(b.x, b.y, b.r + 10 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgb(255, 80, 180)";
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // bullets
  for (const bu of entities.bullets) {
    ctx.beginPath();
    ctx.fillStyle = "rgb(255, 80, 180)";
    ctx.arc(bu.x, bu.y, bu.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // player (cyan square with squash + dash flash + cracks)
  const inv = playerInvincible();
  const dash = player.dashTimeLeft > 0;

  const squashX = lerp(1, 1.25, player.squash);
  const squashY = lerp(1, 0.80, player.squash);

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(squashX, squashY);

  // body
  ctx.fillStyle = dash ? "rgb(255,255,255)" : "rgb(0, 220, 255)";
  ctx.fillRect(-player.r, -player.r, player.r * 2, player.r * 2);

  // crack effect (simple notch)
  if (player.crack > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.beginPath();
    ctx.moveTo(player.r, -player.r);
    ctx.lineTo(player.r - 10, -player.r);
    ctx.lineTo(player.r, -player.r + 10);
    ctx.closePath();
    ctx.fill();
  }

  // invuln outline flicker
  if (inv) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-player.r - 3, -player.r - 3, player.r * 2 + 6, player.r * 2 + 6);
  }

  ctx.restore();

  // screen flash overlay
  if (state.screenFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.screenFlash})`;
    ctx.fillRect(0, 0, W(), H());
  }
}

// ------------------------- Loop -------------------------
function loop() {
  const t = nowSec();
  const dt = Math.min(0.033, t - last);
  last = t;

  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ------------------------- UI wiring -------------------------
ui.restartBtn.addEventListener("click", restart);

ui.levelFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const json = JSON.parse(text);
  loadLevel(json);
});

ui.loadExampleBtn.addEventListener("click", () => loadLevelFromUrl("levels/example-level.json"));

// load default example
loadLevelFromUrl("levels/example-level.json");
