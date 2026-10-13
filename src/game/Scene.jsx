import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { platformPosition } from './levels.js';
import { sampleReplay } from './replay.js';
import { EnemyModel, Thief } from './models.jsx';

const C = { green: '#14f195', purple: '#9945ff', cyan: '#22d3ee', red: '#ff355e', gold: '#e2c081' };
const cube = new THREE.BoxGeometry(1, 1, 1);
const crystalGeometry = new THREE.OctahedronGeometry(.28, 0);
const dummy = new THREE.Object3D();
const particleColor = new THREE.Color();
const materials = {
  wall: new THREE.MeshStandardMaterial({ color: '#101322', roughness: .9 }),
  armor: new THREE.MeshStandardMaterial({ color: '#222a3d', metalness: .58, roughness: .55 }),
  metal: new THREE.MeshStandardMaterial({ color: '#384354', metalness: .7, roughness: .5 }),
  dark: new THREE.MeshStandardMaterial({ color: '#080d18', roughness: .85 }),
  purpleDark: new THREE.MeshStandardMaterial({ color: '#302141', roughness: .85 }),
  window: new THREE.MeshBasicMaterial({ color: '#25374c' }),
  glass: new THREE.MeshBasicMaterial({ color: '#47bbb9', transparent: true, opacity: .045, depthWrite: false }),
  ...Object.fromEntries(Object.entries(C).map(([key, color]) => [key, new THREE.MeshBasicMaterial({ color })])),
};

function Box({ position, scale, material = 'armor', rotation, ...props }) {
  return <mesh geometry={cube} material={materials[material]} position={position} scale={scale} rotation={rotation} dispose={null} {...props}/>;
}

function Instances({ items, material }) {
  const ref = useRef();
  useLayoutEffect(() => {
    for (let i = 0; i < items.length; i++) {
      const { p, s, r = 0 } = items[i];
      dummy.position.set(...p); dummy.scale.set(...s); dummy.rotation.set(0,0,r); dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[cube, materials[material], items.length]} dispose={null}/>;
}

function Sign({ text, color = '#91a1b8', width = 3, height = .38, position, rotation }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.font = '600 64px monospace';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, 512, 64, 995);
    const image = new THREE.CanvasTexture(canvas);
    image.colorSpace = THREE.SRGBColorSpace;
    return image;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={rotation}>
    <planeGeometry args={[width, height]}/>
    <meshBasicMaterial map={texture} transparent depthWrite={false}/>
  </mesh>;
}

function Architecture({ length, reducedQuality }) {
  const distant = useRef();
  const skyline = useMemo(() => {
    const groups = { dark: [], purpleDark: [], window: [], cyan: [] };
    for (let x = -24; x < length + 30; x += 6) {
      const height = 7 + Math.abs(Math.sin(x * 7.1)) * 9;
      groups.dark.push({ p: [x, height/2-2, -16], s: [5.3,height,2] });
      groups.purpleDark.push({ p: [x+2.3,height/2-2,-14.8], s: [.08,height,.05] });
      for (let row = 0; row < 6; row++) {
        groups.window.push({ p: [x+.25,row*1.45+1,-14.95], s: [3,.055,.03] });
        if ((row + Math.floor(x)) % 3 === 0) groups.cyan.push({ p: [x-1.5,row*1.45+1,-14.93], s: [.23,.055,.03] });
      }
    }
    return groups;
  }, [length]);
  const details = useMemo(() => {
    const groups = { dark: [], wall: [], armor: [], window: [], purpleDark: [], purple: [], cyan: [], green: [], metal: [] };
    const add = (material, p, s, r) => groups[material].push({ p, s, r });
    for (let x = 0; x < length; x += 12) {
      add('wall', [x+6,3.6,-6], [11.8,7.8,.45]);
      add('dark', [x+6,3.7,-5.72], [9.6,5.8,.13]);
      add('armor', [x+.35,3.1,-3.3], [.42,8.2,.8]);
      add('metal', [x+.38,3.1,-2.85], [.11,7.8,.09]);
      add('purple', [x+.43,4,-2.78], [.025,3.9,.045]);
      add('armor', [x+6,7.1,-3.1], [12,.4,.8]);
      add('purple', [x+6,6.87,-2.67], [11.9,.035,.035]);
      add('metal', [x+1.2,6.25,-3.1], [.3,2.3,.65], -.8);
      add('metal', [x+10.8,6.25,-3.1], [.3,2.3,.65], .8);
      add('dark', [x+6,.2,-4.8], [10.4,.5,.7]);
      add('green', [x+6,.47,-4.38], [9.9,.025,.05]);
      for (let slot = 0; slot < 5; slot += reducedQuality ? 2 : 1) {
        const rackX = x+3.1+slot*1.38;
        add('wall', [rackX,2.5,-5.4], [1.15,4.2,.45]);
        for (let row = 0; row < 8; row++) {
          add('armor', [rackX,row*.44+.8,-5.12], [.98,.32,.08]);
          add(row % 3 ? 'cyan' : 'green', [rackX-.36,row*.44+.8,-5.06], [.055,.045,.018]);
          add('window', [rackX+.05,row*.44+.8,-5.06], [.43,.025,.018]);
        }
      }
    }
    return groups;
  }, [length, reducedQuality]);
  useFrame(({ camera }) => { if (distant.current) distant.current.position.x = camera.position.x*.12; });
  return <>
    <group ref={distant}>{Object.entries(skyline).map(([material, items]) => <Instances key={material} material={material} items={items}/>)}</group>
    {Object.entries(details).filter(([, items]) => items.length).map(([material, items]) => <Instances key={material} material={material} items={items}/>)}
  </>;
}

function FloorDetails({ length }) {
  const items = useMemo(() => {
    const groups = { metal: [], window: [], green: [], purple: [] };
    for (let x = 0; x < length; x += 2) {
      groups.window.push({ p: [x,-.015,1.8], s: [.016,.02,4.7] });
      groups.metal.push({ p: [x,-.08,3.9], s: [.25,.12,.18] });
      if (x % 8 === 0) groups.green.push({ p: [x,.015,2.7], s: [.75,.02,.03] });
    }
    for (const z of [-.8,1,2.7,4]) groups.window.push({ p: [length/2,-.012,z], s: [length,.018,.022] });
    groups.purple.push({ p: [length/2,-.3,4.05], s: [length,.028,.028] });
    return groups;
  }, [length]);
  return <>{Object.entries(items).map(([material, data]) => <Instances key={material} material={material} items={data}/>)}</>;
}

function Platform({ platform, game }) {
  const root = useRef();
  useFrame(() => {
    if (!root.current || !platform.moving) return;
    const position = platformPosition(platform, game.time);
    root.current.position.set(position.x,position.y,0);
  });
  return <group ref={root} position={[platform.x,platform.y,0]}>
    <Box position={[0,-platform.h/2,0]} scale={[platform.w,platform.h,platform.floor ? 8 : 2.3]} material={platform.floor ? 'dark' : 'armor'}/>
    {!platform.floor && <>
      <Box position={[0,-.035,.03]} scale={[platform.w+.08,.075,2.43]} material="metal"/>
      <Box position={[0,-.13,1.23]} scale={[platform.w-.15,.027,.04]} material={platform.moving ? 'cyan' : 'green'}/>
      <Box position={[0,-platform.h-.075,0]} scale={[platform.w*.67,.15,1.4]} material="dark"/>
      {[-1,1].map(side => <Box key={side} position={[side*(platform.w/2-.24),-.15,1.26]} scale={[.07,.2,.035]} material="gold"/>)}
    </>}
  </group>;
}

function Artifact({ artifact, game, menu }) {
  const root = useRef();
  const crystal = useRef();
  const ring = useRef();
  const color = /fail/i.test(artifact.type) ? C.red : /token/i.test(artifact.type) ? C.cyan : /fee|early/i.test(artifact.type) ? C.gold : C.purple;
  useFrame(({ clock }) => {
    const t = menu ? clock.elapsedTime : game.time;
    if (root.current) root.current.visible = !game.collected.has(artifact.id);
    if (crystal.current) {
      crystal.current.position.y = Math.sin(t*2.4+artifact.x)*.09;
      crystal.current.rotation.y = t*.9;
      crystal.current.rotation.z = Math.sin(t)*.08;
    }
    if (ring.current) ring.current.rotation.z = -t*.3;
  });
  return <group ref={root} position={[artifact.x,artifact.y,0]}>
    <Box position={[0,-.65,-.14]} scale={[.98,.12,.92]} material="armor"/>
    <Box position={[0,-.575,-.14]} scale={[.79,.025,.72]} material="purple"/>
    <Box position={[0,-.12,-.14]} scale={[.88,.88,.82]} material="glass"/>
    <mesh ref={crystal} geometry={crystalGeometry} scale={[.95,1.45,.95]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={.65} roughness={.2} metalness={.6} flatShading/>
    </mesh>
    <mesh ref={ring} position={[0,-.01,-.35]}>
      <ringGeometry args={[.44,.455,32]}/><meshBasicMaterial color={color} transparent opacity={.36} side={THREE.DoubleSide}/>
    </mesh>
  </group>;
}

function Laser({ laser, game }) {
  const root = useRef();
  const beam = useRef();
  const aura = useRef();
  useFrame(() => {
    const state = game.lasers.find(item => item.id === laser.id) || laser;
    root.current.rotation.z = -(state.angle || 0);
    beam.current.visible = !!state.active;
    aura.current.visible = !!state.active || !!state.warning;
    aura.current.material.opacity = state.active ? .1 : .1 + Math.sin(game.time*22)*.08;
    aura.current.material.color.set(state.active ? C.red : C.gold);
  });
  return <group position={[laser.x,laser.y,0]}>
    <Box position={[0,.03,0]} scale={[.48,.16,.5]} material="dark"/>
    <Box position={[0,.13,0]} scale={[.3,.035,.3]} material="red"/>
    <group ref={root}>
      <mesh ref={beam} position={[0,laser.height/2,0]}><boxGeometry args={[.045,laser.height,.045]}/><meshBasicMaterial color="#ff7796"/></mesh>
      <mesh ref={aura} position={[0,laser.height/2,0]}><boxGeometry args={[.24,laser.height,.1]}/><meshBasicMaterial color={C.red} transparent opacity={.1} depthWrite={false}/></mesh>
    </group>
  </group>;
}

function SecurityCamera({ camera, game }) {
  const scan = useRef();
  const lens = useRef();
  useFrame(() => {
    const active = game.cameras.find(item => item.id === camera.id) || camera;
    scan.current.rotation.z = active.angle || 0;
    scan.current.visible = game.disabledUntil <= game.time;
    lens.current.material.color.set(active.detected ? C.red : C.gold);
  });
  return <group position={[camera.x,camera.y,-.4]}>
    <Box position={[0,.2,-.25]} scale={[.16,.6,.2]} material="armor"/>
    <Box scale={[.55,.25,.4]} material="metal"/>
    <mesh ref={lens} position={[0,-.12,.23]}><boxGeometry args={[.28,.065,.055]}/><meshBasicMaterial color={C.gold}/></mesh>
    <group ref={scan}>
      <mesh position={[0,-3,0]}>
        <coneGeometry args={[Math.tan(.23)*6,6,12,1,true]}/><meshBasicMaterial color={C.gold} transparent opacity={.035} depthWrite={false} side={THREE.DoubleSide}/>
      </mesh>
    </group>
  </group>;
}

function Terminal({ terminal, game }) {
  const screen = useRef();
  useFrame(() => {
    const state = game.terminals.find(item => item.id === terminal.id) || terminal;
    screen.current.material.color.set(state.hackedUntil > game.time ? C.green : C.cyan);
  });
  return <group position={[terminal.x,terminal.y,-.25]}>
    <Box position={[0,.35,0]} scale={[.4,.7,.48]} material="armor"/>
    <Box position={[0,.85,0]} scale={[.76,.55,.23]} material="dark" rotation={[-.18,0,0]}/>
    <mesh ref={screen} position={[0,.86,.125]} rotation={[-.18,0,0]}><planeGeometry args={[.58,.36]}/><meshBasicMaterial color={C.cyan} transparent opacity={.55}/></mesh>
    <Sign text="[ E ] HACK" width={1.45} height={.23} color={C.cyan} position={[0,1.5,0]}/>
  </group>;
}

function Door({ x, y, game, exit = false, decorative = false, paused = false }) {
  const left = useRef();
  const right = useRef();
  const glow = useRef();
  useFrame((_, delta) => {
    if (paused) return;
    const open = decorative || game.vaultOpen;
    const target = open ? 1.52 : .55;
    left.current.position.x = THREE.MathUtils.damp(left.current.position.x,-target,5,delta);
    right.current.position.x = THREE.MathUtils.damp(right.current.position.x,target,5,delta);
    glow.current.material.color.set(open ? C.green : C.purple);
  });
  return <group position={[x,y,decorative ? -3.5 : -.55]} scale={decorative ? [1.75,1.75,1] : exit ? 1 : [1,5.5/3.3,1]}>
    <Box position={[0,1.5,-.4]} scale={[3.5,3.3,.4]} material="dark"/>
    <Box position={[-1.55,1.65,0]} scale={[.27,3.3,.7]} material="metal"/>
    <Box position={[1.55,1.65,0]} scale={[.27,3.3,.7]} material="metal"/>
    <Box position={[0,3.18,0]} scale={[3.35,.28,.7]} material="armor"/>
    <mesh ref={glow} position={[0,3.05,.39]}><boxGeometry args={[3,.06,.025]}/><meshBasicMaterial color={C.green}/></mesh>
    <group ref={left} position={[-.55,0,0]}><Box position={[0,1.5,0]} scale={[1.06,3,.32]} material="armor"/><Box position={[.49,1.5,.2]} scale={[.025,2.8,.025]} material="purple"/></group>
    <group ref={right} position={[.55,0,0]}><Box position={[0,1.5,0]} scale={[1.06,3,.32]} material="armor"/><Box position={[-.49,1.5,.2]} scale={[.025,2.8,.025]} material="purple"/></group>
    <Sign text={decorative ? 'THE SOLANA ARCHIVE' : exit ? 'EXTRACTION  →' : 'MAIN VAULT'} width={3.2} height={.3} color={C.green} position={[0,3.63,.1]}/>
    {!decorative && <Sign text={exit ? 'REACH THE EXIT' : '[ E ] UNLOCK'} width={2.5} height={.25} color="#e3e9ee" position={[0,4.05,.1]}/>}
  </group>;
}

function Emblem({ position, game, menu, paused }) {
  const root = useRef();
  useFrame(({ clock }) => { if (root.current && !paused) root.current.position.y = position[1]+Math.sin((menu ? clock.elapsedTime : game.time)*.7)*.08; });
  return <group ref={root} position={position}>
    <mesh position={[0,0,-.07]}><ringGeometry args={[1.24,1.26,64]}/><meshBasicMaterial color={C.green} transparent opacity={.35}/></mesh>
    {[0,1,2].map(index => <Box key={index} position={[0,.4-index*.4,0]} rotation={[0,0,index === 1 ? .08 : -.08]} scale={[1.45,.19,.06]} material={index === 2 ? 'purple' : 'green'}/>)}
  </group>;
}

function Effects({ game, menu, reducedQuality }) {
  const ref = useRef();
  const projectiles = useRef();
  const particles = useRef([]);
  const previousEvent = useRef(0);
  const previousDust = useRef(0);
  const previousTime = useRef(0);
  useFrame(({ clock }) => {
    const t = menu ? clock.elapsedTime : game.time;
    const limit = reducedQuality ? 24 : 64;
    if (previousEvent.current > game.events.length || previousTime.current > t) { previousEvent.current = 0; particles.current = []; previousDust.current = 0; }
    previousTime.current = t;
    for (let i = previousEvent.current; i < game.events.length; i++) {
      const event = game.events[i];
      if (!['collect','damage','land','vault'].includes(event.type) || t-event.time > .65) continue;
      const count = event.type === 'land' ? 5 : reducedQuality ? 6 : 12;
      for (let j = 0; j < count; j++) {
        const angle = j*2.399;
        particles.current.push({ x:event.x, y:event.y+.3, vx:Math.cos(angle)*(1+j*.09), vy:Math.sin(angle)*(1+j*.1)+1, time:event.time, color:event.type === 'damage' ? C.red : C.green });
      }
    }
    previousEvent.current = game.events.length;
    if (!menu && game.player.grounded && Math.abs(game.player.vx)>2 && t-previousDust.current>(reducedQuality ? .14 : .07)) {
      previousDust.current=t;
      particles.current.push({ x:game.player.x,y:game.player.y+.06,vx:-game.player.facing*.6,vy:.15,time:t,color:'#7d8eac' });
    }
    particles.current=particles.current.filter(p=>t>=p.time && t-p.time<.65).slice(-limit);
    ref.current.count=limit;
    for (let i=0;i<limit;i++) {
      const p=particles.current[i];
      if (p) {
        const age=t-p.time;
        dummy.position.set(p.x+p.vx*age,p.y+p.vy*age-age*age*2,.55);
        dummy.scale.setScalar(.055*(1-age/.65));
        ref.current.setColorAt(i,particleColor.set(p.color));
      } else dummy.scale.setScalar(0);
      dummy.rotation.set(0,0,0); dummy.updateMatrix(); ref.current.setMatrixAt(i,dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate=true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate=true;
    for(let i=0;i<16;i++) {
      const shot=game.projectiles?.[i];
      if(shot) { dummy.position.set(shot.x,shot.y,.25); const warning=shot.warning>0 ? 1.5+Math.sin(t*25)*.5 : 1; dummy.scale.set(.15*warning,.08*warning,.1); }
      else dummy.scale.setScalar(0);
      dummy.updateMatrix(); projectiles.current.setMatrixAt(i,dummy.matrix);
    }
    projectiles.current.instanceMatrix.needsUpdate=true;
  });
  return <>
    <instancedMesh ref={ref} args={[cube,null,64]} frustumCulled={false}><meshBasicMaterial/></instancedMesh>
    <instancedMesh ref={projectiles} args={[cube,materials.red,16]} frustumCulled={false}/>
  </>;
}

function Ghost({ frames, game, paused }) {
  const actor = useMemo(() => ({ x:2,y:0,facing:1,animation:'idle' }), []);
  useFrame(() => {
    const sample = sampleReplay(frames,game.time);
    if (sample) Object.assign(actor,sample);
  }, -1);
  return <Thief actor={actor} game={game} ghost paused={paused} scale={.82}/>;
}

export default function Scene({ game, mode = 'playing', paused = false, reducedQuality = false, ghostFrames = null, onReady }) {
  const { camera, size } = useThree();
  const ready = useRef(false);
  const initialized = useRef(false);
  const alertLight = useRef();
  const menu = mode === 'menu';
  const { level } = game;
  useEffect(() => {
    initialized.current=false;
    camera.near=.1; camera.far=110;
    camera.updateProjectionMatrix();
  }, [camera,mode,level.id]);
  useFrame(({ clock }, delta) => {
    if (!ready.current) { ready.current=true; onReady?.(); }
    const compact=size.width<700;
    const width=menu ? (compact ? 22 : 32) : compact ? 24 : 31;
    const targetZoom=Math.min(size.width/width,size.height/(menu ? 13 : 13.5));
    if (Math.abs(camera.zoom-targetZoom)>.01) { camera.zoom=targetZoom; camera.updateProjectionMatrix(); }
    const targetX=menu ? 13.5 : Math.max(10,Math.min(level.length-8,game.player.x+(compact ? 4 : 6)));
    const targetY=menu ? 3.65 : 3.35+Math.max(0,game.player.y-3)*.4;
    if(!initialized.current) { camera.position.set(targetX,targetY+1.5,30); initialized.current=true; }
    const shake=!menu && game.player.invincible>2.15 ? Math.sin(game.time*92)*.1 : 0;
    camera.position.x=THREE.MathUtils.damp(camera.position.x,targetX,mode==='replay'?3:7,Math.min(delta,.05))+shake;
    camera.position.y=THREE.MathUtils.damp(camera.position.y,targetY+1.5,6,Math.min(delta,.05));
    camera.lookAt(camera.position.x,targetY,-1);
    if(alertLight.current) { alertLight.current.position.x=menu?18:game.player.x; alertLight.current.color.set(game.alarm>=100 ? C.red : C.purple); alertLight.current.intensity=game.alarm>=100 ? 9+Math.sin(game.time*5)*2 : 7; }
  }, -1);
  return <>
    <color attach="background" args={['#090d18']}/>
    <fog attach="fog" args={['#090d18',32,76]}/>
    <ambientLight intensity={1.25} color="#8c98c5"/>
    <directionalLight position={[8,12,14]} intensity={2.5} color="#bbd9ec"/>
    <pointLight ref={alertLight} position={[menu?18:game.player.x,5,3]} color={C.purple} intensity={7} distance={18} decay={1.5}/>
    <pointLight position={[19,3,4]} color={C.green} intensity={8} distance={12} decay={1.5}/>
    <Architecture length={level.length} reducedQuality={reducedQuality}/>
    <FloorDetails length={level.length}/>
    {level.platforms.map(platform => <Platform key={platform.id} platform={platform} game={game}/>)}
    {level.artifacts.map(artifact => <Artifact key={artifact.id} artifact={artifact} game={game} menu={menu}/>)}
    {level.lasers.map(laser => <Laser key={laser.id} laser={laser} game={game}/>)}
    {level.enemies.map(enemy => <EnemyModel key={enemy.id} enemy={enemy} game={game} menu={menu} paused={paused}/>)}
    {level.cameras.map(camera => <SecurityCamera key={camera.id} camera={camera} game={game}/>)}
    {level.terminals.map(terminal => <Terminal key={terminal.id} terminal={terminal} game={game}/>)}
    <Door x={level.vault.x} y={level.vault.y} game={game} paused={paused}/>
    <Door x={level.exit.x} y={level.exit.y} game={game} exit paused={paused}/>
    <Door x={21} y={0} game={game} decorative paused={paused}/>
    <Emblem position={[21,6.35,-3.1]} game={game} menu={menu} paused={paused}/>
    {level.zones.map((zone,index) => <Sign key={zone.name} text={`${String(index+1).padStart(2,'0')} // ${zone.name.toUpperCase()}`} width={5} height={.38} position={[zone.start+8,5.8,-2.8]}/>)}
    <Sign text="PUBLIC HISTORY. PRIVATE AMBITION." color="#476361" width={5} height={.2} position={[21,.72,-3.1]}/>
    {menu ? <>
      <Thief menu game={game} paused={paused} position={[18.6,1.66,.4]} scale={1.45}/>
      <EnemyModel menu game={game} paused={paused} enemy={{id:'menu-drone',type:'drone',x:24.5,y:5.6}}/>
      <Sign text="◈  GENESIS ARTIFACT" color={C.green} width={3.4} height={.26} position={[16.1,5,-.7]}/>
    </> : <Thief game={game} paused={paused} scale={.82}/>}
    {ghostFrames?.length>0 && !menu && <Ghost frames={ghostFrames} game={game} paused={paused}/>}
    <Effects game={game} menu={menu} reducedQuality={reducedQuality}/>
  </>;
}
