import { platformPosition } from './levels.js';

export const PLAYER_WIDTH = 0.65;
export const PLAYER_HEIGHT = 1.45;
export const SLIDE_HEIGHT = 0.7;
export const FIXED_STEP = 1 / 120;
export const MAX_RUN_TIME = 30 * 60;
const GRAVITY = 29;
const JUMP_SPEED = 11.6;
const HALF_WIDTH = PLAYER_WIDTH / 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

export function createGame(level) {
  return {
    level,
    player: { x: 2, y: 0, vx: 0, vy: 0, facing: 1, grounded: true, sliding: false, animation: 'idle', health: 5, invincible: 0,
      coyote: 0.1, jumpBuffer: 0, jumps: 0, platformId: 'floor-0', knockback: 0, animationUntil: 0 },
    time: 0, status: 'countdown', countdown: 3, score: 0, alarm: 0, collected: new Set(), disabledUntil: 0, zone: 0,
    checkpoint: { ...level.checkpoints[0] }, escapeRemaining: null, events: [], recording: [], projectiles: [],
    enemies: level.enemies.map((enemy) => ({ ...enemy, homeY: enemy.y, state: 'patrol', facing: 1, chaseUntil: 0, fireAt: 0, detectedAt: -10 })),
    lasers: level.lasers.map((laser) => ({ ...laser, active: false, warning: false, angle: 0 })),
    cameras: level.cameras.map((camera) => ({ ...camera, angle: 0, detected: false, alertAt: -10 })),
    terminals: level.terminals.map((terminal) => ({ ...terminal, hackedUntil: 0 })),
    terminalProgress: 0, vaultOpen: false, prompt: '', damageTaken: 0, alerts: 0, doubleJumpUnlocked: false,
    recordAt: 0, jumpPressedLast: false, zonesVisited: new Set([0]), nextFootstep: 0, lastCountdown: 3,
  };
}

function event(game, type, details = {}) {
  game.events.push({ type, time: game.time, x: game.player.x, y: game.player.y, ...details });
}

function alert(game, amount, source) {
  game.alarm = clamp(game.alarm + amount, 0, 100);
  game.alerts += 1;
  event(game, 'alert', { source });
  if (game.alarm >= 100 && game.escapeRemaining === null) {
    game.escapeRemaining = 45;
    event(game, 'lockdown');
  }
}

function damage(game, sourceX, source) {
  const player = game.player;
  if (player.invincible > 0 || game.status !== 'playing') return;
  player.health -= 1;
  game.damageTaken += 1;
  player.invincible = 2.4;
  player.knockback = 0.22;
  player.vx = player.x < sourceX ? -5 : 5;
  player.vy = Math.max(player.vy, 4);
  player.grounded = false;
  player.animation = 'damage';
  player.animationUntil = game.time + 0.35;
  alert(game, 16, source);
  event(game, 'damage', { source });
  if (player.health <= 0) finish(game, 'lost');
}

function finish(game, status) {
  if (game.status !== 'playing') return;
  game.status = status;
  game.player.animation = status === 'won' ? 'victory' : 'defeat';
  game.player.vx = 0;
  if (status === 'won') {
    game.score += Math.max(0, Math.round(3000 - game.time * 12)) + Math.max(0, 500 - game.damageTaken * 100) + Math.max(0, 500 - game.alerts * 50);
  }
  record(game);
  event(game, status === 'won' ? 'victory' : 'defeat');
}

function record(game) {
  const { x, y, vx, vy, grounded, facing, animation, sliding, health, invincible } = game.player;
  const rounded = (value) => Number(value.toFixed(3));
  const frame = {
    t: rounded(game.time), x: rounded(x), y: rounded(y), vx: rounded(vx), vy: rounded(vy), grounded, facing, animation, sliding,
    security: {
      alarm: game.alarm, health, invincible, disabledUntil: game.disabledUntil,
      enemies: game.enemies.map(({ id, x, y, facing, state }) => ({ id, x: rounded(x), y: rounded(y), facing, state })),
      lasers: game.lasers.map(({ id, active, warning, angle }) => ({ id, active, warning, angle })),
      cameras: game.cameras.map(({ id, angle, detected }) => ({ id, angle, detected })),
      terminals: game.terminals.map(({ id, hackedUntil }) => ({ id, hackedUntil })),
      projectiles: game.projectiles.map(({ id, x, y, warning, life }) => ({ id, x: rounded(x), y: rounded(y), warning, life })),
    },
  };
  if (game.recording.at(-1)?.t === frame.t) game.recording[game.recording.length - 1] = frame;
  else game.recording.push(frame);
}

function solids(game) {
  const platforms = game.level.platforms.map((platform) => ({ ...platform, ...platformPosition(platform, game.time) }));
  if (!game.vaultOpen) platforms.push({ id: 'vault-door', x: game.level.vault.x, y: 5.5, w: 0.5, h: 5.5 });
  return platforms;
}

function intersects(player, height, platform) {
  return player.x + HALF_WIDTH > platform.x - platform.w / 2 + 0.001
    && player.x - HALF_WIDTH < platform.x + platform.w / 2 - 0.001
    && player.y + height > platform.y - platform.h + 0.001 && player.y < platform.y - 0.001;
}

function movePlayer(game, input, dt, platforms) {
  const player = game.player;
  player.invincible = Math.max(0, player.invincible - dt);
  player.knockback = Math.max(0, player.knockback - dt);
  const wasGrounded = player.grounded;
  if (player.grounded && player.platformId) {
    const platform = game.level.platforms.find((entry) => entry.id === player.platformId);
    if (platform?.moving) {
      const previous = platformPosition(platform, game.time - dt);
      const current = platformPosition(platform, game.time);
      player.x += current.x - previous.x;
      player.y += current.y - previous.y;
    }
  }
  const lowCeiling = platforms.some((platform) => intersects(player, PLAYER_HEIGHT, platform));
  if (input.slide && player.grounded || lowCeiling && !platforms.some((platform) => intersects(player, SLIDE_HEIGHT, platform))) player.sliding = true;
  else if (!lowCeiling) player.sliding = false;
  const height = player.sliding ? SLIDE_HEIGHT : PLAYER_HEIGHT;
  const jumpPressed = input.jumpPressed && !game.jumpPressedLast;
  game.jumpPressedLast = Boolean(input.jumpPressed);
  player.jumpBuffer = jumpPressed ? 0.13 : Math.max(0, player.jumpBuffer - dt);
  player.coyote = player.grounded ? 0.105 : Math.max(0, player.coyote - dt);
  const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
  if (direction) player.facing = direction;
  if (player.knockback <= 0) {
    const speed = player.sliding ? 5.4 : input.sneak ? 2.2 : input.sprint ? 8 : 6;
    const icy = player.grounded && player.y === 0 && player.x >= 48 && player.x < 72;
    player.vx = approach(player.vx, direction * speed, (icy ? direction ? 22 : 8 : direction ? 46 : 38) * dt);
  }
  if (player.jumpBuffer > 0 && !player.sliding && (player.coyote > 0 || (game.doubleJumpUnlocked && player.jumps === 1 && jumpPressed))) {
    const double = player.coyote <= 0;
    player.vy = JUMP_SPEED * (double ? 0.9 : 1);
    player.grounded = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.jumps = double ? 2 : 1;
    event(game, double ? 'doubleJump' : 'jump');
  }
  player.vy -= GRAVITY * (player.vy > 0 && !input.jump ? 2.1 : 1) * dt;
  player.x += player.vx * dt;
  for (const platform of platforms) {
    if (intersects(player, height, platform)) {
      if (player.vx > 0) player.x = platform.x - platform.w / 2 - HALF_WIDTH;
      else if (player.vx < 0) player.x = platform.x + platform.w / 2 + HALF_WIDTH;
      player.vx = 0;
    }
  }
  player.x = clamp(player.x, HALF_WIDTH, game.level.length - HALF_WIDTH);
  const oldY = player.y;
  player.y += player.vy * dt;
  player.grounded = false;
  player.platformId = null;
  for (const platform of platforms) {
    const overlap = player.x + HALF_WIDTH > platform.x - platform.w / 2 + 0.001 && player.x - HALF_WIDTH < platform.x + platform.w / 2 - 0.001;
    if (!overlap) continue;
    if (player.vy <= 0 && oldY >= platform.y - 0.035 && player.y <= platform.y) {
      player.y = platform.y;
      player.vy = 0;
      player.grounded = true;
      player.platformId = platform.id;
      player.jumps = 0;
    } else if (player.vy > 0 && oldY + height <= platform.y - platform.h + 0.02 && player.y + height >= platform.y - platform.h) {
      player.y = platform.y - platform.h - height;
      player.vy = 0;
    }
  }
  if (!wasGrounded && player.grounded) {
    player.animation = 'landing';
    player.animationUntil = game.time + 0.12;
    event(game, 'land');
  }
  if (player.y < -7) {
    damage(game, player.x - 1, 'fall');
    if (game.status !== 'playing') return;
    player.x = game.checkpoint.x;
    player.y = game.checkpoint.y;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    event(game, 'checkpoint');
  }
  if (game.time >= player.animationUntil) {
    player.animation = player.sliding ? 'slide' : !player.grounded ? player.vy > 0 ? player.jumps === 2 ? 'doubleJump' : 'jump' : 'fall' : Math.abs(player.vx) > 0.2 ? input.sneak ? 'sneak' : input.sprint ? 'run' : 'walk' : 'idle';
  }
  if (player.grounded && Math.abs(player.vx) > 2 && game.time > game.nextFootstep) {
    game.nextFootstep = game.time + 0.28;
    event(game, 'footstep');
  }
}

function updateSecurity(game, input, dt) {
  const player = game.player;
  const height = player.sliding ? SLIDE_HEIGHT : PLAYER_HEIGHT;
  const disabled = game.disabledUntil > game.time;
  for (const laser of game.lasers) {
    const phase = (game.time + laser.phase) % laser.period;
    laser.active = !disabled && phase < laser.period * 0.46;
    laser.warning = !disabled && phase > laser.period - 0.55;
    laser.angle = laser.kind === 'rotating' ? Math.sin(game.time * 1.25 + laser.phase) * 0.5 : 0;
    const tipX = laser.x + Math.sin(laser.angle) * laser.height;
    const tipY = laser.y + Math.cos(laser.angle) * laser.height;
    if (laser.active && player.y < tipY && player.y + height > laser.y) {
      const testY = clamp(player.y + height / 2, laser.y, tipY);
      const beamX = laser.x + (tipX - laser.x) * (testY - laser.y) / (tipY - laser.y);
      if (Math.abs(player.x - beamX) < HALF_WIDTH + 0.1) damage(game, beamX, 'laser');
      if (game.status !== 'playing') return;
    }
  }
  for (const camera of game.cameras) {
    camera.angle = Math.sin(game.time * 0.75 + camera.x) * 0.55;
    const dx = player.x - camera.x;
    const dy = camera.y - player.y - height / 2;
    camera.detected = !disabled && dy > 0 && dy < 6 && Math.abs(Math.atan2(dx, dy) - camera.angle) < 0.23 && !player.sliding;
    if (camera.detected && game.time - camera.alertAt > 3) {
      camera.alertAt = game.time;
      alert(game, 9, 'camera');
    }
  }
  for (const enemy of game.enemies) {
    const dx = player.x - enemy.x;
    if (enemy.type === 'cart') {
      const touching = Math.abs(dx) < 1 && player.y < .85;
      if (touching && input.interact) {
        enemy.facing = player.facing;
        enemy.pushedUntil = game.time + 1.4;
      }
      const pushed = enemy.pushedUntil > game.time;
      enemy.x = clamp(enemy.x + enemy.facing * (pushed ? 4.5 : 1.35) * dt, enemy.minX, enemy.maxX);
      if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) { enemy.facing *= -1; enemy.pushedUntil = 0; }
      if (touching && !input.interact && !pushed && Math.sign(dx) === enemy.facing) damage(game, enemy.x, 'cart');
      if (game.status !== 'playing') return;
      continue;
    }
    const nearby = Math.abs(dx) < (input.sneak ? 1.7 : 4.5) && Math.abs(player.y - enemy.y) < 1.5
      && player.x >= enemy.minX - 1 && player.x <= enemy.maxX + 1;
    if (disabled) {
      enemy.state = 'disabled';
      continue;
    }
    if (nearby && game.time >= enemy.detectedAt + 4) {
      enemy.detectedAt = game.time;
      enemy.chaseUntil = game.time + 2.5;
      enemy.state = 'chase';
      alert(game, 7, enemy.type);
      event(game, 'detection', { enemyId: enemy.id });
    }
    if (enemy.state === 'chase' && game.time > enemy.chaseUntil) enemy.state = 'return';
    if (enemy.state === 'disabled') enemy.state = 'patrol';
    if (enemy.state === 'chase') {
      enemy.facing = dx < 0 ? -1 : 1;
      const speed = game.alarm >= 100 ? 3.5 : 2.6;
      enemy.x = clamp(enemy.x + enemy.facing * speed * dt, enemy.minX, enemy.maxX);
    } else {
      enemy.x += enemy.facing * 1.1 * dt;
      if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) {
        enemy.x = clamp(enemy.x, enemy.minX, enemy.maxX);
        enemy.facing *= -1;
      }
      enemy.y = approach(enemy.y, enemy.homeY, dt);
      if (Math.abs(enemy.y - enemy.homeY) < 0.05) enemy.state = 'patrol';
    }
    const enemyCenter = enemy.y + 0.75;
    if (Math.abs(player.x - enemy.x) < 0.7 && Math.abs(player.y + height / 2 - enemyCenter) < 1) damage(game, enemy.x, enemy.type);
    if (game.status !== 'playing') return;
  }
  for (const projectile of game.projectiles) {
    projectile.life -= dt;
    projectile.warning -= dt;
    if (projectile.warning > 0) continue;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    if (!disabled && Math.abs(projectile.x - player.x) < 0.45 && projectile.y > player.y && projectile.y < player.y + height) {
      damage(game, projectile.x, 'projectile');
      projectile.life = 0;
      if (game.status !== 'playing') return;
    }
  }
  game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0 && projectile.y > -1);
}

function updateObjectives(game, input, dt) {
  const { player, level } = game;
  const zoneIndex = Math.min(level.zones.length - 1, Math.floor(player.x / 24));
  game.zone = zoneIndex;
  if (!game.zonesVisited.has(zoneIndex)) {
    game.zonesVisited.add(zoneIndex);
    game.score += 150;
    game.checkpoint = { ...level.checkpoints[zoneIndex] };
    event(game, 'zone', { zone: zoneIndex });
  }
  for (const artifact of level.artifacts) {
    if (!game.collected.has(artifact.id) && Math.abs(player.x - artifact.x) < 0.75 && Math.abs(player.y + 0.75 - artifact.y) < 0.9) {
      game.collected.add(artifact.id);
      game.score += artifact.hidden ? 350 : artifact.guarded ? 250 : 150;
      player.animation = 'collect';
      player.animationUntil = game.time + 0.2;
      if (artifact.guarded) alert(game, 8, 'artifact');
      if (game.collected.size >= 5 && !game.doubleJumpUnlocked) {
        game.doubleJumpUnlocked = true;
        event(game, 'upgrade');
      }
      event(game, 'collect', { artifactId: artifact.id, x: artifact.x, y: artifact.y });
    }
  }
  game.prompt = '';
  const terminal = game.terminals.find((entry) => Math.abs(player.x - entry.x) < 1.8 && player.y < 1);
  const nearVault = Math.abs(player.x - level.vault.x) < 2 && player.y < 1.6;
  const required = Math.min(3, level.artifacts.length);
  if (nearVault && !game.vaultOpen) {
    game.prompt = game.collected.size < required ? `Find ${required - game.collected.size} more groceries to unlock checkout` : 'Hold E · scan loot at checkout';
    if (input.interact && game.collected.size >= required) {
      game.terminalProgress = Math.min(1, game.terminalProgress + dt / 0.7);
      player.animation = 'hack';
      player.animationUntil = game.time + 0.15;
      if (game.terminalProgress >= 1) {
        game.vaultOpen = true;
        game.score += 750;
        game.escapeRemaining = 45;
        alert(game, 100, 'vault');
        event(game, 'vault');
        game.terminalProgress = 0;
      }
    } else game.terminalProgress = 0;
  } else if (terminal) {
    const cooling = terminal.hackedUntil > game.time;
    game.prompt = cooling ? 'Security offline · keep moving' : 'Hold E · disable security for 10 seconds';
    if (input.interact && !cooling) {
      game.terminalProgress = Math.min(1, game.terminalProgress + dt / 1.05);
      player.animation = 'hack';
      player.animationUntil = game.time + 0.15;
      if (game.terminalProgress >= 1) {
        terminal.hackedUntil = game.time + 15;
        game.disabledUntil = game.time + 10;
        game.alarm = Math.max(0, game.alarm - 15);
        game.score += 125;
        game.terminalProgress = 0;
        event(game, 'hack', { terminalId: terminal.id });
      }
    } else game.terminalProgress = 0;
  } else game.terminalProgress = 0;
  if (!game.prompt && game.enemies.some(e => e.type === 'cart' && Math.abs(e.x - player.x) < 1.5 && player.y < 1)) game.prompt = 'Hold E · push shopping cart';
  if (player.x > level.vault.x + 3 && !game.vaultOpen) game.prompt = 'Checkout is locked · return to the scanner';
  if (player.x >= level.exit.x - 0.7 && game.vaultOpen) finish(game, 'won');
}

export function stepGame(game, input = {}, dt = FIXED_STEP) {
  if (game.status !== 'playing' && game.status !== 'countdown') return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  if (game.status === 'countdown') {
    game.countdown = Math.max(0, game.countdown - dt);
    if (game.countdown <= 0.00001) {
      game.status = 'playing';
      game.countdown = 0;
      event(game, 'start');
      record(game);
    }
    return;
  }
  game.time = Math.min(MAX_RUN_TIME, game.time + dt);
  if (game.time >= MAX_RUN_TIME) {
    event(game, 'timeout');
    finish(game, 'lost');
    return;
  }
  movePlayer(game, input, dt, solids(game));
  if (game.status !== 'playing') return;
  updateSecurity(game, input, dt);
  if (game.status !== 'playing') return;
  updateObjectives(game, input, dt);
  if (game.status !== 'playing') return;
  if (game.escapeRemaining !== null) {
    game.escapeRemaining = Math.max(0, game.escapeRemaining - dt);
    if (game.escapeRemaining <= 0) finish(game, 'lost');
  }
  if (game.status !== 'playing') return;
  if (game.time >= game.recordAt) {
    record(game);
    game.recordAt = game.time + 1 / 15;
  }
}

export function makeSnapshot(game) {
  return {
    health: game.player.health, score: game.score, alarm: Math.round(game.alarm), time: game.time,
    collected: game.collected.size, totalArtifacts: game.level.artifacts.length,
    zone: game.level.zones[game.zone].name, zoneIndex: game.zone, prompt: game.prompt,
    escapeRemaining: game.escapeRemaining, status: game.status, countdown: game.countdown,
    vaultOpen: game.vaultOpen, damageTaken: game.damageTaken, alerts: game.alerts,
    terminalProgress: game.terminalProgress, doubleJumpUnlocked: game.doubleJumpUnlocked,
    securityDisabled: game.disabledUntil > game.time,
  };
}
