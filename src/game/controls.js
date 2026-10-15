import { useEffect, useRef } from 'react';

const bindings = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyC: 'sneak', KeyS: 'slide', ArrowDown: 'slide', KeyE: 'interact',
};

export function useControls(active, onPause) {
  const input = useRef({});
  const pauseRef = useRef(onPause);
  pauseRef.current = onPause;
  useEffect(() => {
    const held = new Set();
    const clear = () => { held.clear(); input.current = {}; };
    const down = (event) => {
      if (!active || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); pauseRef.current(); return; }
      const action = bindings[event.code];
      if (!action) return;
      event.preventDefault();
      held.add(event.code);
      if (action === 'jump' && !input.current.jump) input.current.jumpPressed = true;
      input.current[action] = true;
    };
    const up = (event) => {
      held.delete(event.code);
      const action = bindings[event.code];
      if (action) input.current[action] = [...held].some((key) => bindings[key] === action);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      clear();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [active]);
  return input;
}

export function pressTouch(input, action, pressed) {
  if (pressed && action === 'jump' && !input.current.jump) input.current.jumpPressed = true;
  input.current[action] = pressed;
}
