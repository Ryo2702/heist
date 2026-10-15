import { platformPosition } from './levels.js';
import { sampleReplay } from './replay.js';
import { CELL_W, CELL_H, spriteFrame, groceryName, groceryKind } from './sprites.js';

const C = { cream: '#f6e7c8', white: '#fff9eb', green: '#477a47', dark: '#284c34', red: '#a83b52', purple: '#7b416a', orange: '#e9a24b', ink: '#49352c' };

export function drawScene(c, { game, mode, atlas, width, height, cameraX, delta, ghostFrames }) {
  const W = c.canvas.width, H = c.canvas.height, ratio = W / width;
  const scale = Math.min(48, Math.max(28, (height - 100) / 8.5)) * ratio;
  const view = W / scale, menu = mode === 'menu';
  const target = menu ? 0 : Math.max(0, Math.min(game.level.length - view, game.player.x - view * .38 + game.player.vx * .28));
  const camera = cameraX === null ? target : cameraX + (target - cameraX) * (1 - Math.exp(-delta * 6));
  const floor = Math.round(H - Math.max(60, height * (menu ? .15 : .22)) * ratio);
  const X = x => Math.round((x - camera) * scale), Y = y => Math.round(floor - y * scale);
  const r = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h)); };
  const box = (x, y, w, h, color) => r(X(x), Y(y), w * scale, h * scale, color);
  const text = (str, x, y, size = 7, color = C.ink, align = 'left') => {
    c.font = `bold ${Math.max(5, Math.round(size))}px monospace`; c.fillStyle = color; c.textAlign = align; c.fillText(str, Math.round(x), Math.round(y));
  };
  const visible = (x, margin = 4) => x > camera - margin && x < camera + view + margin;
  c.imageSmoothingEnabled = false;
  r(0, 0, W, H, C.cream);
  r(0, 0, W, Math.max(0, Y(5.7)), C.white);
  r(0, Y(5.7), W, scale * .14, C.green);
  r(0, Y(5.5), W, scale * .13, '#bfd1a7');
  // Distant painted wall graphics scroll more slowly than the foreground shelving.
  if (height > 600) {
    for (let x = -((camera * scale * .35) % (12 * scale)); x < W; x += 12 * scale) {
      r(x + scale, Y(10.6), scale * 8, scale * 1.55, '#e7d5ad');
      text('SOL SUPERMARKET', x + scale * 5, Y(9.85), scale * .55, C.green, 'center');
      text('FRESH PICKS / EVERY DAY', x + scale * 5, Y(9.35), scale * .24, C.red, 'center');
    }
  }
  // Store fixtures are decoration, independent of platform collision geometry.
  for (let x = Math.floor(camera / 6) * 6; x < camera + view + 6; x += 6) {
    const zone = game.level.zones.find(z => x >= z.start && x < z.end)?.name || 'Fresh Produce';
    const frozen = zone === 'Frozen Section', office = zone === 'Security Office';
    box(x + .15, 4.35, 5.5, 4.35, frozen ? '#c6ded8' : office ? '#d5c9ae' : '#d4dfb8');
    box(x + .15, 4.35, .12, 4.35, '#9caf84'); box(x + 5.5, 4.35, .12, 4.35, '#9caf84');
    for (let row = 0; row < 3; row++) {
      const y = .45 + row * 1.15;
      box(x + .25, y, 5.2, .16, '#94ac7f');
      for (let item = 0; item < 9; item++) {
        const px = x + .4 + item * .56;
        box(px, y + .7, .32, .68, [C.red, '#ddaf57', '#8ca36a', C.white, '#c07b54'][(item + row) % 5]);
        box(px + .03, y + .45, .26, .17, C.cream);
        box(px, y - .03, .3, .12, C.white);
      }
    }
    if (zone === 'Fresh Produce') {
      for (let row = 0; row < 2; row++) {
        const y = .9 + row * 1.8;
        box(x + .35, y, 5, .55, '#bd9363');
        for (let i = 0; i < 10; i++) {
          const px = x + .48 + i * .49;
          box(px, y + .32, .32, .27, i % 3 ? C.purple : C.white);
          box(px + .1, y + .41, .08, .13, '#8aa064');
        }
        box(x + 2, y - .08, 1.5, .3, C.white);
        text(row ? 'GARLIC  2.49' : 'ONIONS  1.99', X(x + 2.75), Y(y - .28), scale * .14, C.ink, 'center');
      }
    }
    if (zone === 'Checkout Escape') {
      box(x + .5, 1.1, 4.8, 1.1, '#b29268');
      box(x + .4, 1.2, 5, .16, C.ink);
      box(x + 4, 1.95, .8, .65, C.dark);
      box(x + 4.1, 1.85, .6, .4, '#bfd1a7');
      text('EXPRESS', X(x + 2.5), Y(.45), scale * .28, C.white, 'center');
    }
    if (frozen) {
      for (let i = 0; i < 3; i++) {
        box(x + .25 + i * 1.75, 4.2, .1, 4.1, C.white);
        box(x + 1.5 + i * 1.75, 2.5, .08, .65, C.ink);
      }
    }
    if (office) {
      box(x + 1, 3.6, 3.8, 2.2, C.ink); box(x + 1.15, 3.45, 3.5, 1.9, '#849887');
      text('CCTV / STAFF ONLY', X(x + 2.9), Y(2.4), scale * .23, C.white, 'center');
    }
    box(x + .5, 6.6, 4.7, .12, '#d1c09c'); box(x + .8, 6.5, 4.1, .08, C.white);
  }
  for (const zone of game.level.zones) {
    for (let x = zone.start + 5; x < zone.end; x += 12) {
      if (!visible(x, 8)) continue;
      box(x, 7.5, .035, 1.5, '#a59573'); box(x + 5, 7.5, .035, 1.5, '#a59573');
      box(x - .3, 6.25, 5.6, .85, C.dark); box(x - .2, 6.15, 5.4, .65, C.green);
      text(zone.name.toUpperCase(), X(x + 2.5), Y(5.72), scale * .27, C.white, 'center');
    }
  }
  for (const platform of game.level.platforms) {
    const p = platformPosition(platform, game.time);
    if (!visible(p.x, platform.w)) continue;
    if (platform.floor) {
      box(p.x - platform.w / 2, p.y, platform.w, 4, C.cream);
      box(p.x - platform.w / 2, p.y, platform.w, .12, C.ink);
      for (let x = p.x - platform.w / 2; x < p.x + platform.w / 2; x += 1.5) {
        box(x, -.2, .025, 3, '#d9c8a8'); box(x, -1.5, 1.5, .03, '#d9c8a8');
      }
      if (p.x >= 48 && p.x < 72) box(p.x - platform.w / 2, -.12, platform.w, .08, '#b4d2cc');
    } else {
      const produce = p.x < 24;
      const land = game.events.slice(-6).find(e => e.type === 'land' && game.time - e.time < .22 && Math.abs(e.x - p.x) < platform.w);
      const wobble = land ? Math.sin((game.time - land.time) * 55) * .025 : 0;
      box(p.x - platform.w / 2, p.y + wobble, platform.w, platform.h, produce ? '#ae7747' : C.green);
      box(p.x - platform.w / 2, p.y, platform.w, .08, produce ? '#e2b178' : '#bdd59b');
      for (let i = 0; i < platform.w - .3; i += .55) box(p.x - platform.w / 2 + i + .12, p.y - .17, .35, .14, produce ? '#d5a16c' : C.white);
      if (platform.moving) text('↕', X(p.x), Y(p.y - .3), scale * .3, C.white, 'center');
    }
  }
  for (let x = Math.floor(camera / 12) * 12 + 1; x < camera + view; x += 12) {
    box(x, -1.65, 2.7, .8, '#a77549');
    for (let i = 0; i < 7; i++) {
      const px = X(x + .15 + i * .36), py = Y(-1.55);
      r(px, py, scale * .3, scale * .22, i % 3 ? C.purple : C.white);
      r(px + scale * .1, py - 2, 2, 3, '#92a45d');
    }
    text('LOCAL · 1.99', X(x + 1.35), Y(-2.12), scale * .19, C.white, 'center');
  }
  const grocery = (a, lift = 0, alpha = 1) => {
    const px = X(a.x), py = Y(a.y + lift), size = scale * .47;
    c.globalAlpha = alpha;
    const garlic = groceryKind(a) === 'garlic';
    const color = garlic ? '#fff0cb' : a.type === 'failed' ? '#8e8871' : a.type === 'early' ? C.purple : '#e9bc4b';
    const pixel = size / 12;
    const bulb = (x, y, w, h, fill) => r(px + (x - 6) * pixel, py + (y - 6) * pixel, w * pixel, h * pixel, fill);
    bulb(5, 0, 2, 4, C.ink); bulb(3, 3, 6, 2, C.ink);
    bulb(1, 5, 10, 5, C.ink); bulb(3, 10, 6, 2, C.ink);
    bulb(4, 4, 4, 2, color); bulb(2, 6, 8, 4, color); bulb(4, 10, 4, 1, color);
    if (garlic) {
      bulb(5, 0, 1, 4, '#d5b889');
      bulb(4, 6, 1, 4, '#c8aa83'); bulb(7, 6, 1, 4, '#c8aa83');
      bulb(5, 5, 1, 5, '#fffdf0');
    } else {
      bulb(5, 0, 1, 3, C.green); bulb(7, 0, 2, 1, C.green);
      bulb(3, 6, 1, 3, C.cream); bulb(7, 5, 1, 5, a.type === 'early' ? '#a83b52' : '#b97a30');
    }
    c.globalAlpha = 1;
  };
  for (const a of game.level.artifacts) if (visible(a.x) && !game.collected.has(a.id)) grocery(a, Math.sin(game.time * 3 + a.x) * .08);
  // Legacy hazard slots are stock spills; warning and hit geometry stay aligned.
  for (const hazard of game.lasers) {
    if (!visible(hazard.x)) continue;
    const tipX = hazard.x + Math.sin(hazard.angle) * hazard.height;
    const tipY = hazard.y + Math.cos(hazard.angle) * hazard.height;
    box(hazard.x - .35, hazard.height + .55, .7, .35, C.orange);
    if (hazard.warning || hazard.active) {
      text('!', X(hazard.x), Y(hazard.height + .9), scale * .5, C.red, 'center');
      for (let y = 0; y < hazard.height; y += .4) {
        const x = hazard.x + (tipX - hazard.x) * y / hazard.height;
        box(x - .1, hazard.y + (tipY - hazard.y) * y / hazard.height, .2, .3, hazard.active ? C.orange : '#c6aa7d');
      }
      box(hazard.x - .35, -.12, .7, .12, hazard.active ? C.red : C.orange);
    }
  }
  for (const camera of game.cameras) {
    if (!visible(camera.x)) continue;
    box(camera.x - .08, camera.y + .65, .12, .55, C.ink);
    box(camera.x - .35, camera.y + .25, .7, .35, C.ink); box(camera.x - .3, camera.y + .2, .5, .22, C.white);
    box(camera.x + .2, camera.y + .12, .1, .12, camera.detected ? C.red : C.green);
    if (game.disabledUntil <= game.time) {
      c.fillStyle = camera.detected ? '#a83b522b' : '#e9a24b19'; c.beginPath(); c.moveTo(X(camera.x), Y(camera.y));
      for (const side of [-1, 1]) c.lineTo(X(camera.x + Math.sin(camera.angle + side * .23) * 6), Y(camera.y - Math.cos(camera.angle + side * .23) * 6));
      c.closePath(); c.fill();
    }
  }
  for (const enemy of game.enemies) {
    if (!visible(enemy.x)) continue;
    if (enemy.type === 'cart') {
      box(enemy.x - .6, enemy.y + .9, 1.2, .55, '#84958b');
      for (let i = 0; i < 5; i++) box(enemy.x - .5 + i * .22, enemy.y + .82, .1, .37, C.cream);
      box(enemy.x - .8, enemy.y + 1.1, .3, .09, C.red);
      for (const side of [-1, 1]) box(enemy.x + side * .4 - .1, enemy.y + .25, .2, .25, C.ink);
    } else {
      const gait = enemy.state === 'disabled' ? 0 : Math.sin(game.time * 10) * .15;
      box(enemy.x - .24, enemy.y + .6, .18, .6 - gait, C.ink); box(enemy.x + .07, enemy.y + .6, .18, .6 + gait, C.ink);
      box(enemy.x - .35, enemy.y + 1.2, .7, .65, C.green); box(enemy.x + .1, enemy.y + 1.1, .12, .12, C.orange);
      box(enemy.x - .23, enemy.y + 1.62, .46, .45, '#e3b68b'); box(enemy.x - .3, enemy.y + 1.75, .65, .2, C.dark);
      box(enemy.x + enemy.facing * .14, enemy.y + 1.48, .07, .07, C.ink);
    }
    if (enemy.state === 'chase') text('!', X(enemy.x), Y(enemy.y + 2), scale * .45, C.red, 'center');
  }
  for (const terminal of game.terminals) {
    if (!visible(terminal.x)) continue;
    box(terminal.x - .5, .8, 1, .8, '#bd9b71'); box(terminal.x - .35, 1.2, .7, .45, C.ink);
    box(terminal.x - .28, 1.12, .55, .28, terminal.hackedUntil > game.time ? C.orange : '#9ab97b');
    text('[E] CCTV', X(terminal.x), Y(1.6), scale * .22, C.dark, 'center');
  }
  for (const checkpoint of game.level.checkpoints) if (visible(checkpoint.x)) box(checkpoint.x - .4, -.12, .8, .12, C.green);
  for (const [door, label] of [[game.level.vault, 'CHECKOUT'], [game.level.exit, 'EXIT →']]) {
    if (!visible(door.x)) continue;
    box(door.x - .4, 5.5, .8, 5.5, C.dark);
    const opening = game.vaultOpen ? Math.min(1, Math.max(0, game.time - (game.events.find(e => e.type === 'vault')?.time ?? 0)) * 2) : 0;
    box(door.x - .25 - opening * .8, 5.3, .25, 5.3, '#b1c6ac');
    box(door.x + opening * .8, 5.3, .25, 5.3, '#d1dec3');
    text(label, X(door.x), Y(5.8), scale * .28, C.dark, 'center');
    if (label === 'CHECKOUT') text(game.vaultOpen ? 'PAID IN MISCHIEF' : '3 LOOT + HOLD E', X(door.x - 1), Y(2), scale * .2, C.red, 'right');
  }
  const player = (p, opacity = 1, size = 1) => {
    const frame = spriteFrame(p.animation, game.time);
    const h = (p.sliding ? 1.2 : 1.65) * scale * size, w = h * CELL_W / CELL_H;
    c.save(); c.globalAlpha = opacity; c.translate(X(p.x), Y(p.y)); c.scale(p.facing < 0 ? -1 : 1, 1);
    c.drawImage(atlas, frame.x, frame.y, CELL_W, CELL_H, -w / 2, -h + h / CELL_H, w, h); c.restore();
  };
  if (ghostFrames && mode === 'playing') { const ghost = sampleReplay(ghostFrames, game.time); if (ghost) player(ghost, .3); }
  player(menu ? { ...game.player, x: camera + view * .76, y: 0, animation: 'idle' } : game.player, game.player.invincible > 0 && Math.floor(game.time * 12) % 2 ? .45 : 1, menu ? 2.2 : 1);
  for (const e of game.events.slice(-16)) {
    const age = game.time - e.time;
    if (e.type !== 'collect' || age < 0 || age > .6) continue;
    const a = game.level.artifacts.find(a => a.id === e.artifactId);
    if (a) grocery(a, age * 1.7, 1 - age / .6);
  }
  let latest;
  for (let i = game.events.length - 1; i >= 0; i--) {
    const e = game.events[i];
    if (game.time - e.time >= 3.5) break;
    if (e.type === 'collect' && e.time <= game.time) { latest = e; break; }
  }
  if (latest && !menu) {
    const a = game.level.artifacts.find(a => a.id === latest.artifactId);
    if (a) {
      const cardW = Math.min(W - 16, 220), left = W - cardW - 8;
      const top = (height < 600 ? 92 : 152) * ratio;
      r(left, top, cardW, 30, C.dark);
      text(`${a.sample ? 'SAMPLE / ' : ''}${groceryName(a).toUpperCase()}`, left + 6, top + 10, 7, C.white);
      text(`SLOT ${a.slot ?? '?'} · FEE ${a.feeLamports ?? '?'} lamports`, left + 6, top + 20, 6, C.cream);
      text(`${a.signature?.slice(0, 27) || 'Metadata unavailable'}…`, left + 6, top + 27, 5, '#c3d3ad');
    }
  }
  return camera;
}
