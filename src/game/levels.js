export const GAME_VERSION = '1';

function hash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function randomSource(seed) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// The uninterrupted lower route and bounded platform rises are the solvability constraint.
export function generateLevel({ seed = 'demo', artifacts = [], version = GAME_VERSION } = {}) {
  const fingerprint = `${version}:${seed}:${artifacts.map((artifact) => artifact.signature || artifact.id || '').join(',')}`;
  const courseHash = hash(fingerprint);
  const random = randomSource(courseHash);
  const names = ['Entrance', 'Transaction Gallery', 'Laser Corridor', 'Security Chamber', 'Main Vault', 'Escape Route'];
  const zones = names.map((name, index) => ({ name, start: index * 24, end: (index + 1) * 24 }));
  const platforms = [];
  const positions = [];
  for (let zone = 0; zone < zones.length; zone += 1) {
    const start = zone * 24;
    const offset = (random() - 0.5) * 1.1;
    platforms.push({ id: `floor-${zone}`, x: start + 12, y: 0, w: 24, h: 1.2, floor: true });
    platforms.push({ id: `step-${zone}-0`, x: start + 7 + offset, y: 1.35, w: 3.6, h: 0.4 });
    platforms.push({ id: `step-${zone}-1`, x: start + 13 + offset, y: 2.75, w: 4.2, h: 0.4 });
    platforms.push({ id: `step-${zone}-2`, x: start + 19 + offset, y: 1.65, w: 3.8, h: 0.4,
      ...(zone === 1 || zone === 3 ? { moving: { axis: 'y', amplitude: 0.45, speed: 1.1, phase: random() * Math.PI * 2 } } : {}) });
    positions.push({ x: start + 3.5, y: 0.95 }, { x: start + 13 + offset, y: 3.65 });
  }
  platforms.push({ id: 'slide-tunnel', x: 60, y: 2.1, w: 3.6, h: 1.05 });
  const levelArtifacts = artifacts.slice(0, 18).map((artifact, index) => {
    const position = positions[index % positions.length];
    return { ...artifact, id: `artifact-${index}`, ...position,
      ...(index >= positions.length ? { x: position.x + 2, y: position.y + 0.25 } : {}),
      guarded: index >= 8, hidden: index % 4 === 3 };
  });
  const lasers = [
    { id: 'laser-0', x: 44, y: 0.05, height: 2.4, period: 4, phase: random() * 4, kind: 'timed' },
    { id: 'laser-1', x: 53, y: 0.05, height: 2.8, period: 3.7, phase: random() * 3.7, kind: 'timed' },
    { id: 'laser-2', x: 65, y: 0.05, height: 2.5, period: 4.4, phase: random() * 4.4, kind: 'rotating' },
    { id: 'laser-3', x: 93, y: 0.05, height: 2.8, period: 4.1, phase: random() * 4.1, kind: 'timed' },
    { id: 'laser-4', x: 129, y: 0.05, height: 2.5, period: 3.8, phase: random() * 3.8, kind: 'timed' },
  ];
  return {
    seed: String(seed), id: `v${version}-${courseHash.toString(36)}`, version, length: 144, platforms, artifacts: levelArtifacts, lasers,
    enemies: [
      { id: 'drone-0', type: 'drone', x: 35, y: 4.7, minX: 28, maxX: 46 },
      { id: 'guardian-0', type: 'guardian', x: 85, y: 0, minX: 82, maxX: 88 },
      { id: 'drone-1', type: 'drone', x: 104, y: 4.8, minX: 98, maxX: 117 },
      { id: 'guardian-1', type: 'guardian', x: 133, y: 0, minX: 130, maxX: 136 },
    ],
    cameras: [{ id: 'camera-0', x: 39, y: 5.3 }, { id: 'camera-1', x: 86, y: 5.3 }, { id: 'camera-2', x: 113, y: 5.3 }],
    terminals: [{ id: 'terminal-0', x: 47, y: 0 }, { id: 'terminal-1', x: 84, y: 0 }],
    vault: { x: 114, y: 0 }, exit: { x: 141, y: 0 },
    checkpoints: [{ x: 2, y: 0 }, { x: 25, y: 0 }, { x: 49, y: 0 }, { x: 73, y: 0 }, { x: 97, y: 0 }, { x: 121, y: 0 }], zones,
  };
}

export function platformPosition(platform, time) {
  if (!platform.moving) return { x: platform.x, y: platform.y };
  const { axis, amplitude, speed, phase } = platform.moving;
  const offset = Math.sin(time * speed + phase) * amplitude;
  return { x: platform.x + (axis === 'x' ? offset : 0), y: platform.y + (axis === 'y' ? offset : 0) };
}
