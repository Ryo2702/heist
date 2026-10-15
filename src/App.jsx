import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import gsap from 'gsap';
import Icon from './components/Icon.jsx';
import Modal from './components/Modal.jsx';
import { createDemoCourse } from './blockchain/demo.js';
import { fetchWalletArtifacts, isValidAddress } from './blockchain/solana.js';
import { generateLevel, GAME_VERSION } from './game/levels.js';
import { createGame, makeSnapshot } from './game/engine.js';
import { buildChallengeUrl, getBestRun, getBestRuns, parseChallenge, saveRun } from './game/replay.js';
import { useControls, pressTouch } from './game/controls.js';
import { createAudio } from './game/audio.js';
import { groceryName, groceryKind } from './game/sprites.js';
import { connectBrowserWallet } from './blockchain/wallet.js';

const GameCanvas = lazy(() => import('./game/GameCanvas.jsx'));
const formatTime = (t = 0) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const short = (wallet) => wallet === 'DEMO' ? 'SPICE STORE' : `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

function Logo() { return <span className="logo"><span className="logo-mark"><i /><i /><i /></span>SOL<span className="logo-light">HEIST</span><sup>®</sup></span>; }
function Button({ children, icon = 'arrow', secondary = false, ...props }) { return <button className={`button ${secondary ? 'secondary' : 'primary'}`} {...props}>{children}<Icon name={icon} size={18} /></button>; }

export default function App() {
  const [course, setCourse] = useState(createDemoCourse);
  const level = useMemo(() => generateLevel({ seed: course.seed, artifacts: course.artifacts, version: GAME_VERSION }), [course]);
  const [game, setGame] = useState(() => createGame(level));
  const [screen, setScreen] = useState('menu');
  const [hud, setHud] = useState(() => makeSnapshot(game));
  const [modal, setModal] = useState(null);
  const [address, setAddress] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [ghostEnabled, setGhostEnabled] = useState(true);
  const [challenge, setChallenge] = useState(null);
  const [share, setShare] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [music, setMusic] = useState(.12);
  const [sfx, setSfx] = useState(.3);
  const [quality, setQuality] = useState('auto');
  const [toast, setToast] = useState('');
  const [tabHidden, setTabHidden] = useState(document.hidden);
  const audio = useMemo(createAudio, []);
  const request = useRef(null), replayTimeRef = useRef(0), intro = useRef(null), toastTimer = useRef(null);
  const active = screen === 'playing' || screen === 'paused';
  const pause = useCallback(() => setScreen((current) => current === 'playing' ? 'paused' : current === 'paused' ? 'playing' : current), []);
  const input = useControls(active && !modal, pause);
  const closeModal = useCallback(() => setModal(null), []);
  const notify = useCallback((message) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); }, []);

  useEffect(() => {
    try { const value = parseChallenge(window.location); if (value) { setChallenge(value); setModal('challenge'); if (value.wallet !== 'DEMO') setAddress(value.wallet); } }
    catch (err) { setError(err.message); }
    return () => { request.current?.abort(); clearTimeout(toastTimer.current); audio.dispose(); };
  }, [audio]);
  useEffect(() => {
    const visibility = () => { setTabHidden(document.hidden); if (document.hidden) setScreen((current) => current === 'playing' ? 'paused' : current); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => { audio.configure({ muted, music, sfx }); }, [audio, muted, music, sfx]);
  useEffect(() => { audio.active(screen === 'playing' && !tabHidden); }, [audio, screen, tabHidden]);
  useEffect(() => {
    if (screen === 'menu' && intro.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const animation = gsap.fromTo(intro.current.children, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .65, stagger: .08, ease: 'power2.out' });
      return () => animation.kill();
    }
  }, [screen]);

  const begin = useCallback((nextCourse, sharedGhost = null) => {
    audio.unlock(); audio.play('select');
    const nextLevel = generateLevel({ seed: nextCourse.seed, artifacts: nextCourse.artifacts, version: GAME_VERSION });
    const nextGame = createGame(nextLevel);
    setCourse(nextCourse); setGame(nextGame); setHud(makeSnapshot(nextGame));
    setGhost(sharedGhost || getBestRun(nextLevel.id));
    setScreen('playing'); setModal(null); setError(''); setResult(null); input.current = {};
  }, [audio, input]);

  async function connectWallet() {
    if (connecting) return;
    setConnecting(true); setError('');
    try {
      setAddress(await connectBrowserWallet());
      notify('Wallet address added. Ready to start your heist.');
    } catch (err) {
      setError(err.code === 4001 ? 'Connection cancelled. Try again or paste a public address.' : err.message || 'Could not connect. Unlock your wallet and try again.');
    } finally { setConnecting(false); }
  }

  async function startHeist(event, descriptor = null) {
    event?.preventDefault();
    const wallet = (descriptor?.wallet || address).trim();
    if (!wallet || descriptor?.wallet === 'DEMO') { begin(createDemoCourse(), descriptor?.ghost); return; }
    if (!isValidAddress(wallet)) { setError('Enter a valid public Solana address (32-byte Base58).'); return; }
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setError(''); setModal(null); setScreen('loading'); setProgress(0);
    try {
      const data = await fetchWalletArtifacts(wallet, {
        signal: controller.signal, signatures: descriptor?.signatures,
        onProgress: (value) => setProgress(typeof value === 'number' ? value : value.completed / Math.max(1, value.total)),
      });
      if (controller.signal.aborted) return;
      begin(data, descriptor?.ghost);
      if (data.warnings.length) notify(`${data.warnings.length} transaction detail notice(s). Open the artifact archive to inspect.`);
    } catch (err) {
      if (!controller.signal.aborted) { setError(err.message || 'The public RPC is unavailable. Please try again shortly.'); setScreen('menu'); }
    }
  }

  function home() { request.current?.abort(); setScreen('menu'); setModal(null); input.current = {}; }
  function startReplay(run = result) {
    if (!run?.frames?.length) return;
    const replayGame = createGame(game.level);
    replayGame.status = 'playing'; replayTimeRef.current = 0;
    setGame(replayGame); setSpeed(1); setScreen('replay'); setModal(null);
  }
  function finish(finishedGame) {
    const run = {
      time: finishedGame.time, score: finishedGame.score, frames: finishedGame.recording,
      events: finishedGame.events, wallet: course.wallet, seed: course.seed,
      artifacts: finishedGame.level.artifacts.filter((artifact) => finishedGame.collected.has(artifact.id)),
      damageTaken: finishedGame.damageTaken, alerts: finishedGame.alerts,
      won: finishedGame.status === 'won', date: Date.now(),
    };
    if (run.won) {
      const record = saveRun(finishedGame.level.id, run);
      Object.assign(run, { isBest: record.isBest, previousBest: record.previousBest?.time ?? null, saved: record.saved });
      if (!record.saved) notify('Run complete. Browser storage is unavailable; this record will not persist.');
    }
    setResult(run); setHud(makeSnapshot(finishedGame));
    if (run.won) startReplay(run); else setScreen('lost');
  }
  async function challengeFriend() {
    const link = buildChallengeUrl(course, result?.won ? { frames: result.frames, time: result.time } : {});
    setShare(link); setModal('share');
    try { await navigator.clipboard.writeText(link.url); notify('Challenge link copied. Your course is ready to race.'); } catch { /* The share dialog provides a selectable URL. */ }
  }

  const sceneMode = screen === 'replay' ? 'replay' : screen === 'menu' || screen === 'loading' ? 'menu' : 'playing';
  const scenePaused = tabHidden || ['paused', 'lost', 'complete'].includes(screen) || !!modal;
  const menu = screen === 'menu' || screen === 'loading';
  const archive = result?.artifacts || game.level.artifacts.filter((a) => game.collected.has(a.id));

  return <div className={`app screen-${screen}`}>
    <header className="site-header">
      <button className="brand-button" onClick={home} aria-label="SOL HEIST home"><Logo /></button>
      <nav aria-label="Main navigation"><button className={menu ? 'selected' : ''} onClick={home}>THE HEIST</button><button onClick={() => { if (screen === 'playing') setScreen('paused'); setModal('help'); }}>HOW TO PLAY <span>↗</span></button><button onClick={() => { if (screen === 'playing') setScreen('paused'); setModal('records'); }}>BEST RUNS <span>↗</span></button></nav>
      <div className="header-tools"><span className="network-status"><i />SOLANA NETWORK</span><button className="icon-button sound-toggle" aria-label={muted ? 'Unmute sound' : 'Mute sound'} onClick={() => { audio.unlock(); setMuted(!muted); }}><Icon name={muted ? 'muted' : 'sound'} size={18} /></button></div>
    </header>

    <main>
      <section className={`experience ${menu ? 'is-menu' : 'is-game'}`} aria-label="SOL HEIST arcade">
        <div className="world-canvas"><Suspense fallback={<div className="scene-loading"><span />STOCKING THE SHELVES</div>}><GameCanvas game={game} mode={sceneMode} paused={scenePaused} input={input} onTick={setHud} onFinish={finish} audio={audio} replay={result} replayTimeRef={replayTimeRef} speed={speed} onReplayEnd={() => setScreen('complete')} quality={quality} ghostFrames={ghostEnabled && !menu && screen !== 'replay' ? ghost?.frames : null} /></Suspense></div>
        {menu && <div className="menu-shade" />}
        <AnimatePresence mode="wait">
          {screen === 'menu' && <motion.div className="home-content" key="home" exit={{ opacity: 0, y: -8 }}>
            <div className="hero-copy" ref={intro}>
              <div className="eyebrow hero-eyebrow"><span className="status-dot" /> THE GREAT SUPERMARKET ROBBERY <span className="version">AISLE 01</span></div>
              <h1>SMALL COIN.<br /><span>BIG HEIST.</span></h1>
              <p className="hero-description">One coin. A serious spice obsession.<br />Steal the onions. Grab the garlic. Feed the craving.</p>
              <form className="wallet-form" onSubmit={startHeist}>
                <label htmlFor="wallet">SOLANA WALLET ADDRESS <span>OPTIONAL</span></label>
                <div className={`wallet-input ${error ? 'has-error' : ''}`}><Icon name="eye" size={18} /><input id="wallet" autoComplete="off" spellCheck="false" placeholder="Leave empty to play instantly" value={address} onChange={(e) => { setAddress(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? 'wallet-error' : 'wallet-privacy'} maxLength={44} /><span className="input-corner">⌁</span></div>
                {error && <p className="error-message" role="alert" id="wallet-error">{error}</p>}
                <div className="wallet-connect"><button type="button" onClick={connectWallet} disabled={connecting}><Icon name="link" size={13} />{connecting ? 'CONNECTING…' : 'CONNECT BROWSER WALLET'}</button><a href="https://phantom.com/download" target="_blank" rel="noopener noreferrer">GET EXTENSION ↗</a></div>
                <div className="launch-actions"><Button type="submit" icon="play">START</Button></div>
                <p className="privacy-note" id="wallet-privacy"><Icon name="shield" size={13} />No wallet needed to play. No signatures or transactions.</p>
              </form>
            </div>
            <div className="scene-label"><span className="scene-cross">+</span><span>SOL SUPERMARKET<span>FARM FRESH. THIEF APPROVED.</span></span></div>
            <div className="scene-coordinate"><span className="status-dot" /> OPEN FOR MISCHIEF <span>35.6895° N · 139.6917° E</span></div>
            <div className="mission-stamp"><span className="stamp-line" /><span>GET IN.<br />GET THE SPICES.<br /><em>GET OUT.</em></span><Icon name="arrow" size={27} /></div>
            <div className="hero-bottom"><span>ONIONS. GARLIC. NO SELF-CONTROL.</span><span><i /> NO KEYS REQUIRED</span></div>
          </motion.div>}

          {screen === 'loading' && <motion.div key="loading" className="center-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="loading-card"><div className="scanner"><Icon name="diamond" size={46} /></div><span className="eyebrow">PUBLIC LEDGER → SPICE STASH</span><h2>Planning your heist.</h2><p>Reading confirmed transactions and assembling your course.</p><div className="loading-track"><i style={{ width: `${Math.min(100, Math.max(6, progress <= 1 ? progress * 100 : progress))}%` }} /></div><div className="mono muted">{short(address.trim())} / READ-ONLY MAINNET</div><Button secondary icon="close" onClick={home}>CANCEL</Button></div></motion.div>}

          {(screen === 'playing' || screen === 'paused') && <motion.div key="hud" className="game-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="game-hud"><div className="hud-identity"><b className="hud-brand">SOL HEIST</b><span className="eyebrow"><i className="status-dot" />{course.source === 'demo' ? 'CLASSIC RUN / SAMPLE DATA' : 'PUBLIC LEDGER / LIVE DATA'}</span><strong>{hud.zone || 'Fresh Produce'}</strong><span className="mono muted">{short(course.wallet)}</span></div><div className="hud-stats"><div><span>HEALTH {hud.health}/5</span><div className="health" aria-label={`${hud.health} health remaining`}>{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < hud.health ? 'full' : ''} />)}</div></div><div><span>LOOT</span><strong>{String(hud.collected).padStart(2, '0')}<small> / {hud.totalArtifacts}</small></strong></div><div className="score-stat"><span>SCORE</span><strong>{hud.score.toLocaleString()}</strong></div><div><span>TIME</span><strong>{formatTime(hud.time)}</strong></div><button className="icon-button" aria-label="Pause game" onClick={pause}><Icon name="pause" /></button></div></div>
            <div className={`alarm-bar ${hud.alarm >= 75 ? 'danger' : ''}`}><span>ALARM</span><div><i style={{ width: `${hud.alarm}%` }} /></div><strong>{Math.round(hud.alarm)}%</strong>{hud.escapeRemaining != null && <b>ESCAPE IN {Math.ceil(hud.escapeRemaining)}s</b>}</div>
            <div className="zone-progress">{game.level.zones.map((zone, index) => <span key={zone.name} className={index <= hud.zoneIndex ? 'visited' : ''}><i /><small>{zone.name}</small></span>)}</div>
            {ghost && <div className="ghost-label"><span className="ghost-dot" />{challenge?.ghost ? 'FRIEND' : 'PERSONAL BEST'} {formatTime(ghost.time)}</div>}
            {hud.prompt && <div className="interaction-prompt"><kbd>E</kbd><span>{hud.prompt}</span>{hud.terminalProgress > 0 && <progress value={hud.terminalProgress} max={1} />}</div>}
            <div className="desktop-controls"><span><kbd>A</kbd><kbd>D</kbd> MOVE</span><span><kbd>SPACE</kbd> JUMP</span><span><kbd>↓</kbd> SLIDE</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>C</kbd> SNEAK</span><span><kbd>E</kbd> INTERACT</span></div>
            <div className="touch-controls"><div>{[['left', '←'], ['right', '→']].map(([action, label]) => <TouchButton key={action} {...{ action, label, input }} />)}</div><div>{[['sneak', 'C'], ['sprint', '»'], ['slide', '↓'], ['interact', 'E'], ['jump', '↑']].map(([action, label]) => <TouchButton key={action} {...{ action, label, input }} />)}</div></div>
            {hud.status === 'countdown' && <div className="countdown"><span className="eyebrow">{ghost ? 'RACE YOUR GHOST' : 'GET READY, THIEF'}</span><b key={Math.ceil(hud.countdown)}>{Math.ceil(hud.countdown) || 'GO'}</b><p>Collect 3 groceries. Unlock checkout. Escape!</p></div>}
            <div className="portrait-hint"><Icon name="fullscreen" size={18} />Rotate for a wider view</div>
          </motion.div>}

          {screen === 'replay' && <motion.div className="replay-overlay" key="replay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="replay-top"><span className="eyebrow"><span className="record-dot" /> SOL SUPERMARKET / RECORDED CCTV</span><h2>CLEANUP ON AISLE YOU.</h2><span>{formatTime(replayTimeRef.current)} / {formatTime(result?.time)}</span></div><div className="replay-bottom"><div className="replay-track"><i style={{ width: `${replayTimeRef.current / (result?.time || 1) * 100}%` }} /></div><div><span className="mono">HEIST COMPLETE · {result?.score.toLocaleString()} PTS</span><label>REPLAY SPEED<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={.5}>0.5×</option><option value={1}>1× recorded</option><option value={2}>2×</option></select></label><Button secondary onClick={() => setScreen('complete')}>SKIP REPLAY</Button></div></div></motion.div>}

          {(screen === 'complete' || screen === 'lost') && result && <motion.div className="center-screen result-screen" key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><section className="result-card"><div className={`result-icon ${result.won ? '' : 'failed'}`}><Icon name={result.won ? 'trophy' : 'eye'} size={30} /></div><span className="eyebrow">{result.won ? result.isBest ? 'A NEW PERSONAL RECORD' : 'EXTRACTION SUCCESSFUL' : 'SECURITY HAS YOUR NUMBER'}</span><h2>{result.won ? 'HEIST COMPLETE.' : 'BUSTED.'}</h2><p>{result.won ? 'Onions secured. Garlic stashed. Craving satisfied. For now.' : 'Every great thief needs a second attempt.'}</p><div className="result-stats"><div><span>FINAL SCORE</span><strong>{result.score.toLocaleString()}</strong></div><div><span>TIME</span><strong>{formatTime(result.time)}</strong></div><div><span>LOOT</span><strong>{result.artifacts.length}<small> / {course.artifacts.length}</small></strong></div></div><div className="result-details"><span>DAMAGE TAKEN <b>{result.damageTaken}</b></span><span>ALERTS TRIGGERED <b>{result.alerts}</b></span><span>WALLET <b>{short(course.wallet)}</b></span>{result.previousBest != null && <span>PREVIOUS BEST <b>{formatTime(result.previousBest)}</b></span>}{ghost && <span>GHOST COMPARISON <b>{result.time < ghost.time ? '−' : '+'}{Math.abs(result.time - ghost.time).toFixed(2)}s</b></span>}</div><div className="result-actions"><Button icon="refresh" onClick={() => begin(course)}>RETRY HEIST</Button>{result.won && <Button secondary icon="play" onClick={() => startReplay()}>PLAY REPLAY</Button>}</div><div className="text-actions"><button onClick={() => setModal('artifacts')}>VIEW SPICE STASH <Icon name="diamond" size={14} /></button><button onClick={challengeFriend}>CHALLENGE A FRIEND <Icon name="link" size={14} /></button><button onClick={home}>MAIN MENU</button></div><span className="result-disclaimer">FICTIONAL GAME POINTS. {course.source === 'demo' ? 'SAMPLE TRANSACTION DATA.' : 'VERIFIED PUBLIC TRANSACTION METADATA.'}</span></section></motion.div>}
        </AnimatePresence>
        {screen === 'paused' && <div className="center-screen pause-screen"><section className="pause-card"><span className="eyebrow">TAKE A BREATH. THE SPICES CAN WAIT.</span><h2>HEIST ON HOLD.</h2><Button icon="play" onClick={pause}>RESUME HEIST</Button><Button secondary icon="refresh" onClick={() => begin(course)}>RESTART RUN</Button><div className="pause-links"><button onClick={() => setModal('settings')}>SETTINGS</button><button onClick={() => setModal('artifacts')}>LOOT</button><button onClick={home}>MAIN MENU</button></div></section></div>}
      </section>

      {menu && <><section className="intel-strip" aria-label="How SOL HEIST works"><div className="intel-intro"><span className="eyebrow">THE BRIEFING</span><h2>Your wallet. Your world.<br />Everything to steal.</h2></div><Brief number="01" icon="eye" title="A wallet becomes a world." text="Public transaction history. A one-of-a-kind supermarket. Your next target." /><Brief number="02" icon="diamond" title="Make a clean getaway." text="Dodge rolling carts. Outsmart security. Grab onions and garlic before closing time." /><Brief number="03" icon="bolt" title="Leave a ghost behind." text="Replay your escape. Beat your best. Share the course and challenge a friend." /></section><footer className="site-footer"><span>© 2026 SOL HEIST <span className="footer-divider">/</span> BUILT FOR THE GETAWAY.</span><span>FICTIONAL LOOT. REAL ONCHAIN HISTORY.<i /><button onClick={() => setModal('settings')}>SETTINGS <Icon name="chevron" size={12} /></button></span></footer></>}
    </main>

    <AnimatePresence>{modal && <Modal title={{ help: 'A little intel goes a long way.', records: 'The getaway archive.', artifacts: 'Your spice stash.', settings: 'Tune your heist.', share: 'Same store. New coin.', challenge: 'You have a target.' }[modal]} eyebrow={{ help: 'FIELD MANUAL / 001', records: 'BEST RUNS / THIS DEVICE ONLY', artifacts: 'ONIONS & GARLIC', settings: 'SYSTEM PREFERENCES', share: 'RACE CHALLENGE', challenge: 'INCOMING CHALLENGE' }[modal]} onClose={closeModal} wide={modal === 'artifacts'}>
      {modal === 'help' && <><p className="modal-description">Sneak through five supermarket sections, collect at least three onions or garlic bulbs, hold <kbd>E</kbd> at checkout, then make it to the exit. Your coin craves spices. Your loot is fictional. Your getaway is all skill.</p><div className="controls-grid">{[['A / D or ← / →', 'Move'], ['SPACE / W / ↑', 'Jump · hold to go higher'], ['SHIFT', 'Sprint'], ['C', 'Sneak'], ['S / ↓', 'Slide under low shelves'], ['E (hold)', 'Disable CCTV, push carts, or unlock checkout'], ['ESC', 'Pause / resume']].map(([key, action]) => <div key={key}><kbd>{key}</kbd><span>{action}</span></div>)}</div><div className="tip-box"><Icon name="info" /><p>Use store terminals to pause security. Green floor markers save your position. Stock spills warn before dropping. Frozen floors are slippery. Hold C to sneak past guards. At 100% alarm, guards speed up and you have 45 seconds to escape.</p></div><p className="fine-print">Touch controls appear on mobile. Landscape gives you the best view. Your fastest successful runs and ghosts are saved only in this browser.</p><Button onClick={closeModal}>GOT IT</Button></>}
      {modal === 'records' && <Records />}
      {modal === 'artifacts' && <ArtifactArchive artifacts={archive} source={course.source} warnings={course.warnings} />}
      {modal === 'settings' && <div className="settings"><label>Master sound<button className={`toggle ${muted ? '' : 'on'}`} onClick={() => { audio.unlock(); setMuted(!muted); }} aria-pressed={!muted}>{muted ? 'OFF' : 'ON'}</button></label><label htmlFor="music-volume">Music volume<input id="music-volume" type="range" min="0" max="1" step=".01" value={music} onChange={(e) => setMusic(Number(e.target.value))} /></label><label htmlFor="sfx-volume">Effects volume<input id="sfx-volume" type="range" min="0" max="1" step=".01" value={sfx} onChange={(e) => setSfx(Number(e.target.value))} /></label><label htmlFor="quality">Graphics<select id="quality" value={quality} onChange={(e) => setQuality(e.target.value)}><option value="auto">Automatic</option><option value="low">Reduced effects</option></select></label><label>Personal ghost<button className={`toggle ${ghostEnabled ? 'on' : ''}`} aria-pressed={ghostEnabled} onClick={() => setGhostEnabled(!ghostEnabled)}>{ghostEnabled ? 'ON' : 'OFF'}</button></label><p className="fine-print">Automatic quality lowers resolution when frame times rise. Course geometry and movement stay identical on every device.</p></div>}
      {modal === 'share' && share && <><p className="modal-description">Send this link to race the exact same course. {share.includesGhost ? 'Your recorded ghost is included.' : 'The course is included; the replay is too large for a safe URL.'}</p><label className="eyebrow" htmlFor="challenge-url">YOUR CHALLENGE LINK</label><input className="share-input" id="challenge-url" readOnly value={share.url} onFocus={(e) => e.target.select()} /><Button icon="link" onClick={async () => { try { await navigator.clipboard.writeText(share.url); notify('Challenge link copied.'); } catch { document.getElementById('challenge-url').select(); notify('Select and copy the challenge link.'); } }}>COPY CHALLENGE</Button><p className="fine-print">No live multiplayer or online leaderboard. Live courses require access to the same public transaction details.</p></>}
      {modal === 'challenge' && challenge && <><p className="modal-description">A deterministic supermarket is waiting for you. {challenge.ghost ? 'Follow the ghost and beat its time.' : 'Set your own time and send the challenge back.'}</p><div className="challenge-details"><span>TARGET WALLET</span><strong>{short(challenge.wallet)}</strong>{challenge.ghost && <><span>TIME TO BEAT</span><strong>{formatTime(challenge.ghost.time)}</strong></>}</div><Button icon="play" onClick={() => startHeist(null, challenge)}>ACCEPT CHALLENGE</Button><p className="fine-print">{challenge.wallet === 'DEMO' ? 'Built-in course with fictional sample collectibles. No wallet needed.' : 'Pinned public transactions. No wallet connection required.'}</p></>}
    </Modal>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div role="status" className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Icon name="info" size={17} />{toast}</motion.div>}</AnimatePresence>
  </div>;
}

function Brief({ number, icon, title, text }) { return <article className="brief"><div><span>{number} /</span><Icon name={icon} size={22} /></div><h3>{title}</h3><p>{text}</p></article>; }
function TouchButton({ input, action, label }) { return <button aria-label={action} className={`touch-${action}`} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pressTouch(input, action, true); }} onPointerUp={() => pressTouch(input, action, false)} onPointerCancel={() => pressTouch(input, action, false)} onLostPointerCapture={() => pressTouch(input, action, false)}>{label}</button>; }
function Records() {
  const runs = getBestRuns();
  return runs.length ? <><p className="modal-description">Your best escape on each course. Saved locally on this device.</p><div className="record-list">{runs.map((run, index) => <div key={run.courseId}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{short(run.wallet)}</strong><small>{new Date(run.date).toLocaleDateString()} · {run.score.toLocaleString()} PTS</small></div><b>{formatTime(run.time)}</b></div>)}</div></> : <div className="empty-state"><Icon name="trophy" size={40} /><h3>Your first heist is waiting.</h3><p>Escape the supermarket to save your time and unlock a personal ghost. Records stay on this device.</p></div>;
}
function ArtifactArchive({ artifacts, source, warnings = [] }) {
  return <><p className="modal-description">{source === 'demo' ? 'CLASSIC RUN · All information below is fictional sample data, created for the game.' : 'Verified public transaction metadata. These collectibles are fictional representations, not assets you own.'}</p>{warnings.length > 0 && <details className="data-notices"><summary>{warnings.length} RPC data notice(s)</summary>{warnings.map((warning, i) => <p key={i}>{typeof warning === 'string' ? warning : warning.message}</p>)}</details>}{artifacts.length ? <div className="artifact-grid">{artifacts.map((artifact) => <article className={`artifact-card type-${artifact.type}`} key={artifact.id}><div className="artifact-icon"><Icon name={groceryKind(artifact)} size={30} /><span>{artifact.sample ? 'SAMPLE' : 'PUBLIC DATA'}</span></div><h3>{groceryName(artifact)}</h3><dl><div><dt>STATUS</dt><dd>{artifact.status || 'unknown'}</dd></div><div><dt>SLOT</dt><dd>{artifact.slot ?? 'Unavailable'}</dd></div><div><dt>FEE</dt><dd>{artifact.feeLamports != null ? `${artifact.feeLamports.toLocaleString()} lamports` : 'Unavailable'}</dd></div><div><dt>TIME</dt><dd>{artifact.timestamp ? new Date(artifact.timestamp * 1000).toLocaleString() : 'Unavailable'}</dd></div>{artifact.solChange != null && <div><dt>NET SOL CHANGE</dt><dd>{artifact.solChange > 0 ? '+' : ''}{artifact.solChange}</dd></div>}</dl>{artifact.tokenChanges?.map((token, i) => <p className="fine-print token-change" key={i}>Token {token.mint}: {token.delta ?? token.amount ?? token.rawDelta} base units (decimals: {token.decimals})</p>)}{artifact.programs?.length > 0 && <p className="fine-print token-change">Programs: {artifact.programs.map((program) => typeof program === 'string' ? program : program.name || program.id).join(', ')}</p>}{artifact.rule && <p className="artifact-rule">{artifact.rule}</p>}{artifact.description && <p className="fine-print">{artifact.description}</p>}<div className="signature">{artifact.signature}</div>{!artifact.sample && <a href={`https://explorer.solana.com/tx/${encodeURIComponent(artifact.signature)}`} target="_blank" rel="noreferrer">VERIFY ON SOLANA EXPLORER ↗</a>}</article>)}</div> : <div className="empty-state"><Icon name="diamond" size={40} /><h3>The bag is empty. For now.</h3><p>Walk through onions and garlic to collect them, then inspect their transaction details here.</p></div>}</>;
}
