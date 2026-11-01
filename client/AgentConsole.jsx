import React, { useEffect, useRef, useState } from 'react';

export default function AgentConsole({ state, selected, socket, connected, onToast }) {
  const controller = state?.controllers?.find(item => item.id === selected);
  const runner = state?.racers?.find(item => item.id === selected);
  const agent = state?.agents?.find(item => item.id === selected);
  const [instruction, setInstruction] = useState(controller?.instruction || 'Deliver a coffee with at least 55% remaining.');
  const [mode, setMode] = useState(['responses', 'decisions'].includes(controller?.mode) ? controller.mode : 'responses');
  const [pending, setPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef(null);
  const stream = useRef(null);
  const alive = useRef(true);
  const request = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => {
    alive.current = false;
    clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    request.current?.abort();
  }, []);
  useEffect(() => { if (controller?.instruction) setInstruction(controller.instruction); }, [controller?.revision]);

  function send(payload) {
    return new Promise((resolve, reject) => {
      if (!socket.current?.connected) return reject(new Error('Reconnect before giving an instruction.'));
      socket.current.timeout(5000).emit('host:agent', { id: selected, ...payload }, (failure, result) => {
        if (failure || !result?.ok) reject(new Error(result?.error || 'The agent did not receive the instruction.'));
        else resolve(result);
      });
    });
  }
  async function apply(text = instruction) {
    setPending(true); setError('');
    try {
      const action = controller?.mode === 'external' || controller?.mode === mode ? 'instruction' : 'configure';
      await send({ action, mode, instruction: text });
      if (alive.current) onToast({ text: `Instruction sent to ${runner.name}.` });
    } catch (cause) { if (alive.current) setError(cause.message); }
    finally { if (alive.current) setPending(false); }
  }
  async function stop() {
    setPending(true); setError('');
    try { await send({ action: 'configure', mode: 'idle', instruction: '' }); }
    catch (cause) { if (alive.current) setError(cause.message); }
    finally { if (alive.current) setPending(false); }
  }
  async function record() {
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return; }
    setError(''); setPending(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Voice recording requires HTTPS or localhost and a browser with microphone support.');
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { stream.current.getTracks().forEach(track => track.stop()); return; }
      const chunks = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      recorder.current = active;
      active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      active.onstop = async () => {
        clearTimeout(timer.current);
        stream.current?.getTracks().forEach(track => track.stop());
        if (!alive.current) return;
        setRecording(false); setPending(true);
        try {
          request.current = new AbortController();
          const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'Content-Type': active.mimeType || 'audio/webm' }, body: new Blob(chunks, { type: active.mimeType }), signal: request.current.signal });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error || 'The instruction could not be transcribed.');
          if (!alive.current) return;
          setInstruction(result.text);
          await apply(result.text);
        } catch (cause) { if (alive.current) setError(cause.message); }
        finally { if (alive.current) setPending(false); }
      };
      active.start(); setRecording(true);
      timer.current = setTimeout(() => { if (active.state === 'recording') active.stop(); }, 20000);
    } catch (cause) { if (alive.current) setError(cause.message); }
    finally { if (alive.current) setPending(false); }
  }
  const external = controller?.mode === 'external';
  const disabled = pending || !connected || !!agent?.controlled;
  return <div className="agent-console">
    <p>Give {runner?.name || 'your agent'} an instruction. The agent chooses every movement and interaction.</p>
    <label htmlFor="agent-controller">Controller</label>
    {external ? <p id="agent-controller">External agent connected</p> : <select id="agent-controller" value={mode} onChange={event => setMode(event.target.value)} disabled={pending || recording}>
      <option value="responses">Agent · Responses API</option>
      <option value="decisions">Decisions API</option>
    </select>}
    <label htmlFor="agent-instruction">Instruction for {runner?.name}</label>
    <textarea id="agent-instruction" value={instruction} onChange={event => setInstruction(event.target.value)} maxLength={2000} rows={4} disabled={pending || recording} />
    <div className="agent-console-actions">
      <button type="button" className="primary-button" onClick={() => apply()} disabled={disabled || recording || !instruction.trim() || (!external && !state?.modelAvailable)}>{pending ? 'Sending…' : 'Send instruction'}</button>
      <button type="button" onClick={record} aria-pressed={recording} disabled={disabled || !state?.modelAvailable}>{recording ? 'Stop recording and send' : 'Record instruction'}</button>
      <button type="button" onClick={stop} disabled={disabled || recording || !controller || controller.mode === 'idle'}>Stop agent</button>
    </div>
    {!state?.modelAvailable && <p className="agent-console-note">Model control and voice are unavailable until a server API key is configured. External agents can connect through the game API.</p>}
    {agent?.controlled && <p>Release keyboard control before assigning an agent.</p>}
    <p role="status">{recording ? 'Recording. Stop to send your instruction.' : !connected ? 'Reconnecting…' : controller?.status || 'Waiting for a controller'}</p>
    {error && <p role="alert" className="agent-console-error">{error}</p>}
    {controller?.history?.length > 0 && <ol className="agent-command-history" aria-label="Recent agent commands">{controller.history.slice(-4).map(item => <li key={`${item.revision}-${item.sequence}`}>{item.command?.type}{item.command?.targetId ? ` ${item.command.targetId}` : ''}{item.command?.type === 'move' ? ` (${item.command.x}, ${item.command.z}), ${item.command.durationMs} ms` : ''}<span>{item.accepted ? 'Accepted' : item.error}</span></li>)}</ol>}
  </div>;
}
