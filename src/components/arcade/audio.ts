/**
 * Synthesized sound: no samples to download. An engine hum that follows your
 * speed, a crackle while you ride a wall, and short cues for turns, crashes
 * and rounds. The context is created on the first key press in the game,
 * suspended whenever the game is not running, and closed on exit, so the
 * audio thread costs nothing outside play.
 */

export class Sound {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private humGain: GainNode | null = null;
	private humOsc: OscillatorNode[] = [];
	private humFilter: BiquadFilterNode | null = null;
	private grindGain: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private muted: boolean;

	constructor(muted: boolean) {
		this.muted = muted;
	}

	/** Call from a user gesture. */
	ensure() {
		if (this.ctx) {
			if (this.ctx.state === "suspended") void this.ctx.resume();
			return;
		}
		const Ctx = window.AudioContext;
		if (!Ctx) return;
		const ctx = new Ctx({ latencyHint: "interactive" });
		this.ctx = ctx;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -14;
		comp.connect(ctx.destination);
		this.master = ctx.createGain();
		this.master.gain.value = this.muted ? 0 : 0.5;
		this.master.connect(comp);

		const len = ctx.sampleRate;
		this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

		// Engine: a saw and a square an octave apart, through a lowpass.
		this.humFilter = ctx.createBiquadFilter();
		this.humFilter.type = "lowpass";
		this.humFilter.frequency.value = 520;
		this.humFilter.Q.value = 4;
		this.humGain = ctx.createGain();
		this.humGain.gain.value = 0;
		this.humFilter.connect(this.humGain).connect(this.master);
		for (const [type, f, g] of [
			["sawtooth", 55, 0.5],
			["square", 110.6, 0.18],
		] as const) {
			const o = ctx.createOscillator();
			o.type = type;
			o.frequency.value = f;
			const og = ctx.createGain();
			og.gain.value = g;
			o.connect(og).connect(this.humFilter);
			o.start();
			this.humOsc.push(o);
		}

		// Grinding: looped noise through a bandpass, faded in and out.
		const grind = ctx.createBufferSource();
		grind.buffer = this.noise;
		grind.loop = true;
		const band = ctx.createBiquadFilter();
		band.type = "bandpass";
		band.frequency.value = 3200;
		band.Q.value = 1.2;
		this.grindGain = ctx.createGain();
		this.grindGain.gain.value = 0;
		grind.connect(band).connect(this.grindGain).connect(this.master);
		grind.start();
	}

	setMuted(muted: boolean) {
		this.muted = muted;
		if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
	}

	/** Engine state, called every frame while playing; cheap when nothing changes. */
	engine(running: boolean, speed: number, boosting: boolean, grinding: boolean) {
		const ctx = this.ctx;
		if (!ctx || !this.humGain || !this.humFilter || !this.grindGain) return;
		const t = ctx.currentTime;
		const pitch = 1 + (speed - 4) * 0.12 + (boosting ? 0.35 : 0);
		this.humGain.gain.setTargetAtTime(running ? 0.11 : 0, t, 0.06);
		this.humFilter.frequency.setTargetAtTime(running ? 420 + pitch * 380 : 300, t, 0.05);
		this.humOsc[0]?.frequency.setTargetAtTime(55 * pitch, t, 0.05);
		this.humOsc[1]?.frequency.setTargetAtTime(110.6 * pitch, t, 0.05);
		this.grindGain.gain.setTargetAtTime(running && grinding ? 0.05 : 0, t, 0.03);
	}

	private tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0) {
		const ctx = this.ctx;
		if (!ctx || !this.master) return;
		const t = ctx.currentTime + delay;
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(from, t);
		o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(gain, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		o.connect(g).connect(this.master);
		o.start(t);
		o.stop(t + dur + 0.02);
	}

	private burst(dur: number, gain: number, cutoff: number) {
		const ctx = this.ctx;
		if (!ctx || !this.master || !this.noise) return;
		const t = ctx.currentTime;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const f = ctx.createBiquadFilter();
		f.type = "lowpass";
		f.frequency.setValueAtTime(cutoff, t);
		f.frequency.exponentialRampToValueAtTime(80, t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(gain, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(f).connect(g).connect(this.master);
		src.start(t);
		src.stop(t + dur + 0.02);
	}

	turn() {
		this.tone("square", 900, 640, 0.045, 0.05);
	}

	crash(mine: boolean) {
		this.burst(mine ? 0.9 : 0.5, mine ? 0.5 : 0.22, mine ? 5200 : 3000);
		this.tone("sine", mine ? 220 : 330, 38, mine ? 0.8 : 0.4, mine ? 0.35 : 0.15);
	}

	countdown(final: boolean) {
		this.tone("triangle", final ? 1320 : 660, final ? 1320 : 660, final ? 0.22 : 0.09, 0.12);
	}

	win() {
		[523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.16, 0.12, i * 0.08));
	}

	lose() {
		[392, 311, 233].forEach((f, i) => this.tone("sawtooth", f, f * 0.97, 0.22, 0.07, i * 0.14));
	}

	suspend() {
		if (this.ctx?.state === "running") void this.ctx.suspend();
	}

	resume() {
		if (this.ctx?.state === "suspended") void this.ctx.resume();
	}

	dispose() {
		void this.ctx?.close();
		this.ctx = null;
	}
}
