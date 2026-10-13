import React, { Component, Suspense, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const box = new THREE.BoxGeometry(1, 1, 1);
const fallbackArmor = new THREE.MeshStandardMaterial({ color: '#151d30', roughness: .65, metalness: .4 });
const fallbackNeon = new THREE.MeshBasicMaterial({ color: '#14f195' });
const fallbackThreat = new THREE.MeshBasicMaterial({ color: '#ff355e' });
const fallbackGhost = new THREE.MeshBasicMaterial({ color: '#ad80ff', transparent: true, opacity: .34, depthWrite: false });

class ModelBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Asset({ name, ghost }) {
  const { scene } = useGLTF(`/models/${name}.gltf`);
  const copy = useMemo(() => {
    const object = scene.clone(true);
    if (ghost) object.traverse(child => {
      if (child.isMesh) {
        child.material = fallbackGhost;
        child.renderOrder = 2;
      }
    });
    return object;
  }, [scene, ghost]);
  return <primitive object={copy} />;
}

function Block({ position, scale, material = fallbackArmor, ...props }) {
  return <mesh geometry={box} material={material} position={position} scale={scale} dispose={null} {...props} />;
}

export function ProceduralThief({ ghost = false, guardian = false }) {
  const armor = ghost ? fallbackGhost : fallbackArmor;
  const light = ghost ? fallbackGhost : guardian ? fallbackThreat : fallbackNeon;
  return <group>
    <group name="Body" position={[0, .9, 0]}>
      <Block position={[0,.14,0]} scale={[.5,.6,.33]} material={armor}/>
      <Block position={[0,.14,-.26]} scale={[.35,.4,.2]} material={armor}/>
      <group name="Head" position={[0,.65,0]}>
        <Block scale={[.45,.4,.38]} material={armor}/>
        <Block name="Visor" position={[0,.04,.205]} scale={[.36,.07,.035]} material={light}/>
      </group>
      {[-1, 1].map((sign, index) => <group key={sign}>
        <group name={index ? 'RightArm' : 'LeftArm'} position={[sign*.33,.4,0]}>
          <Block position={[0,-.24,0]} scale={[.18,.51,.2]} material={armor}/>
          <Block position={[0,-.3,.115]} scale={[.11,.06,.025]} material={light}/>
        </group>
        <group name={index ? 'RightLeg' : 'LeftLeg'} position={[sign*.145,-.18,0]}>
          <Block position={[0,-.3,0]} scale={[.2,.6,.23]} material={armor}/>
          <Block position={[0,-.6,.065]} scale={[.22,.12,.34]} material={armor}/>
          <Block position={[0,-.665,.065]} scale={[.23,.03,.35]} material={light}/>
        </group>
      </group>)}
    </group>
  </group>;
}

function ProceduralDrone() {
  return <group>
    <Block scale={[.75,.27,.4]}/>
    <Block position={[0,0,.23]} scale={[.24,.09,.035]} material={fallbackThreat}/>
    <Block scale={[1.7,.07,.17]}/>
    {[-1,1].map(side => <Block key={side} position={[side*.73,.07,0]} scale={[.55,.025,.12]} material={fallbackNeon}/>)}
  </group>;
}

function Model({ name, ghost }) {
  const fallback = name === 'drone' ? <ProceduralDrone/> : <ProceduralThief ghost={ghost} guardian={name === 'guardian'}/>;
  if (ghost) return fallback;
  return <ModelBoundary fallback={fallback}>
    <Suspense fallback={fallback}><Asset name={name} ghost={ghost}/></Suspense>
  </ModelBoundary>;
}

const jointNames = ['Body', 'Head', 'Visor', 'LeftArm', 'RightArm', 'LeftForearm', 'RightForearm', 'LeftLeg', 'RightLeg', 'LeftShin', 'RightShin'];

export const Thief = forwardRef(function Thief({ actor, game, menu = false, ghost = false, paused = false, ...props }, forwardedRef) {
  const root = useRef();
  const joints = useRef({});
  const previousModel = useRef();
  const visorHeight = useRef(.07);
  useImperativeHandle(forwardedRef, () => root.current);
  useFrame(({ clock }, delta) => {
    const group = root.current;
    if (!group) return;
    const model = group.children[0];
    if (model !== previousModel.current) {
      previousModel.current = model;
      joints.current = Object.fromEntries(jointNames.map(name => [name, group.getObjectByName(name)]));
      visorHeight.current = joints.current.Visor?.scale.y || .07;
    }
    if (paused || document.hidden) return;
    const p = actor || game?.player;
    const t = menu ? clock.elapsedTime : game?.time || 0;
    if (p && !menu) {
      group.position.set(p.x, p.y + .01, ghost ? -.12 : .25);
      group.rotation.y = THREE.MathUtils.damp(group.rotation.y, (p.facing || 1) * .95, 18, Math.min(delta, .05));
      group.visible = ghost || !p.invincible || Math.sin(t * 40) > -.35;
    } else group.rotation.y = .85;
    const animation = menu ? 'run' : p?.animation || 'idle';
    const speed = menu ? 7 : Math.abs(p?.vx ?? (animation === 'run' ? 6 : 0));
    const running = animation === 'run' || animation === 'running' || (speed > .3 && p?.grounded);
    const jumping = !menu && (['jump', 'doubleJump', 'double-jump', 'fall'].includes(animation) || p?.grounded === false);
    const doubleJump = animation === 'doubleJump' || animation === 'double-jump';
    const landing = animation === 'landing' || animation === 'land';
    const damaged = animation === 'damage' || animation === 'hurt';
    const collecting = animation === 'collect';
    const sliding = !menu && (p?.sliding || animation === 'slide');
    const hacking = animation === 'hack' || animation === 'hacking';
    const victory = animation === 'victory' || (!ghost && game?.status === 'won');
    const defeat = animation === 'defeat' || (!ghost && game?.status === 'lost');
    const phase = t * (10 + Math.min(speed, 10) * .8);
    const gait = running ? Math.sin(phase) : 0;
    const blend = (value, target) => THREE.MathUtils.damp(value, target, 24, Math.min(delta, .05));
    const { Body, Head, Visor, LeftArm, RightArm, LeftForearm, RightForearm, LeftLeg, RightLeg, LeftShin, RightShin } = joints.current;
    if (Body) {
      Body.position.y = blend(Body.position.y, sliding ? .3 : landing ? .74 : .9 + (running ? Math.abs(Math.sin(phase))*.045 : Math.sin(t*2)*.012));
      Body.rotation.x = blend(Body.rotation.x, sliding ? .95 : damaged ? -.32 : doubleJump ? -.35 : running ? .15 : 0);
      Body.rotation.z = blend(Body.rotation.z, defeat ? -1.15 : damaged ? -.22 : victory ? Math.sin(t*7)*.08 : 0);
    }
    if (Head) Head.rotation.x = blend(Head.rotation.x, hacking ? .2 : sliding ? -.4 : -.035);
    if (Visor) Visor.scale.y = visorHeight.current * ((t % 4.7) > 4.58 ? .32 : 1);
    if (LeftArm) { LeftArm.rotation.x = blend(LeftArm.rotation.x, victory ? -2.3 : hacking ? -1.2 : damaged ? -1.5 : jumping ? -.7 : gait*.85); LeftArm.rotation.z = blend(LeftArm.rotation.z, victory ? -.45 : .08); }
    if (RightArm) { RightArm.rotation.x = blend(RightArm.rotation.x, victory ? -2.3 : collecting ? -1.8 : hacking ? -1.1 + Math.sin(t*18)*.1 : damaged ? -1.5 : jumping ? -.9 : -gait*.85); RightArm.rotation.z = blend(RightArm.rotation.z, victory ? .45 : -.08); }
    if (LeftForearm) LeftForearm.rotation.x = blend(LeftForearm.rotation.x, running || hacking ? -.65 : -.15);
    if (RightForearm) RightForearm.rotation.x = blend(RightForearm.rotation.x, running || hacking || collecting ? -.65 : -.15);
    if (LeftLeg) LeftLeg.rotation.x = blend(LeftLeg.rotation.x, sliding ? -1.2 : jumping ? -.75 : landing ? -.3 : -gait*.9);
    if (RightLeg) RightLeg.rotation.x = blend(RightLeg.rotation.x, sliding ? .45 : doubleJump ? -.55 : jumping ? .35 : landing ? -.3 : gait*.9);
    if (LeftShin) LeftShin.rotation.x = blend(LeftShin.rotation.x, jumping ? 1 : landing ? .6 : running ? Math.max(0, gait)*.85 : 0);
    if (RightShin) RightShin.rotation.x = blend(RightShin.rotation.x, jumping ? .5 : landing ? .6 : running ? Math.max(0,-gait)*.85 : 0);
  });
  return <group ref={root} {...props}><Model name="thief" ghost={ghost}/></group>;
});

export function EnemyModel({ enemy, game, menu = false, paused = false }) {
  const root = useRef();
  const joints = useRef({});
  const previousModel = useRef();
  const isDrone = enemy.type === 'drone';
  useFrame(({ clock }) => {
    const group = root.current;
    if (!group || paused || document.hidden) return;
    if (group.children[0] !== previousModel.current) {
      previousModel.current = group.children[0];
      joints.current = Object.fromEntries(['Rotor-1', 'Rotor1', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm'].map(name => [name, group.getObjectByName(name)]));
    }
    const t = menu ? clock.elapsedTime : game.time;
    const active = game.enemies?.find(item => item.id === enemy.id) || enemy;
    group.position.set(active.x, active.y + (isDrone ? Math.sin(t*3 + enemy.x)*.09 : 0), .05);
    group.rotation.y = (active.facing || 1) * .7;
    if (isDrone) {
      group.rotation.z = Math.sin(t * 2 + enemy.x)*.055;
      const left = joints.current['Rotor-1'];
      const right = joints.current.Rotor1;
      if (left) left.rotation.y = t*40;
      if (right) right.rotation.y = -t*40;
    } else {
      const { LeftLeg, RightLeg, LeftArm, RightArm } = joints.current;
      const gait = active.state === 'disabled' ? 0 : Math.sin(t*(active.state === 'chase' ? 12 : 9))*.4;
      if (LeftLeg) LeftLeg.rotation.x = gait;
      if (RightLeg) RightLeg.rotation.x = -gait;
      if (LeftArm) LeftArm.rotation.x = -gait*.7;
      if (RightArm) RightArm.rotation.x = gait*.7;
    }
  });
  return <group ref={root}><Model name={isDrone ? 'drone' : 'guardian'}/></group>;
}
