const MELODIES = { ready: [660, 880], steal: [440, 620, 390], win: [392, 494, 587, 784] };

export class GameAudio {
  constructor() { this.enabled = false; this.context = null; this.lastFootstep = 0; this.lastBrew = 0; }
  async setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) { this.context?.suspend(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { this.enabled = false; return; }
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.gain.value = .52;
      const compressor = this.context.createDynamicsCompressor();
      this.master.connect(compressor).connect(this.context.destination);
      const length = this.context.sampleRate;
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    await this.context.resume();
  }
  output(x = 0) {
    const pan = this.context.createStereoPanner();
    pan.pan.value = Math.max(-.8, Math.min(.8, x / 12));
    pan.connect(this.master); return pan;
  }
  tone(frequency, duration, { volume = .08, delay = 0, type = 'sine', bend = 1, x = 0 } = {}) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const time = this.context.currentTime + delay, oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * bend), time + duration);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .007);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    const output = this.output(x); oscillator.connect(gain).connect(output);
    oscillator.start(time); oscillator.stop(time + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); output.disconnect(); };
  }
  rustle(duration, cutoff, volume, x = 0, delay = 0) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const time = this.context.currentTime + delay, source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    const output = this.output(x); source.connect(filter).connect(gain).connect(output); source.start(time); source.stop(time + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); output.disconnect(); };
  }
  event(event, x = 0) {
    if (!this.enabled) return;
    const melody = MELODIES[event.type];
    if (melody) melody.forEach((note, i) => this.tone(note, event.type === 'win' ? .65 : .2, { type: 'triangle', delay: i * .1, volume: .095, x }));
    switch (event.type) {
      case 'take': case 'place': this.tone(1250, .12, { volume: .065, bend: .72, x }); this.tone(1840, .07, { volume: .025, delay: .02, x }); break;
      case 'brew': this.rustle(.8, 750, .09, x); this.tone(105, .75, { volume: .035, type: 'sawtooth', x }); break;
      case 'spill': this.rustle(.4, 2800, .12, x); this.tone(230, .14, { volume: .04, bend: .4, x }); break;
      case 'push': case 'fall': case 'drop': this.rustle(.13, 450, .18, x); this.tone(95, .18, { volume: .15, bend: .5, x }); break;
      case 'break': for (let i = 0; i < 5; i++) { this.tone(1550 + i * 317, .13, { volume: .04, delay: i * .025, bend: .6, x }); } this.rustle(.35, 6700, .13, x); break;
      case 'gate': this.tone(140, .27, { type: 'triangle', volume: .07, bend: 1.4, x }); this.rustle(.16, 950, .06, x); break;
      case 'recover': this.rustle(.12, 800, .04, x); break;
    }
  }
  update(dt, state, selected) {
    if (!this.enabled || !state || state.phase !== 'racing') return;
    this.lastFootstep += dt; this.lastBrew += dt;
    const speed = Math.hypot(selected?.vx || 0, selected?.vz || 0);
    const stepInterval = Math.max(.12, (selected?.carrying ? .32 : .5) / Math.max(.2, speed));
    if (selected?.moving && !selected.fallen && this.lastFootstep > stepInterval) {
      this.lastFootstep = 0; this.rustle(.06, 450, .055, selected.x); this.tone(78, .06, { volume: .04, x: selected.x });
    }
    if (state.stations?.some(station => station.busy && !station.ready) && this.lastBrew > .7) { this.lastBrew = 0; this.rustle(.55, 1250, .035, -7); }
  }
  dispose() { this.context?.close(); this.context = null; }
}
