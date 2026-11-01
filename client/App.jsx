import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';

function Icon({ name, size = 20, ...props }) {
  const paths = {
    cup: <><path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" /><path d="M16 9h2a3 3 0 1 1 0 6h-2M7 2v3m4-3v3m4-3v3" /></>,
    arrow: <path d="m5 12 14 0m-6-6 6 6-6 6" />,
    qr: <><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM21 12v3M12 3v3M12 12h3M3 12h3M12 18v3" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    volume: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    muted: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="m16 9 6 6m0-6-6 6" /></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="4" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M14.5 8.5a4 4 0 1 0 0 7" /></>,
    crown: <><path d="m3 6 5 5 4-7 4 7 5-5-2 13H5L3 6ZM5 22h14" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></>,
    play: <path d="m8 4 13 8-13 8V4Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.cup}</svg>;
}

function RunnerFace({ runner, small = false }) {
  return <span className={`runner-face ${small ? 'small' : ''} runner-${runner.id}`} style={{ '--runner-color': runner.color }} aria-hidden="true"><span className="face-hair" /><span className="face-eyes"><i /><i /></span><span className="face-mouth" /></span>;
}

function formattedTime(time) {
  const value = Math.max(0, Math.ceil(Number(time) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function phaseText(phase) {
  return phase === 'racing' ? 'Coffee run in progress' : phase === 'results' ? 'The coffee has landed' : 'Place your bets';
}

function CoffeeViewport({ state, camera, selected, onSelect }) {
  const mount = useRef(null);
  const scene = useRef(null);
  const latest = useRef({ state, camera, selected });
  latest.current = { state, camera, selected };
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    import('./scene.js').then(({ CoffeeScene }) => {
      if (cancelled) return;
      scene.current = new CoffeeScene(mount.current);
      if (latest.current.state) scene.current.update(latest.current.state);
      scene.current.setCamera(latest.current.camera);
      scene.current.focusRunner?.(latest.current.selected);
    }).catch(cause => {
      if (cancelled) return;
      console.error(cause);
      setError('The 3D scene could not start. Please enable WebGL and reload.');
    });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { if (state) scene.current?.update(state); }, [state]);
  useEffect(() => { scene.current?.setCamera(camera); }, [camera]);
  useEffect(() => { scene.current?.focusRunner?.(selected); }, [selected]);
  useEffect(() => {
    const target = mount.current;
    const selectRunner = event => { if (event.detail?.id) onSelect(event.detail.id); };
    target.addEventListener('runnerselect', selectRunner);
    return () => target.removeEventListener('runnerselect', selectRunner);
  }, [onSelect]);
  return <div className="scene-mount" ref={mount} role="img" aria-label="Live three-dimensional coffee race in a shared office">{error && <div className="scene-error"><Icon name="cup" size={34} /><p>{error}</p><button type="button" onClick={() => location.reload()}>Reload game</button></div>}</div>;
}

function QRModal({ url, onClose }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const closeRef = useRef(null);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#1e2924', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then(setImage).catch(() => setError('Could not generate the QR code. Use the link below.'));
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = [...document.querySelectorAll('.qr-dialog button, .qr-dialog a')];
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [url, onClose]);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="qr-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-title"><button className="icon-button modal-close" type="button" onClick={onClose} ref={closeRef} aria-label="Close join code"><Icon name="close" /></button><span className="eyebrow">Your phone is your betting slip</span><h2 id="qr-title">Back your<br />bad decision.</h2><div className="qr-image">{image ? <img src={image} width="240" height="240" alt={`QR code to join Coffee Run at ${url}`} /> : <p>{error || 'Preparing your code…'}</p>}</div><p>Scan. Pick an agent. Hope for the best.</p><a className="join-url" href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, '')}<Icon name="arrow" size={17} /></a><small>Phone and host need to be on the same network.</small></section></div>;
}

function Lineup({ state, selected, onSelect }) {
  const racers = state?.racers || [];
  const pool = state?.betting?.poolByRunner || {};
  const total = state?.betting?.total || 0;
  return <div className="runner-list" aria-label="Choose your runner">{racers.map((runner, index) => {
    const amount = Number(pool[runner.id]) || 0;
    const percent = total > 0 ? Math.round(amount / total * 100) : 0;
    const agent = state.agents?.find(item => item.id === runner.id);
    const coffee = Math.max(0, Math.min(100, agent?.coffee || 0));
    const chosen = selected === runner.id;
    const winner = state.winner === runner.id;
    return <button className={`runner-row ${chosen ? 'selected' : ''} ${winner ? 'winner' : ''}`} type="button" key={runner.id} onClick={() => onSelect(runner.id)} aria-pressed={chosen} style={{ '--runner-color': runner.color }}>
      <span className="runner-number">{String(index + 1).padStart(2, '0')}</span><RunnerFace runner={runner} /><span className="runner-info"><span className="runner-name">{runner.name}{winner && <Icon name="crown" size={16} />}</span>{state.phase === 'racing' ? <><span className="coffee-status"><strong className={coffee >= 55 ? 'ready' : ''}>{Math.round(coffee)}%</strong><span>{agent?.fallen ? 'On the floor' : agent?.state || 'On the move'}</span></span><span className="coffee-gauge" aria-label={`${Math.round(coffee)} percent coffee remaining; 55 percent required to deliver`}><span style={{ width: `${coffee}%` }} /></span></> : <span className="runner-trait">{runner.trait || runner.tagline || 'Office professional'}</span>}</span><span className="runner-share"><strong>{percent}<span>%</span></strong><small>OF POOL</small></span><span className="runner-check">{chosen && <Icon name="check" size={12} />}</span>
    </button>;
  })}{racers.length === 0 && <div className="lineup-loading"><span className="loading-dot" /> Calling the agents to the office…</div>}</div>;
}

export default function App() {
  const mobileJoin = window.location.pathname.startsWith('/join');
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [player, setPlayer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [stake, setStake] = useState(50);
  const [toast, setToast] = useState(null);
  const [pending, setPending] = useState(false);
  const [editingBet, setEditingBet] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [camera, setCamera] = useState('overview');
  const [sound, setSound] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('coffee-run-name') || '');
  const [editingName, setEditingName] = useState(mobileJoin && !localStorage.getItem('coffee-run-name'));
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const soundRef = useRef(false);
  const eventRef = useRef(null);
  const playerId = useRef(localStorage.getItem('coffee-run-player') || window.crypto?.randomUUID?.() || `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const joinUrl = state?.joinUrl || `${window.location.origin}/join`;
  const closeQR = React.useCallback(() => setShowQR(false), []);

  function playTone(type) {
    if (!soundRef.current || !audioRef.current) return;
    const context = audioRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    const frequency = type === 'win' || type === 'delivery' ? 740 : type === 'spill' || type === 'fall' ? 180 : 420;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * (type === 'fall' ? .45 : 1.4), context.currentTime + .12);
    gain.gain.setValueAtTime(.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .2);
  }

  useEffect(() => {
    localStorage.setItem('coffee-run-player', playerId.current);
    const socket = io({ reconnection: true });
    socketRef.current = socket;
    const identify = () => {
      setConnected(true);
      socket.emit('join', { playerId: playerId.current, name: localStorage.getItem('coffee-run-name') || `Guest ${playerId.current.slice(0, 4).toUpperCase()}` });
    };
    socket.on('connect', identify);
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('state', snapshot => {
      setState(snapshot);
      setSelected(current => current || snapshot.racers?.[0]?.id || null);
      const latest = snapshot.events?.[0];
      if (latest && latest.id !== eventRef.current) {
        if (eventRef.current) playTone(latest.type);
        eventRef.current = latest.id;
      }
    });
    socket.on('player', setPlayer);
    return () => { socket.disconnect(); audioRef.current?.close(); };
  }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { setEditingBet(false); }, [state?.round]);

  const currentRunner = state?.racers?.find(runner => runner.id === selected);
  const winner = state?.racers?.find(runner => runner.id === state?.winner);
  const existingBet = player?.bet;
  const availableBalance = (player?.balance || 0) + (existingBet?.amount || 0);
  const canBet = connected && state?.phase === 'betting' && (!existingBet || editingBet) && !!currentRunner && stake <= availableBalance && !pending;
  const events = (state?.events || []).slice(0, 4);
  const betResultText = player?.lastResult?.refunded
    ? `${player.lastResult.payout} coins returned. Your stake was refunded.`
    : player?.lastResult?.payout > 0
      ? `${player.lastResult.payout} coins paid out. Your wallet has been updated.`
      : 'There is always the next coffee run.';

  function submitBet(event) {
    event.preventDefault();
    if (!canBet) return;
    setPending(true);
    setEditingBet(false);
    socketRef.current.timeout(5000).emit('bet', { runnerId: selected, amount: stake }, (error, result) => {
      setPending(false);
      if (error || !result?.ok) setToast({ error: true, text: result?.error || 'The bet did not go through. Please try again.' });
      else setToast({ text: `${stake} coins on ${currentRunner.name}. Bold choice.` });
    });
  }

  function updateName(event) {
    event.preventDefault();
    const cleaned = name.trim().slice(0, 20);
    if (!cleaned) return;
    localStorage.setItem('coffee-run-name', cleaned);
    setName(cleaned);
    socketRef.current?.emit('join', { playerId: playerId.current, name: cleaned });
    setEditingName(false);
  }

  function hostAction(action) {
    socketRef.current?.timeout(5000).emit(action, (error, result) => {
      if (error || result?.ok === false) setToast({ error: true, text: result?.error || 'Could not start the round. Please try again.' });
    });
  }

  function toggleSound() {
    const next = !sound;
    if (next) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) { setToast({ error: true, text: 'Audio is not supported in this browser.' }); return; }
      audioRef.current ||= new Context();
      audioRef.current.resume();
    }
    soundRef.current = next;
    setSound(next);
    if (next) playTone('join');
  }

  const betPanel = <aside className="betting-panel" aria-label="Betting panel"><div className="panel-heading"><div><span className="eyebrow">{state?.phase === 'racing' ? 'Your extremely capable colleagues' : 'Pick your coffee champion'}</span><h2>The usual suspects<span>.</span></h2></div><span className="runner-count">{state?.racers?.length || '—'}<small>AGENTS</small></span></div><div className="pool-heading"><span><span className="live-dot" /> LIVE BETTING POOL</span><strong><Icon name="coin" size={14} />{(state?.betting?.total || 0).toLocaleString()}</strong></div><Lineup state={state} selected={selected} onSelect={setSelected} />
    <form className="bet-form" onSubmit={submitBet}>
      <div className="wallet-line"><button type="button" className="player-name" onClick={() => setEditingName(!editingName)}>{player?.name || 'Your wallet'}<span>↗</span></button><span className="wallet-balance"><Icon name="coin" size={16} /><strong>{player ? player.balance.toLocaleString() : '—'}</strong><small>coins</small></span></div>
      {editingName && <div className="name-editor"><label htmlFor="player-name">Your name</label><div><input id="player-name" maxLength="20" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Coffee enthusiast" /><button type="button" onClick={updateName} disabled={!name.trim()}>Save</button></div></div>}
      {existingBet && !editingBet ? <><div className="locked-bet"><span className="locked-check"><Icon name="check" size={18} /></span><div><strong>{existingBet.amount} coins on {state?.racers?.find(runner => runner.id === existingBet.runnerId)?.name || existingBet.runnerId}</strong><p>{state?.phase === 'results' ? betResultText : state?.phase === 'betting' ? 'Your bet is in. Changes close when the race starts.' : 'Your bet is locked. Let the chaos happen.'}</p></div></div>{state?.phase === 'betting' && <button className="change-bet" type="button" disabled={pending} onClick={event => { event.preventDefault(); setEditingBet(true); setSelected(existingBet.runnerId); setStake(existingBet.amount); }}>Change your bet<Icon name="refresh" size={12} /></button>}</> : <><fieldset className="stake-field"><legend>Your stake</legend><div className="stake-options">{[25, 50, 100, 250].map(amount => <button className={stake === amount ? 'active' : ''} key={amount} type="button" onClick={() => setStake(amount)} disabled={state?.phase !== 'betting' || amount > availableBalance} aria-pressed={stake === amount}>{amount}</button>)}</div></fieldset><button className="place-bet" type="submit" disabled={!canBet}><span>{pending ? 'Placing bet…' : !connected ? 'Connecting…' : state?.phase === 'racing' ? 'Bets closed. Enjoy the chaos.' : state?.phase === 'results' ? 'Next round coming up' : player && stake > availableBalance ? 'Not enough coins' : `${editingBet ? 'Switch to' : 'Back'} ${currentRunner?.name || 'your agent'}`}</span><Icon name="arrow" size={20} /></button>{editingBet && <button className="change-bet" type="button" onClick={() => setEditingBet(false)}>Keep current bet</button>}</>}
      <p className="bet-disclaimer">Imaginary coins. Real emotional damage.</p>
    </form></aside>;

  return <div className={`app ${mobileJoin ? 'phone-mode' : ''}`}><header className="site-header"><a className="brand" href="/" aria-label="Coffee Run home"><span className="brand-icon"><Icon name="cup" size={25} /></span><span>COFFEE<span className="brand-run">RUN<span className="brand-dot">•</span></span></span></a><div className="header-tagline">Artificial intelligence.<br /><strong>Questionable coordination.</strong></div><div className="header-actions"><span className={`connection-pill ${connected ? '' : 'offline'}`}><span className="live-dot" />{connected ? 'LIVE FROM THE OFFICE' : 'CONNECTING TO OFFICE'}</span>{!mobileJoin && <button className="join-button" type="button" onClick={() => setShowQR(true)}><Icon name="qr" size={19} /><span>Join on your phone</span><Icon name="arrow" size={17} /></button>}</div></header>
    <main>{mobileJoin ? <div className="mobile-intro"><span className="eyebrow">Welcome to the office</span><h1>Good coffee.<br /><span>Terrible decisions.</span></h1><div className="mobile-round"><span className="live-dot" /> ROUND {String(state?.round || 1).padStart(2, '0')}<strong>{phaseText(state?.phase)}</strong><span>{formattedTime(state?.timeLeft)}</span></div></div> : <div className="broadcast-intro"><div className="intro-title"><span className="eyebrow"><span className="tiny-square" /> The autonomous office Olympics</span><h1>Just bring the <span>coffee.</span></h1></div><div className="mission-intro"><span className="mission-number">01</span><p>Six agents. One coffee machine.<br /><strong>What could possibly go wrong?</strong></p></div></div>}
    <div className="game-layout">{!mobileJoin && <section className="broadcast" aria-label="Live office broadcast"><div className="stage-topbar"><div className="round-label"><span className="round-index">R{String(state?.round || 1).padStart(2, '0')}</span><span className="stage-phase"><span className="live-dot" />{phaseText(state?.phase)}</span></div><div className={`phase-clock ${state?.timeLeft < 10 ? 'urgent' : ''}`}><span>{state?.phase === 'racing' ? 'TIME LEFT' : state?.phase === 'results' ? 'NEXT ROUND' : 'BETS CLOSE IN'}</span><strong>{formattedTime(state?.timeLeft)}</strong></div></div>
      <div className="scene-wrap"><CoffeeViewport state={state} camera={camera} selected={selected} onSelect={setSelected} /><div className="scene-location"><span className="location-symbol">⌖</span> FLOOR 01 <span>/</span> THE DAILY GRIND</div><div className="scene-tools"><button className="scene-tool" type="button" onClick={() => setCamera(camera === 'overview' ? 'track' : 'overview')} aria-label={camera === 'overview' ? 'Follow selected runner' : 'Show whole office'} aria-pressed={camera === 'track'}><Icon name="camera" size={17} /><span>{camera === 'overview' ? 'Overview' : 'Following'}</span></button><button className="scene-tool sound-button" type="button" onClick={toggleSound} aria-label={sound ? 'Mute game sound' : 'Enable game sound'} aria-pressed={sound}><Icon name={sound ? 'volume' : 'muted'} size={17} /></button></div>
        {!state && <div className="stage-waiting"><span className="loading-dot" /><strong>Opening the office…</strong><span>{connected ? 'The agents are clocking in.' : 'Waiting for the game server.'}</span></div>}
        {state?.phase === 'betting' && <div className="betting-banner"><span className="banner-sticker"><Icon name="coin" size={23} /></span><div><span className="eyebrow">A new round of bad decisions</span><strong>Who’s bringing it home?</strong></div><button type="button" onClick={() => hostAction('host:start')} disabled={!connected}>Start race<Icon name="play" size={16} /></button></div>}
        {state?.phase === 'results' && <div className="results-banner"><span className="winner-kicker"><Icon name="crown" size={24} /> {winner ? 'COFFEE DELIVERED' : 'COFFEE BREAKDOWN'}</span><h2>{winner?.name || 'No one'}<span>{winner ? ' actually did it.' : ' made it home.'}</span></h2><p>{winner ? 'One small sip for an agent. One giant relief for the office.' : 'The coffee machine is still hiring.'}</p><button type="button" onClick={() => hostAction('host:reset')}>Another round<Icon name="refresh" size={16} /></button></div>}
      </div><div className="mission-strip"><span className="mission-cup"><Icon name="cup" size={21} /></span><p><strong>The assignment</strong> Get a cup. Fill it. Survive your colleagues. Deliver it at least <b>55% full.</b></p><span className="agent-mode">{state?.agentMode === 'openai' ? 'AI agents' : 'Local agents'}</span></div>
      <section className="incident-feed" aria-label="Live race incidents"><div className="feed-title"><span className="live-dot" /><span>OFFICE GOSSIP</span><small>Unfiltered, unfortunately.</small></div><div className="feed-events" aria-live="polite">{events.length ? events.map(event => <div className={`feed-event event-${event.type}`} key={event.id}><span className="feed-marker">{event.type === 'win' || event.type === 'delivery' ? '★' : event.type === 'spill' || event.type === 'fall' ? '!' : '↳'}</span><span>{event.text}</span></div>) : <div className="feed-event quiet"><span className="feed-marker">↳</span><span>Suspiciously peaceful. That won’t last.</span></div>}</div></section>
    </section>}{betPanel}</div>
    {mobileJoin && state?.phase === 'results' && <section className="mobile-winner"><Icon name="crown" size={25} /><span>{winner ? `${winner.name} brought the coffee home.` : 'No coffee made it home this time.'}</span></section>}
    </main><footer className="site-footer"><span>A highly unproductive experiment.</span><span>Built with agents. Raced by agents. Blamed on agents.</span><span className="footer-coffee"><Icon name="cup" size={14} /> Please do not try this at work.</span></footer>{toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}><Icon name={toast.error ? 'close' : 'check'} size={18} /><span>{toast.text}</span><button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><Icon name="close" size={16} /></button></div>}{showQR && <QRModal url={joinUrl} onClose={closeQR} />}</div>;
}
