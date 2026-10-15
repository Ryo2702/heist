import { useEffect, useRef } from 'react';
import { FIXED_STEP, stepGame, makeSnapshot } from './engine.js';
import { applyReplay } from './replay.js';
import { createCoinAtlas } from './sprites.js';
import { drawScene } from './Scene.js';

export default function GameCanvas(props) {
  const canvas = useRef(null), current = useRef(props), atlas = useRef(null);
  current.current = props;
  useEffect(() => {
    const element = canvas.current, context = element.getContext('2d', { alpha: false });
    atlas.current ||= createCoinAtlas();
    let raf, last = 0, accumulator = 0, hudTime = 0, eventsSeen = 0, finished = false;
    let lastDraw, resized = true;
    let previousGame, previousMode, cameraX = null, width = 0, height = 0, slowFrames = 0, reduced = false, previousQuality;
    const resize = () => {
      width = element.clientWidth; height = element.clientHeight;
      const pixel = reduced || current.current.quality === 'low' ? 3 : 2;
      element.width = Math.ceil(width / pixel); element.height = Math.ceil(height / pixel);
      context.imageSmoothingEnabled = false; resized = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const frame = (now) => {
      const p = current.current, { game, mode, paused } = p;
      const delta = last ? Math.min((now - last) / 1000, .075) : 0; last = now;
      if (p.quality !== previousQuality) { previousQuality = p.quality; resize(); }
      if (game !== previousGame || mode !== previousMode) {
        accumulator = 0; eventsSeen = 0; finished = false; cameraX = null;
        previousGame = game; previousMode = mode;
      }
      const stopped = paused || document.hidden;
      if (!stopped) {
        if (mode === 'playing') {
          if (delta > .046 && ++slowFrames === 90) { reduced = true; resize(); }
          accumulator += delta;
          while (accumulator >= FIXED_STEP) {
            stepGame(game, p.input.current, FIXED_STEP);
            p.input.current.jumpPressed = false;
            accumulator -= FIXED_STEP;
          }
          for (let i = eventsSeen; i < game.events.length; i++) p.audio.play(game.events[i].type);
          eventsSeen = game.events.length;
        } else if (mode === 'replay' && p.replay) {
          p.replayTimeRef.current = Math.min(p.replay.time, p.replayTimeRef.current + delta * p.speed);
          applyReplay(game, p.replay, p.replayTimeRef.current);
        }
        hudTime += delta;
        if (hudTime >= .1 && mode !== 'menu') { hudTime = 0; p.onTick(makeSnapshot(game)); }
      } else accumulator = 0;
      if (!document.hidden && width && height && (!stopped || p !== lastDraw || resized)) {
        cameraX = drawScene(context, { ...p, width, height, cameraX, delta: stopped ? 0 : delta, atlas: atlas.current });
        lastDraw = p; resized = false;
      }
      if (!finished && mode === 'playing' && ['won', 'lost'].includes(game.status)) { finished = true; p.onFinish(game); }
      if (!finished && mode === 'replay' && p.replay && game.time >= p.replay.time) { finished = true; p.onReplayEnd(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);
  return <canvas ref={canvas} aria-label="SOL HEIST supermarket platformer. Move with A/D, jump with Space, slide with Down, sprint with Shift, sneak with C, interact with E." role="img" />;
}
