// Gold coin mascot with the onion thief’s face, scarf and root limbs.
// Every pose shares a 32×48 cell and the same foot anchor; physics owns the hitbox.
export const SPRITE_STATES = ['idle', 'walk', 'run', 'jump', 'fall', 'landing', 'slide', 'collect', 'damage', 'sneak', 'victory', 'defeat', 'hack', 'doubleJump'];
export const CELL_W = 32, CELL_H = 48, FRAMES = 6;

export function spriteFrame(animation, time) {
  const row = Math.max(0, SPRITE_STATES.indexOf(animation));
  const rate = animation === 'run' ? 14 : animation === 'idle' ? 4 : 9;
  return { x: Math.floor(Math.max(0, time) * rate) % FRAMES * CELL_W, y: row * CELL_H };
}

export function createCoinAtlas() {
  const atlas = document.createElement('canvas');
  atlas.width = CELL_W * FRAMES; atlas.height = CELL_H * SPRITE_STATES.length;
  const c = atlas.getContext('2d');
  const ink = '#49352c', red = '#a83b52', light = '#d65d62', purple = '#7b416a', cream = '#fff0cb', gold = '#e9b34b';
  SPRITE_STATES.forEach((state, row) => {
    for (let frame = 0; frame < FRAMES; frame++) {
      c.save(); c.translate(frame * CELL_W, row * CELL_H);
      c.beginPath(); c.rect(0, 0, CELL_W, CELL_H); c.clip();
      const r = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
      const line = (x, y, xx, yy, color, width = 2) => {
        const steps = Math.max(Math.abs(xx - x), Math.abs(yy - y), 1);
        for (let i = 0; i <= steps; i++) r(x + (xx - x) * i / steps, y + (yy - y) * i / steps, width, width, color);
      };
      const gait = Math.round(Math.sin(frame / FRAMES * Math.PI * 2) * (state === 'run' ? 5 : 3));
      const moving = ['walk', 'run', 'sneak'].includes(state);
      const low = ['slide', 'sneak', 'landing', 'defeat'].includes(state);
      const bob = state === 'idle' ? (frame > 2 ? 1 : 0) : moving ? Math.abs(gait) > 2 ? 1 : 0 : frame % 3 === 0 ? 1 : 0;
      const dy = (low ? state === 'slide' ? 17 : state === 'defeat' ? 19 : 6 : 0) + bob;
      const hip = 32 + Math.min(dy, 8);
      // Thin root limbs and the reference's golden ankle bells.
      for (const side of [-1, 1]) {
        const foot = 15 + side * (moving ? gait : 4);
        const knee = 15 + side * (moving ? -gait : 2);
        const footY = ['jump', 'doubleJump', 'fall'].includes(state) ? 42 - side * 2 : 45;
        line(14 + side * 2, hip, knee, 39, ink, 3);
        line(knee, 39, foot, footY, ink, 3);
        line(14 + side * 2, hip, knee, 39, red);
        line(knee, 39, foot, footY, light);
        r(foot - 1, footY - 2, 5, 2, gold); r(foot - 1, footY, 7, 2, ink); r(foot, footY, 5, 1, red);
      }
      r(11, 24 + dy, 9, Math.max(3, hip - 24 - dy), ink);
      r(12, 24 + dy, 7, Math.max(2, hip - 25 - dy), purple);
      const raised = ['collect', 'victory', 'hack'].includes(state);
      line(11, 25 + dy, 6 - (moving ? gait : 0), raised ? 17 + frame % 2 : 33 + Math.min(dy, 8), ink, 3);
      line(20, 26 + dy, 25 + (moving ? gait : 0), raised ? 15 + frame % 2 : 34 + Math.min(dy, 8), red, 2);
      // Ridged gold rim and inset face keep the coin readable at game scale.
      r(10, 3 + dy, 12, 2, ink); r(7, 5 + dy, 18, 3, ink);
      r(4, 8 + dy, 24, 14, ink); r(7, 22 + dy, 18, 3, ink); r(10, 25 + dy, 12, 2, ink);
      r(10, 5 + dy, 12, 2, gold); r(7, 7 + dy, 18, 15, gold); r(5, 10 + dy, 22, 10, gold); r(10, 22 + dy, 12, 3, gold);
      r(10, 6 + dy, 11, 1, cream); r(7, 8 + dy, 2, 12, cream); r(10, 23 + dy, 12, 1, '#b97a30');
      r(24, 9 + dy, 2, 12, '#b97a30'); r(10, 9 + dy, 13, 13, '#f5ce70');
      r(5, 12 + dy, 2, 1, ink); r(5, 17 + dy, 2, 1, ink);
      r(25, 12 + dy, 2, 1, ink); r(25, 17 + dy, 2, 1, ink);
      if (state === 'defeat') {
        line(12, 16 + dy, 15, 19 + dy, ink, 1); line(15, 16 + dy, 12, 19 + dy, ink, 1);
        line(20, 16 + dy, 23, 19 + dy, ink, 1); line(23, 16 + dy, 20, 19 + dy, ink, 1);
      } else {
        r(11, 15 + dy, 6, 6, ink); r(18, 13 + dy, 7, 7, ink);
        r(12, 16 + dy, 4, 4, cream); r(19, 14 + dy, 5, 5, cream);
        r(14, 17 + dy, 2, 3, ink); r(22, 15 + dy, 2, 4, ink);
        r(14, 17 + dy, 1, 1, '#fff'); r(22, 15 + dy, 1, 1, '#fff');
        line(10, 13 + dy, 16, 15 + dy, ink, 1); line(18, 12 + dy, 24, 11 + dy, ink, 1);
      }
      r(17, 22 + dy, 7, 1, ink); r(19, 21 + dy, 4, 1, cream); r(23, 20 + dy, 1, 2, ink);
      // Red-and-cream woven scarf, trailing behind the direction of travel.
      r(9, 25 + dy, 14, 3, ink); r(10, 25 + dy, 12, 2, cream);
      r(11, 25 + dy, 2, 2, red); r(16, 25 + dy, 2, 2, red); r(21, 25 + dy, 2, 2, red);
      line(12, 27 + dy, 7, 33 + Math.min(dy, 6), cream, 3);
      r(9, 29 + dy, 3, 2, red); r(7, 32 + Math.min(dy, 6), 3, 2, red);
      if (state === 'damage') r(26, 7 + frame % 3, 2, 5, gold);
      c.restore();
    }
  });
  return atlas;
}

export function groceryKind(artifact) {
  return artifact.type === 'token' || artifact.type === 'high-fee' ? 'garlic' : 'onion';
}

export function groceryName(artifact) {
  return { sol: 'Golden onion', token: 'Fresh garlic', failed: 'Bruised onion', 'high-fee': 'Premium garlic', early: 'Red onion' }[artifact.type] || 'Onion';
}
