import { Component, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { stepGame, makeSnapshot } from './engine.js';
import { sampleReplay } from './replay.js';
import Scene from './Scene.jsx';

class CanvasBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <div className="canvas-error"><strong>Graphics could not start</strong><p>SOL HEIST needs a browser with WebGL. Enable hardware acceleration and reload.</p><button className="button secondary" onClick={() => location.reload()}>Reload graphics</button></div>;
    return this.props.children;
  }
}

function Simulation({ game, mode, paused, input, onTick, onFinish, audio, replay, replayTimeRef, speed, onReplayEnd, onSlow }) {
  const accumulator = useRef(0), hudTime = useRef(0), eventsSeen = useRef(0), finished = useRef(false), slowFrames = useRef(0);
  useEffect(() => { accumulator.current = 0; hudTime.current = 0; eventsSeen.current = 0; finished.current = false; }, [game, mode]);
  useFrame((_, delta) => {
    if (delta > .046 && mode === 'playing' && ++slowFrames.current === 90) onSlow();
    if (paused || document.hidden || mode === 'menu') { accumulator.current = 0; return; }
    const dt = Math.min(delta, .075);
    if (mode === 'playing') {
      accumulator.current += dt;
      while (accumulator.current >= 1 / 120) {
        stepGame(game, input.current, 1 / 120);
        input.current.jumpPressed = false;
        accumulator.current -= 1 / 120;
      }
      for (let i = eventsSeen.current; i < game.events.length; i++) audio.play(game.events[i].type);
      eventsSeen.current = game.events.length;
      if (!finished.current && ['won', 'lost'].includes(game.status)) { finished.current = true; onFinish(game); }
    } else if (mode === 'replay' && replay) {
      const frame = sampleReplay(replay.frames, replayTimeRef.current);
      const cinematicSpeed = ['jump', 'jumping', 'double-jump'].includes(frame?.animation) ? .58 : 1;
      replayTimeRef.current = Math.min(replay.time, replayTimeRef.current + dt * speed * cinematicSpeed);
      if (frame) Object.assign(game.player, frame, { vx: frame.animation === 'run' ? 6 : 0 });
      game.time = replayTimeRef.current;
      game.collected = new Set(replay.events.filter((e) => e.type === 'pickup' && e.time <= game.time).map((e) => e.id || e.artifactId));
      game.vaultOpen = replay.events.some((e) => e.type === 'vault' && e.time <= game.time);
      if (game.time >= replay.time && !finished.current) { finished.current = true; onReplayEnd(); }
    }
    hudTime.current += dt;
    if (hudTime.current >= .1) { hudTime.current = 0; onTick(makeSnapshot(game)); }
  }, -1);
  return null;
}

export default function GameCanvas(props) {
  const [autoLow, setAutoLow] = useState(false);
  const reduced = props.quality === 'low' || autoLow;
  return <CanvasBoundary><Canvas orthographic camera={{ position: [15, 5, 25], zoom: 40, near: .1, far: 150 }} dpr={reduced ? 1 : [1, 1.5]} gl={{ antialias: !reduced, alpha: false, powerPreference: 'high-performance' }} frameloop={props.paused ? 'demand' : 'always'} aria-label="Interactive 3D cyberpunk museum game">
    <Simulation {...props} onSlow={() => setAutoLow(true)} />
    <Suspense fallback={null}><Scene {...props} reducedQuality={reduced} ghostFrames={props.ghostFrames || null} /></Suspense>
  </Canvas></CanvasBoundary>;
}
