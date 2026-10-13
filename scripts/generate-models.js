import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Small, self-contained glTF assets keep the first heist independent of an asset CDN.
const output = fileURLToPath(new URL('../public/models/', import.meta.url));
mkdirSync(output, { recursive: true });
const colors = {
  armor: [0.075, 0.095, 0.15, 1], dark: [0.025, 0.035, 0.065, 1],
  purple: [0.6, 0.27, 1, 1], green: [0.078, 0.945, 0.58, 1],
  cyan: [0.13, 0.83, 0.94, 1], white: [0.65, 0.75, 0.8, 1],
  red: [1, 0.13, 0.3, 1], gold: [1, 0.62, 0.2, 1],
};

function build(name, construct) {
  const positions = [], normals = [], indices = [];
  const faces = [
    [[1, 0, 0], [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]],
    [[-1, 0, 0], [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]],
    [[0, 1, 0], [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],
    [[0, -1, 0], [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]],
    [[0, 0, 1], [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],
    [[0, 0, -1], [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]],
  ];
  for (const [normal, vertices] of faces) {
    const start = positions.length / 3;
    for (const vertex of vertices) { positions.push(...vertex); normals.push(...normal); }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const buffers = [Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Float32Array(normals).buffer), Buffer.from(new Uint16Array(indices).buffer)];
  const buffer = Buffer.concat(buffers);
  const palette = Object.keys(colors);
  const doc = {
    asset: { version: '2.0', generator: 'SOL HEIST low-poly model workshop' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, children: [] }],
    materials: palette.map(key => ({ name: key, pbrMetallicRoughness: { baseColorFactor: colors[key], metallicFactor: .35, roughnessFactor: .65 }, ...(['green','purple','cyan','red','gold'].includes(key) ? { emissiveFactor: colors[key].slice(0,3) } : {}) })),
    meshes: palette.map((key, material) => ({ name: key, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material }] })),
    buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${buffer.toString('base64')}` }],
    bufferViews: buffers.map((part, i) => ({ buffer: 0, byteOffset: buffers.slice(0,i).reduce((sum, item) => sum + item.length, 0), byteLength: part.length, target: i === 2 ? 34963 : 34962 })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-.5,-.5,-.5], max: [.5,.5,.5] },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  };
  function joint(jointName, translation, parent = 0) {
    const index = doc.nodes.length;
    doc.nodes.push({ name: jointName, translation, children: [] });
    doc.nodes[parent].children.push(index);
    return index;
  }
  function box(partName, position, scale, color, parent = 0, rotation) {
    const index = doc.nodes.length;
    doc.nodes.push({ name: partName, translation: position, scale, mesh: palette.indexOf(color), ...(rotation ? { rotation } : {}) });
    doc.nodes[parent].children.push(index);
    return index;
  }
  construct({ joint, box });
  assert(doc.nodes.length > 8 && doc.nodes.every(node => node.mesh === undefined || node.mesh >= 0));
  assert(buffer.length % 4 === 0 && indices.every(index => index < positions.length / 3));
  writeFileSync(`${output}${name}.gltf`, JSON.stringify(doc));
  console.log(`${name}.gltf: ${doc.nodes.length} nodes, ${buffer.length} geometry bytes`);
}

build('thief', ({ joint, box }) => {
  const body = joint('Body', [0, .9, 0]);
  box('Tactical_jacket', [0, .17, 0], [.49,.59,.32], 'armor', body);
  box('Chest_plate', [0,.2,.175], [.32,.34,.04], 'dark', body);
  box('Chest_light', [-.12,.28,.2], [.055,.16,.015], 'green', body);
  box('Belt', [0,-.12,0], [.5,.105,.35], 'dark', body);
  box('Belt_buckle', [0,-.12,.19], [.11,.08,.04], 'purple', body);
  box('Backpack', [0,.16,-.26], [.37,.43,.22], 'dark', body);
  box('Backpack_strip', [.16,.16,-.38], [.04,.31,.02], 'purple', body);
  const head = joint('Head', [0,.66,0], body);
  box('Hood', [0,0,-.025], [.48,.43,.41], 'dark', head);
  box('Helmet_top', [0,.18,0], [.37,.11,.35], 'armor', head);
  box('Face_mask', [0,-.02,.2], [.37,.26,.065], 'armor', head);
  box('Visor', [0,.045,.24], [.35,.07,.035], 'green', head);
  box('Visor_left', [-.17,.045,.2], [.05,.07,.12], 'green', head);
  box('Chin', [0,-.13,.22], [.24,.065,.06], 'dark', head);
  box('Headset', [-.255,0,0], [.075,.17,.2], 'purple', head);
  for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
    const arm = joint(`${side}Arm`, [sign*.33,.4,0], body);
    box(`${side}_shoulder`, [0,-.02,0], [.21,.22,.28], 'dark', arm);
    box(`${side}_sleeve`, [0,-.19,0], [.16,.33,.19], 'armor', arm);
    box(`${side}_arm_stripe`, [sign*.09,-.14,0], [.02,.19,.19], 'purple', arm);
    const forearm = joint(`${side}Forearm`, [0,-.36,0], arm);
    box(`${side}_glove`, [0,-.13,.015], [.15,.27,.18], 'dark', forearm);
    box(`${side}_wrist_light`, [0,-.06,.11], [.1,.045,.03], 'green', forearm);
    const leg = joint(`${side}Leg`, [sign*.145,-.18,0], body);
    box(`${side}_thigh`, [0,-.2,0], [.2,.38,.24], 'armor', leg);
    box(`${side}_knee`, [0,-.35,.1], [.2,.12,.085], 'dark', leg);
    const shin = joint(`${side}Shin`, [0,-.38,0], leg);
    box(`${side}_shin`, [0,-.12,0], [.17,.25,.2], 'dark', shin);
    box(`${side}_boot`, [0,-.265,.055], [.22,.12,.35], 'dark', shin);
    box(`${side}_sole`, [0,-.325,.055], [.225,.035,.355], 'green', shin);
    box(`${side}_ankle_strip`, [sign*.095,-.16,0], [.035,.09,.16], 'purple', shin);
  }
});

build('drone', ({ joint, box }) => {
  const body = joint('Body', [0,0,0]);
  box('Hull', [0,0,0], [.7,.28,.44], 'armor', body);
  box('Underbody', [0,-.14,0], [.42,.16,.34], 'dark', body);
  box('Lens', [0,0,.24], [.21,.12,.08], 'red', body);
  box('Status', [0,.16,0], [.21,.035,.29], 'purple', body);
  for (const side of [-1,1]) {
    box(`Wing${side}`, [side*.53,.02,0], [.48,.075,.21], 'dark', body);
    const rotor = joint(`Rotor${side}`, [side*.75,.09,0], body);
    box(`Rotor_blade${side}`, [0,0,0], [.53,.027,.12], 'cyan', rotor);
    box(`Motor${side}`, [side*.75,.035,0], [.13,.17,.16], 'armor', body);
  }
});

build('guardian', ({ joint, box }) => {
  const body = joint('Body', [0,1.05,0]);
  box('Heavy_armor', [0,.14,0], [.7,.72,.47], 'armor', body);
  box('Chest', [0,.2,.255], [.48,.45,.06], 'dark', body);
  box('Core', [0,.2,.3], [.22,.16,.04], 'red', body);
  const head = joint('Head', [0,.73,0], body);
  box('Head_armor', [0,0,0], [.44,.36,.35], 'dark', head);
  box('Eye', [0,.02,.19], [.34,.065,.03], 'red', head);
  for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
    const arm = joint(`${side}Arm`, [sign*.48,.37,0], body);
    box(`${side}_pauldron`, [0,0,0], [.31,.32,.38], 'dark', arm);
    box(`${side}_arm`, [0,-.35,0], [.23,.47,.26], 'armor', arm);
    box(`${side}_hand`, [0,-.61,.04], [.26,.18,.32], 'dark', arm);
    const leg = joint(`${side}Leg`, [sign*.22,-.28,0], body);
    box(`${side}_leg`, [0,-.27,0], [.28,.53,.32], 'armor', leg);
    box(`${side}_foot`, [0,-.63,.07], [.32,.2,.47], 'dark', leg);
    box(`${side}_light`, [0,-.68,.315], [.26,.04,.025], 'red', leg);
  }
});
