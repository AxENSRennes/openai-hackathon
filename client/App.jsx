import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import AgentConsole from './AgentConsole.jsx';

function Icon({ name, size = 22, ...props }) {
  const shapes = {
    cup: <><path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM16 9h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2" /></>,
    clock: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></>,
    qr: <><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM21 12v3M12 3v3M12 12h3M3 12h3M12 18v3" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    sound: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    mute: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="m16 9 6 6m0-6-6 6" /></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="4" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M14.5 8.5a4 4 0 1 0 0 7" /></>,
    crown: <path d="m3 6 5 5 4-7 4 7 5-5-2 13H5L3 6ZM5 22h14" />,
    play: <path d="m8 4 13 8-13 8V4Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    minus: <path d="M5 12h14" />,
    plus: <path d="M5 12h14M12 5v14" />,
    people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name] || shapes.cup}</svg>;
}

function Face({ runner }) {
  const [missing, setMissing] = useState(false);
  return <span className="portrait" style={{ '--runner': runner.color }} aria-hidden="true">{missing ? <span className="portrait-initial">{runner.name[0]}</span> : <img src={`/assets/portrait-${runner.id}.png`} alt="" width="192" height="192" draggable="false" onError={() => setMissing(true)} />}</span>;
}

function CupReadout({ coffee, brewing = false, held = false }) {
  const amount = Math.max(0, Math.min(100, coffee || 0));
  const top = 30 - amount * .21;
  return <span className={`cup-readout ${amount >= 85 ? 'can-deliver' : 'below-minimum'} ${brewing ? 'is-brewing' : ''} ${held ? 'is-held' : ''}`} aria-hidden="true"><svg viewBox="0 0 40 42" width="36" height="38"><path className="cup-handle" d="M29 13h4a6 6 0 0 1 0 12h-4" /><path className="cup-body" d="M6 9h24v19a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5Z" /><path className="cup-liquid" opacity={amount > 0 ? 1 : 0} d={`M8 ${top}h20V28q0 3-3 3H11q-3 0-3-3Z`} /><path className="cup-threshold" d="M4 12.15h5m19 0h5" />{brewing && <path className="cup-steam" d="M13 5V2m10 3V2" />}</svg><strong>{brewing ? 'BREW' : `${Math.round(amount)}%`}</strong></span>;
}

function clock(value) {
  const seconds = Math.max(0, Math.ceil(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function winnerId(state) { return typeof state?.winner === 'object' ? state.winner?.id : state?.winner; }
function poolShare(state, id) { return state?.betting?.total > 0 ? Math.round((state.betting.poolByRunner[id] || 0) / state.betting.total * 100) : 0; }
function coins(value) { return Number(value || 0).toLocaleString(); }
function actionLabel(agent) {
  if (!agent) return 'Ready';
  if (agent.fallen || agent.action === 'fall') return 'Fell down';
  if (agent.action === 'recover') return 'Getting up';
  if (agent.delivered) return 'Coffee served!';
  if (agent.carrying) return agent.coffee > 0 ? 'To the customer' : 'Empty mug';
  const decision = agent.decision || '';
  if (decision === 'Waiting for an agent command') return 'Waiting';
  if (/Protecting/.test(decision)) return 'Guarding brew';
  if (/brewing unattended/.test(decision)) return 'Brew unattended';
  if (/unattended opportunity/.test(decision)) return 'Taking coffee';
  if (/Recovering/.test(decision)) return 'Recovering mug';
  if (/Refilling/.test(decision)) return 'Refilling';
  if (/contest/.test(decision)) return 'Contesting';
  if (/Waiting/.test(decision)) return 'Machine busy';
  if (/Fetching/.test(decision)) return 'Fresh mug';
  const labels = { interact: 'Preparing', push: 'Contesting', run: 'Moving', carry: 'Carrying', idle: 'Choosing' };
  return labels[agent.action] || 'Moving';
}

function CoffeeViewport({ state, camera, selected, zoom, sound, onSelect, onReady, onError, onProgress, onVisible }) {
  const mount = useRef(null);
  const scene = useRef(null);
  const latest = useRef({ state, camera, selected, zoom, sound });
  const [error, setError] = useState('');
  latest.current = { state, camera, selected, zoom, sound };
  useEffect(() => {
    let cancelled = false;
    const target = mount.current;
    let lastProgress = performance.now(), complete = false;
    const progress = event => { lastProgress = performance.now(); onProgress(event.detail.percent); };
    const ready = () => { complete = true; setError(''); onReady(); };
    const select = event => { if (event.detail?.id) onSelect(event.detail.id); };
    const fail = event => {
      if (cancelled) return;
      setError(event?.detail?.message || 'The office could not load. Reload to try again.');
      onError();
    };
    target.addEventListener('scene-error', fail);
    target.addEventListener('runnerselect', select);
    target.addEventListener('scene-ready', ready);
    target.addEventListener('scene-progress', progress);
    target.addEventListener('scene-visible', onVisible);
    const watchdog = setInterval(() => {
      if (!complete && performance.now() - lastProgress > 60000) {
        complete = true;
        fail({ detail: { message: 'The office download stopped responding. Check your connection and reload to try again.' } });
      }
    }, 1000);
    import('./scene.js').then(({ CoffeeScene }) => {
      if (cancelled) return;
      const view = new CoffeeScene(target);
      scene.current = view;
      if (latest.current.state) view.update(latest.current.state);
      view.setCamera(latest.current.camera);
      view.focusRunner(latest.current.selected);
      view.setZoom(latest.current.zoom);
      view.setAudioEnabled?.(latest.current.sound);
    }).catch(cause => {
      if (cancelled) return;
      console.error('Scene initialization failed', cause);
      fail();
    });
    return () => {
      cancelled = true;
      clearInterval(watchdog);
      target.removeEventListener('scene-error', fail);
      target.removeEventListener('runnerselect', select);
      target.removeEventListener('scene-ready', ready);
      target.removeEventListener('scene-progress', progress);
      target.removeEventListener('scene-visible', onVisible);
      scene.current?.dispose();
      scene.current = null;
    };
  }, [onSelect, onReady, onError, onProgress, onVisible]);
  useEffect(() => { if (state) scene.current?.update(state); }, [state]);
  useEffect(() => { scene.current?.setCamera(camera); }, [camera]);
  useEffect(() => { scene.current?.focusRunner(selected); }, [selected]);
  useEffect(() => { scene.current?.setZoom(zoom); }, [zoom]);
  useEffect(() => { scene.current?.setAudioEnabled?.(sound); }, [sound]);
  return <div className="scene-mount" ref={mount} tabIndex={0} role="group" aria-label="Live office arena. Follow each agent and their coffee status using the controls below.">{error && <div className="scene-error" role="alert"><Icon name="cup" size={40} /><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Reload office</button></div>}</div>;
}

function Dialog({ title, children, onClose, className = '' }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const target = dialog.current;
    target.querySelector('button, a, input, textarea, select')?.focus();
    function onKey(event) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...target.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-shade" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div>{children}</section></div>;
}

function JoinCode({ url }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#233c32', light: '#ffffff' } }).then(value => { if (!cancelled) setImage(value); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [url]);
  return <div className="join-code"><p>Pick an agent. Bet your coins. Watch the office.</p><div className="qr-image">{image ? <img src={image} alt="Scan to open your Coffee Run betting slip" width="260" height="260" /> : <p role="status">{error ? 'Use the link below to join.' : 'Preparing code…'}</p>}</div><a href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, '')}<Icon name="arrow" size={18} /></a><p className="fine-print">Virtual coins only. Open this link on your phone.</p></div>;
}

function RunnerDeck({ state, selected, onSelect }) {
  return <nav className="runner-deck" aria-label="Follow an agent">{(state?.racers || []).map((runner, index) => {
    const agent = state.agents?.find(item => item.id === runner.id);
    const station = state.stations?.find(item => item.ownerId === runner.id && item.cupId);
    const stationCup = station && state.cups?.find(item => item.id === station.cupId);
    const winner = winnerId(state) === runner.id;
    const carrying = agent?.carrying || station;
    const coffee = agent?.carrying ? agent.coffee : stationCup?.coffee || 0;
    const status = state.phase === 'racing' ? actionLabel(agent) : `${poolShare(state, runner.id)}% of pool`;
    return <button key={runner.id} type="button" className={`runner-chip ${agent?.controlled ? 'is-controlled' : ''} ${selected === runner.id ? 'is-selected' : ''} ${winner ? 'is-winner' : ''} ${agent?.fallen ? 'is-fallen' : ''}`} style={{ '--runner': runner.color }} aria-pressed={selected === runner.id} onClick={() => onSelect(runner.id)} aria-label={`Follow ${runner.name}, ${status}${carrying ? `, ${Math.round(coffee)}% coffee` : ''}`} title={agent?.decision || runner.trait}><span className="runner-index">{String(index + 1).padStart(2, '0')}</span><Face runner={runner} /><span className="chip-copy"><strong>{runner.name}{winner && <Icon name="crown" size={16} />}</strong><span>{status}</span></span>{state.phase === 'racing' && carrying && <CupReadout coffee={coffee} held={agent?.carrying} brewing={station?.busy && !agent?.carrying} />}{state.phase === 'racing' && agent?.fallen && <span className="runner-incident" aria-hidden="true">!</span>}</button>;
  })}</nav>;
}

function BettingSlip({ state, player, connected, selected, onSelect, socket, onToast, onPlayer }) {
  const [stake, setStake] = useState(50);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('coffee-run-name') || '');
  const [editName, setEditName] = useState(!localStorage.getItem('coffee-run-name'));
  const operation = useRef(0);
  const round = useRef(state?.round);
  round.current = state?.round;
  const existing = player?.bet;
  const available = Number(player?.balance || 0) + Number(existing?.amount || 0);
  const runner = state?.racers?.find(item => item.id === selected);
  const winner = state?.racers?.find(item => item.id === winnerId(state));
  const canBet = connected && player && state?.phase === 'betting' && (!existing || editing) && runner && Number.isSafeInteger(stake) && stake >= 1 && stake <= available && !pending;
  useEffect(() => { setEditing(false); setPending(false); operation.current += 1; }, [state?.round, connected]);

  function submit(event) {
    event.preventDefault();
    if (!canBet) return;
    const submission = ++operation.current;
    const submittedRound = state.round;
    setPending(true);
    socket.current.timeout(5000).emit('bet', { runnerId: selected, amount: stake }, (error, result) => {
      if (submission !== operation.current || submittedRound !== round.current) return;
      setPending(false);
      if (error || !result?.ok) {
        onToast({ error: true, text: result?.error || 'No confirmation received. Check your slip before retrying.' });
        return;
      }
      if (result.player) onPlayer(result.player);
      setEditing(false);
      onToast({ text: `${stake} coins on ${runner.name}. Bet confirmed.` });
    });
  }

  function saveName() {
    const cleaned = name.trim().slice(0, 24);
    if (!cleaned || !connected) return;
    localStorage.setItem('coffee-run-name', cleaned);
    socket.current.emit('join', { playerId: player.id, name: cleaned });
    setEditName(false);
  }

  const result = player?.lastResult;
  return <div className="betting-slip"><div className="slip-summary"><span><Icon name="coin" /> Pool <strong>{coins(state?.betting?.total)}</strong></span><span><Icon name="people" size={19} /><strong>{state?.betting?.players || 0}</strong> watching</span></div><div className="slip-instruction"><h2>{state?.phase === 'betting' ? 'Who gets there first?' : state?.phase === 'results' ? winner ? `${winner.name} delivered!` : 'No coffee. No winner.' : 'The race is on.'}</h2><p>{state?.phase === 'betting' ? 'Choose one colleague before the race starts.' : state?.phase === 'results' ? 'The next betting window opens shortly.' : 'Bets are locked until the next round.'}</p></div><div className="bet-lineup" role="group" aria-label="Choose your agent">{(state?.racers || []).map(item => {
    const agent = state.agents?.find(value => value.id === item.id);
    return <button className={`bet-runner ${selected === item.id ? 'is-selected' : ''}`} style={{ '--runner': item.color }} key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => onSelect(item.id)}><Face runner={item} /><span><strong>{item.name}</strong><small>{state.phase === 'racing' ? actionLabel(agent) : item.trait}</small></span><span className="pool-percent">{poolShare(state, item.id)}<small>% pool</small></span><span className="selection-mark">{selected === item.id && <Icon name="check" size={16} />}</span></button>;
  })}{!state && <p role="status" className="slip-loading">Connecting to the office…</p>}</div><form className="bet-form" onSubmit={submit}><div className="wallet-row"><button type="button" className="text-button" onClick={() => setEditName(value => !value)}>{player?.name || 'Your wallet'} <span aria-hidden="true">↗</span></button><span><Icon name="coin" size={19} /><strong>{player ? coins(player.balance) : '…'}</strong> coins</span></div>{editName && <div className="name-editor"><label htmlFor="player-name">Your name</label><div><input id="player-name" value={name} maxLength={24} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveName(); } }} autoComplete="nickname" /><button type="button" onClick={saveName} disabled={!name.trim() || !connected || !player}>Save</button></div></div>}{existing && !editing ? <div className="confirmed-slip"><div><Icon name="check" /><span><strong>{existing.amount} coins on {state?.racers?.find(item => item.id === existing.runnerId)?.name || existing.runnerId}</strong><small>{state?.phase === 'betting' ? 'Confirmed. You can change it until bets close.' : 'Confirmed and locked.'}</small></span></div>{state?.phase === 'betting' && <button type="button" className="text-button" disabled={pending || !connected} onClick={() => { setEditing(true); setStake(existing.amount); onSelect(existing.runnerId); }}>Change bet</button>}</div> : <><fieldset disabled={state?.phase !== 'betting' || pending}><legend>Stake <span>{editing ? `${coins(available)} coins available including your current stake` : 'Virtual coins'}</span></legend><div className="stake-options">{[25, 50, 100, 250].map(amount => <button key={amount} type="button" aria-pressed={stake === amount} disabled={amount > available} className={stake === amount ? 'is-selected' : ''} onClick={() => setStake(amount)}>{amount}</button>)}</div></fieldset><button className="primary-button" type="submit" disabled={!canBet}><span>{pending ? 'Confirming bet…' : !connected ? 'Reconnecting…' : !player ? 'Opening wallet…' : state?.phase !== 'betting' ? 'Betting is closed' : stake > available ? 'Not enough coins' : `${editing ? 'Replace bet:' : 'Back'} ${runner?.name || 'an agent'} · ${stake}`}</span><Icon name="arrow" /></button>{editing && <button type="button" className="text-button cancel-bet" disabled={pending} onClick={() => setEditing(false)}>Keep current bet</button>}</>}{state?.phase === 'results' && existing && result && <p className={`payout ${result.payout > 0 ? 'paid' : ''}`} role="status">{result.refunded ? `${coins(result.payout)} coins refunded.` : result.payout > 0 ? `${coins(result.payout)} coins paid into your wallet!` : 'No payout this round.'}</p>}<p className="fine-print">No money. No purchases. Just imaginary coins.</p></form></div>;
}

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const ACTION_KEYS = { KeyE: 'interact', KeyQ: 'drop', Space: 'push' };

function useDirectControl({ socket, state, connected, suspended, onToast }) {
  const [controlledId, setControlledId] = useState(null);
  const [pending, setPending] = useState(false);
  const held = useRef(new Set());
  const actions = useRef({ interact: false, drop: false, push: false });
  const operation = useRef(0);
  const lastRound = useRef(state?.round);
  const round = useRef(state?.round);
  round.current = state?.round;
  const active = !!controlledId && connected && !suspended && state?.phase === 'racing';
  const stop = useCallback(() => {
    held.current.clear();
    actions.current = { interact: false, drop: false, push: false };
    if (socket.current?.connected) socket.current.emit('agent:input', { x: 0, z: 0, interact: false, drop: false, push: false });
  }, [socket]);

  useEffect(() => {
    if (!connected || lastRound.current !== state?.round) {
      stop();
      operation.current += 1;
      setControlledId(null);
      setPending(false);
    }
    lastRound.current = state?.round;
  }, [connected, state?.round, stop]);

  useEffect(() => {
    if (!active) { stop(); return; }
    function editable(target) { return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'); }
    function keyDown(event) {
      if (editable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const movement = MOVEMENT_KEYS.has(event.code);
      const steady = event.code === 'ShiftLeft' || event.code === 'ShiftRight';
      const action = ACTION_KEYS[event.code];
      if (!movement && !steady && !action) return;
      if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button, a')) return;
      event.preventDefault();
      if (movement || steady) held.current.add(event.code);
      else if (!event.repeat) actions.current[action] = true;
    }
    function keyUp(event) {
      if (!MOVEMENT_KEYS.has(event.code) && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
      held.current.delete(event.code);
      if (!editable(event.target)) event.preventDefault();
    }
    function visibility() { if (document.hidden) stop(); }
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(() => {
      const keys = held.current;
      const right = keys.has('KeyD') || keys.has('ArrowRight') || keys.has('touch-right');
      const left = keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('touch-left');
      const down = keys.has('KeyS') || keys.has('ArrowDown') || keys.has('touch-down');
      const up = keys.has('KeyW') || keys.has('ArrowUp') || keys.has('touch-up');
      let x = Number(right) - Number(left), z = Number(down) - Number(up);
      const length = Math.hypot(x, z);
      if (length > 1) { x /= length; z /= length; }
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) { x *= .5; z *= .5; }
      if (socket.current?.connected) socket.current.emit('agent:input', { x, z, ...actions.current });
      actions.current = { interact: false, drop: false, push: false };
    }, 50);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
      stop();
    };
  }, [active, controlledId, socket, stop]);

  useEffect(() => () => {
    stop();
    if (socket.current?.connected) socket.current.emit('agent:control', { enabled: false });
  }, [socket, stop]);

  function toggle(id) {
    if (!connected || pending || !id) return;
    stop();
    const enabled = controlledId !== id;
    const request = ++operation.current;
    const submittedRound = state?.round;
    setPending(true);
    socket.current.timeout(5000).emit('agent:control', { id, enabled }, (error, result) => {
      if (request !== operation.current || submittedRound !== round.current) return;
      setPending(false);
      if (error) {
        stop();
        setControlledId(null);
        socket.current?.emit('agent:control', { enabled: false });
        onToast({ error: true, text: 'Control was not confirmed. Returned to auto; try again.' });
        return;
      }
      if (!result?.ok) { onToast({ error: true, text: result?.error || 'Control was not confirmed. Please try again.' }); return; }
      setControlledId(result.agentId || null);
      if (result.agentId) requestAnimationFrame(() => document.querySelector('.scene-mount')?.focus({ preventScroll: true }));
    });
  }

  function direction(name, pressed) {
    if (!active) return;
    if (pressed) held.current.add(`touch-${name}`);
    else held.current.delete(`touch-${name}`);
  }
  function action(type) { if (active) actions.current[type] = true; }
  return { controlledId, pending, active, toggle, direction, action, stop };
}

function PlayControls({ state, selected, control, connected }) {
  const runner = state?.racers?.find(item => item.id === selected);
  const controlledRunner = state?.racers?.find(item => item.id === control.controlledId);
  const agent = state?.agents?.find(item => item.id === control.controlledId);
  const selectedAgent = state?.agents?.find(item => item.id === selected);
  const someoneElse = selectedAgent?.controlled && control.controlledId !== selected;
  const context = agent?.contextualAction?.label || 'Move closer';
  function touchDirection(name) {
    return {
      onPointerDown: event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); control.direction(name, true); },
      onPointerUp: () => control.direction(name, false),
      onPointerCancel: () => control.direction(name, false),
      onLostPointerCapture: () => control.direction(name, false),
      onClick: event => { if (event.detail === 0) { control.direction(name, true); setTimeout(() => control.direction(name, false), 150); } },
    };
  }
  return <section className={`play-controls ${control.controlledId ? 'is-manual' : ''}`} aria-label="Agent control"><div className="control-mode"><span>{controlledRunner ? <><i className="manual-dot" />Playing <strong>{controlledRunner.name}</strong></> : 'Select a colleague to play'}</span><button type="button" className="control-toggle" disabled={!connected || control.pending || !runner || someoneElse} onClick={() => control.toggle(selected)}>{control.pending ? 'Confirming…' : control.controlledId === selected ? 'Release control' : someoneElse ? `${runner?.name} is controlled` : `Control ${runner?.name || 'an agent'}`}</button>{controlledRunner && control.controlledId !== selected && <button type="button" className="release-control" onClick={() => control.toggle(control.controlledId)} disabled={control.pending || !connected}>Release {controlledRunner.name}</button>}</div>{controlledRunner && <><p className="keyboard-help"><span><kbd>WASD</kbd><kbd>↑↓←→</kbd> Move</span><span><kbd>Shift</kbd> Steady</span><span><kbd>E</kbd> {context}</span><span><kbd>Q</kbd> Drop</span><span><kbd>Space</kbd> Shove</span></p>{state?.phase !== 'racing' && <p className="control-wait" role="status">{state?.phase === 'betting' ? 'Ready to play when the run starts.' : 'Round finished. The next run starts automatically.'}</p>}<div className="touch-controls"><div className="touch-dpad" aria-label="Move your agent">{[['up', '↑'], ['left', '←'], ['down', '↓'], ['right', '→']].map(([name, symbol]) => <button key={name} type="button" className={`dpad-${name}`} aria-label={`Move ${name}`} disabled={!control.active} {...touchDirection(name)}>{symbol}</button>)}</div><div className="touch-actions"><button type="button" className="touch-interact" disabled={!control.active || !agent?.contextualAction} onClick={() => control.action('interact')}><Icon name="cup" size={20} />{context}</button><button type="button" disabled={!control.active || !agent?.carrying} onClick={() => control.action('drop')}>Drop</button><button type="button" disabled={!control.active} onClick={() => control.action('push')}>Shove</button></div></div></>}</section>;
}

export default function App() {
  const phone = window.location.pathname.startsWith('/join');
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [player, setPlayer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [camera, setCamera] = useState('auto');
  const [zoom, setZoom] = useState(1);
  const [sound, setSound] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [sceneVisible, setSceneVisible] = useState(false);
  const showScene = useCallback(() => setSceneVisible(true), []);
  const [sceneFailure, setSceneFailure] = useState(false);
  const [hostPending, setHostPending] = useState(false);
  const socket = useRef(null);
  const receivedPlayer = useRef(false);
  const playerId = useRef(localStorage.getItem('coffee-run-player') || window.crypto?.randomUUID?.() || `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  const closeModal = useCallback(() => setModal(null), []);
  const sceneReady = useCallback(() => { setReady(true); setSceneFailure(false); }, []);
  const sceneFailed = useCallback(() => { setReady(false); setSceneFailure(true); }, []);
  const chooseRunner = useCallback(id => setSelected(id), []);
  useEffect(() => {
    localStorage.setItem('coffee-run-player', playerId.current);
    const connection = io({ reconnection: true });
    socket.current = connection;
    function receivePlayer(value) {
      if (!value) return;
      playerId.current = value.id;
      localStorage.setItem('coffee-run-player', value.id);
      setPlayer(value);
      if (!receivedPlayer.current && value.bet?.runnerId) setSelected(value.bet.runnerId);
      receivedPlayer.current = true;
      setConnected(true);
    }
    connection.on('connect', () => {
      connection.emit('join', { playerId: playerId.current, name: localStorage.getItem('coffee-run-name') || `Guest ${playerId.current.slice(0, 4).toUpperCase()}` }, result => { if (result?.ok) receivePlayer(result.player); });
    });
    connection.on('disconnect', () => { setConnected(false); setHostPending(false); });
    connection.on('connect_error', () => setConnected(false));
    connection.on('state', value => { setState(value); setSelected(current => value.racers?.some(item => item.id === current) ? current : value.racers?.[0]?.id || null); });
    connection.on('player', receivePlayer);
    return () => { connection.disconnect(); socket.current = null; };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timer); }, [toast]);
  const control = useDirectControl({ socket, state, connected, suspended: phone || !!modal || !ready || sceneFailure, onToast: setToast });
  const phase = state?.phase;
  const winner = state?.racers?.find(item => item.id === winnerId(state));
  const countdown = phase === 'betting' && state.timeLeft <= 3;
  const joinUrl = state?.joinUrl || `${window.location.origin}/join`;
  const timerLabel = phase === 'racing' ? 'Time left' : phase === 'results' ? 'Next round' : 'Bets close';

  function startRound() {
    if (!connected || hostPending || phase !== 'betting') return;
    setHostPending(true);
    socket.current.timeout(5000).emit('host:start', (error, result) => {
      setHostPending(false);
      if (error || !result?.ok) setToast({ error: true, text: result?.error || 'The round could not start. Please try again.' });
    });
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setToast({ text: 'Fullscreen is unavailable in this browser.' });
    } catch { setToast({ error: true, text: 'The browser could not enter fullscreen.' }); }
  }

  const slip = <BettingSlip state={state} player={player} connected={connected} selected={selected} onSelect={chooseRunner} socket={socket} onToast={setToast} onPlayer={setPlayer} />;
  return <main className={phone ? 'phone-app' : 'game-app'}>{phone ? <><h1 className="sr-only">Coffee Run betting slip</h1><header className="phone-header"><a href="/" className="game-brand"><Icon name="cup" size={30} /><span>COFFEE RUN<small>THE BETTING SLIP</small></span></a><span className={`connection ${connected ? '' : 'is-offline'}`}><i />{connected ? 'Live' : 'Connecting'}</span></header><div className="phone-round"><span>ROUND {String(state?.round || 1).padStart(2, '0')}</span><strong>{timerLabel}</strong><span><Icon name="clock" size={18} />{clock(state?.timeLeft)}</span></div>{slip}<footer className="phone-footer"><Icon name="cup" size={18} /> One customer. First coffee with 85% left wins.</footer></> : <><h1 className="sr-only">Coffee Run: live autonomous office race</h1><CoffeeViewport state={state} camera={camera} selected={selected} zoom={zoom} sound={sound} onSelect={chooseRunner} onReady={sceneReady} onError={sceneFailed} onProgress={setLoadingProgress} onVisible={showScene} /><div className="game-hud"><header className="hud-top"><div className="hud-mission"><div className="game-brand"><Icon name="cup" size={30} /><span>COFFEE RUN<small>ROUND {String(state?.round || 1).padStart(2, '0')}</small></span></div><div className="mission-rule"><Icon name="cup" size={25} /><span>One customer<strong>85%+ to deliver</strong></span></div></div><div className={`round-clock ${state?.timeLeft <= 10 ? 'is-urgent' : ''}`} role="timer" aria-label={`${timerLabel}: ${clock(state?.timeLeft)}`}><Icon name="clock" size={29} /><span><small>{timerLabel}</small><strong>{clock(state?.timeLeft)}</strong></span></div><div className="hud-audience"><button type="button" className="pool-button" onClick={() => setModal('bet')} aria-label={`Betting pool: ${coins(state?.betting?.total)} virtual coins. Open betting slip.`}><Icon name="coin" /><span><strong>{coins(state?.betting?.total)}</strong><small>POOL</small></span></button><button className="join-button" type="button" onClick={() => setModal('qr')}><Icon name="qr" size={24} /><span>Join & bet<small>Scan with your phone</small></span></button></div></header>{!ready && !sceneFailure && <div className={`loading-office ${sceneVisible ? 'has-scene' : ''}`} role="status"><Icon name="cup" size={35} /><strong>{sceneVisible ? 'Finishing the office…' : 'Opening the office…'}</strong><progress aria-label="Office loading progress" value={loadingProgress} max={100} /><span>{loadingProgress}% · Loading the office</span></div>}{ready && phase === 'betting' && !countdown && <div className="round-opening"><span className="round-stamp">ROUND {String(state.round).padStart(2, '0')}</span><h2>One coffee. Seven mascots.</h2><p>First to the customer with 85% left wins.</p><button className="primary-button" type="button" onClick={startRound} disabled={!connected || hostPending}><Icon name="play" size={18} />{hostPending ? 'Starting…' : 'Start run'}<span className="button-key">or wait {Math.ceil(state.timeLeft)}s</span></button><button className="opening-bet" type="button" onClick={() => setModal('bet')}>Place a virtual bet <Icon name="arrow" size={15} /></button></div>}{ready && countdown && <div className="race-countdown" role="status" aria-label={`Race starts in ${Math.ceil(state.timeLeft)} seconds`}>{Math.max(1, Math.ceil(state.timeLeft))}<span>COFFEE, PLEASE!</span></div>}{ready && phase === 'results' && <div className="round-result" role="status" style={{ '--runner': winner?.color || '#d9ec89' }}><span className="result-badge"><Icon name={winner ? 'crown' : 'cup'} size={30} /></span><div><span className="result-kicker">{winner ? 'COFFEE DELIVERED' : 'THE CUSTOMER IS STILL WAITING'}</span><h2>{winner ? `${winner.name} wins!` : 'It’s a draw.'}</h2><p>{winner ? `${Math.round(state.agents?.find(item => item.id === winner.id)?.coffee || 85)}% coffee remaining` : 'All stakes are refunded.'}</p></div><span className="next-round">Next run<strong>{clock(state.timeLeft)}</strong></span></div>}<PlayControls state={state} selected={selected} control={control} connected={connected} /><div className="hud-bottom"><div className="broadcast-status"><span className={`connection ${connected ? '' : 'is-offline'}`}><i />{connected ? 'LIVE' : 'RECONNECTING'}</span><span title={state?.agentStatus || 'Autonomous decision controller'}>{({ responses: 'Agent · Responses API', decisions: 'Decisions API', external: 'External agent', mixed: 'Multiple agent controllers', idle: 'Waiting for agent commands' })[state?.agentMode] || 'Controller connecting'}</span><span className="arena-name">THE DAILY GRIND</span></div><RunnerDeck state={state} selected={selected} onSelect={chooseRunner} /><div className="game-controls"><button className="icon-button" type="button" onClick={() => setModal('agents')} aria-label="Agent instructions" title="Agent instructions"><Icon name="people" /></button><button className="icon-button" type="button" onClick={() => setSound(value => !value)} aria-label={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={sound} title={sound ? 'Mute sound' : 'Enable sound'}><Icon name={sound ? 'sound' : 'mute'} /></button><button type="button" className="icon-button" onClick={() => setCamera(value => value === 'track' ? 'overview' : 'track')} aria-label={camera === 'track' ? 'Show arena overview' : 'Follow selected agent'} aria-pressed={camera === 'track'} title={camera === 'track' ? 'Arena overview' : 'Follow selected agent'}><Icon name="camera" /></button><button className="icon-button" type="button" onClick={() => setModal('menu')} aria-label="Open game menu" title="Game menu"><Icon name="menu" /></button></div></div></div></>}{modal && <Dialog key={modal} title={modal === 'qr' ? 'Join the coffee run' : modal === 'bet' ? 'Back your colleague' : modal === 'agents' ? 'Agent instructions' : 'Game menu'} onClose={closeModal} className={modal === 'bet' ? 'bet-dialog' : ''}>{modal === 'qr' ? <JoinCode url={joinUrl} /> : modal === 'bet' ? slip : modal === 'agents' ? <AgentConsole key={selected} state={state} selected={selected} socket={socket} connected={connected} onToast={setToast} /> : <div className="game-menu"><fieldset><legend>Camera framing</legend><div className="camera-options">{['auto', 'overview', 'track'].map(value => <button key={value} type="button" aria-pressed={camera === value} className={camera === value ? 'is-selected' : ''} onClick={() => setCamera(value)}>{value === 'auto' ? 'Director' : value === 'overview' ? 'Overview' : 'Follow agent'}</button>)}</div><p>{camera === 'track' ? 'Choose a colleague along the bottom to follow.' : camera === 'auto' ? 'A shared overview with round opening and delivery framing.' : 'Keep the entire shared office in view.'}</p></fieldset><div className="zoom-row"><label htmlFor="camera-zoom">Zoom</label><button className="icon-button" type="button" onClick={() => setZoom(value => Math.max(.8, value - .1))} disabled={zoom <= .8} aria-label="Zoom out"><Icon name="minus" size={18} /></button><input id="camera-zoom" type="range" min="0.8" max="1.4" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} /><button className="icon-button" type="button" onClick={() => setZoom(value => Math.min(1.4, value + .1))} disabled={zoom >= 1.4} aria-label="Zoom in"><Icon name="plus" size={18} /></button></div><button className="menu-row" type="button" onClick={() => setSound(value => !value)}><Icon name={sound ? 'sound' : 'mute'} /><span>Sound</span><strong>{sound ? 'On' : 'Off'}</strong></button><button className="menu-row" type="button" onClick={fullscreen}><Icon name="expand" /><span>Toggle fullscreen</span><Icon name="arrow" size={18} /></button><button className="menu-row" type="button" onClick={() => setModal('qr')}><Icon name="qr" /><span>Join on your phone</span><Icon name="arrow" size={18} /></button><div className="menu-rules"><Icon name="cup" size={28} /><p>Seven mascots. Control one or give an agent instructions. First coffee delivered with at least 85% remaining wins.<br /><span>Unattended cups are fair game. Dropped cups can be recovered.</span></p></div></div>}</Dialog>}{toast && <div className={`toast ${toast.error ? 'is-error' : ''}`} role={toast.error ? 'alert' : 'status'}><Icon name={toast.error ? 'close' : 'check'} size={19} /><span>{toast.text}</span><button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={16} /></button></div>}</main>;
}
