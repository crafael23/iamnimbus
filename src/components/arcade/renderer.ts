/**
 * WebGL2 renderer for the arcade. No libraries: four small programs and a
 * handful of render targets, so the GPU work per frame is fixed and small.
 *
 * Per frame:
 * 1. glow    half res: the scene, thresholded, kept with a decaying copy of
 *            the last frame (phosphor afterglow).
 * 2. down×3  dual-filter (Kawase) blur down to 1/16 res.
 * 3. up×2    and back up to 1/4 res: the bloom.
 * 4. final   full res, straight to the canvas: the scene evaluated per pixel
 *            (crisp lines at any size, no full-res buffer), plus bloom and
 *            afterglow, through the same barrel curve as the site's tube.
 *
 * The board is one RGBA8 texel per cell (owner, trail connections, birth
 * tick), so drawing costs the same however long the trails get. Nothing is
 * allocated per frame.
 */

import { DX, DY, type Game, SUB } from "../../../convex/_lib/arcade/engine";

export type Palette = {
	void: RGB;
	rim: RGB;
	grid: RGB;
	block: RGB;
	blockEdge: RGB;
	/** Player first, then bots by brain (drifter, spacer, cutter). */
	player: RGB;
	brains: [RGB, RGB, RGB];
};
export type RGB = [number, number, number];

export type View = {
	game: Game;
	/** 0..1 between the last tick and the next. */
	alpha: number;
	/** Board tilt in radians: 0 flat, ~1 lying on the horizon. */
	tilt: number;
	gridFade: number;
	flash: number;
	flashColor: RGB;
	shakeX: number;
	shakeY: number;
};

const VERT = `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The board, as a function of a point in cell units. Shared by the glow and final passes. */
const SCENE = `
uniform highp usampler2D uBoard;
uniform vec2 uBoardSize;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uCellPx;
uniform float uTilt;
uniform float uCam;
uniform float uTick;
uniform float uTickInt;
uniform vec2 uShake;
uniform vec4 uHead[4];
uniform vec4 uHeadInfo[4];
uniform vec3 uColor[4];
uniform float uDerez[4];
uniform vec4 uCrash[4];
uniform vec3 uRim;
uniform vec3 uGrid;
uniform vec3 uBlock;
uniform vec3 uBlockEdge;
uniform float uGridFade;

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float segd(vec2 p, vec2 e) {
	float h = clamp(dot(p, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
	return length(p - e * h);
}

/** Screen pixel (y down) to board cells, through the tilt. */
vec2 toBoard(vec2 spx, out float pxc, out float fog) {
	vec2 s = (spx - uCenter) / uCellPx;
	if (uTilt < 0.0005) {
		pxc = 1.0 / uCellPx;
		fog = 1.0;
		return s + uBoardSize * 0.5;
	}
	float ct = cos(uTilt);
	float st = sin(uTilt);
	float den = uCam * ct + s.y * st;
	if (den <= 0.001) {
		pxc = 1.0;
		fog = 0.0;
		return vec2(-1e4);
	}
	float t = uCam * ct / den;
	pxc = t / uCellPx;
	fog = clamp(1.7 - t * 0.45, 0.0, 1.0);
	return vec2(t * s.x, t * s.y * ct - uCam * (t - 1.0) * st) + uBoardSize * 0.5;
}

uint cellAt(ivec2 c) {
	if (c.x < 0 || c.y < 0 || c.x >= int(uBoardSize.x) || c.y >= int(uBoardSize.y)) return 1u;
	return texelFetch(uBoard, c, 0).r;
}

vec3 lightLine(float d, vec3 color, float age, float pxc) {
	float w = 0.12;
	float core = 1.0 - smoothstep(w - pxc * 0.5, w + pxc, d);
	float inner = 1.0 - smoothstep(0.0, w * 0.7 + pxc * 0.5, d);
	float halo = exp(-max(d - w, 0.0) * 10.0) * 0.45;
	float heat = exp(-age / 14.0);
	return color * (core * 0.95 + halo) + vec3(1.0) * (inner * 0.3 + core * heat * 0.75);
}

/** A crashed rider's trail breaks up cell by cell, flickering as it goes. */
float dissolve(int idx, vec2 cell) {
	float d = uDerez[idx];
	if (d < 0.0) return 1.0;
	float k = d / 45.0;
	float thr = hash(cell * 1.37 + float(idx));
	float flick = 0.55 + 0.45 * sin(uTick * 1.9 + thr * 40.0);
	return (1.0 - smoothstep(thr * 0.85, thr * 0.85 + 0.15, k)) * mix(1.0, flick, min(k * 3.0, 1.0));
}

vec3 scene(vec2 p, float pxc) {
	vec3 col = vec3(0.0);
	vec2 halfSize = uBoardSize * 0.5;
	vec2 dd = abs(p - halfSize) - halfSize;
	float sd = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
	col += uRim * (1.0 - smoothstep(0.08, 0.08 + pxc * 1.5, abs(sd)));
	col += uRim * exp(-abs(sd) * 5.0) * 0.12;
	if (sd > 0.0) return col;

	vec2 gm = abs(p - 4.0 * floor(p / 4.0 + 0.5));
	float line = 1.0 - smoothstep(0.03, 0.03 + pxc * 1.2, min(gm.x, gm.y));
	vec2 gi = abs(p - floor(p + 0.5));
	float dotv = 1.0 - smoothstep(0.05, 0.05 + pxc * 1.5, length(gi));
	col += uGrid * (line * 0.16 + dotv * 0.2) * uGridFade;

	ivec2 ci = ivec2(floor(p));
	uvec4 t = texelFetch(uBoard, ci, 0);
	vec2 f = fract(p) - 0.5;
	if (t.r == 1u) {
		float de = 1e3;
		if (cellAt(ci + ivec2(-1, 0)) != 1u) de = min(de, f.x + 0.5);
		if (cellAt(ci + ivec2(1, 0)) != 1u) de = min(de, 0.5 - f.x);
		if (cellAt(ci + ivec2(0, -1)) != 1u) de = min(de, f.y + 0.5);
		if (cellAt(ci + ivec2(0, 1)) != 1u) de = min(de, 0.5 - f.y);
		col = mix(col, uBlock, 0.92);
		col += uBlockEdge * (1.0 - smoothstep(0.07, 0.07 + pxc * 1.5, de));
		col += uBlockEdge * 0.07 * step(0.5, fract((p.x + p.y) * 1.25));
	} else if (t.r >= 2u) {
		int idx = int(t.r) - 2;
		uint bits = t.g;
		float d = length(f);
		if ((bits & 1u) != 0u) d = min(d, segd(f, vec2(0.0, -0.5)));
		if ((bits & 2u) != 0u) d = min(d, segd(f, vec2(0.5, 0.0)));
		if ((bits & 4u) != 0u) d = min(d, segd(f, vec2(0.0, 0.5)));
		if ((bits & 8u) != 0u) d = min(d, segd(f, vec2(-0.5, 0.0)));
		float age = mod(uTickInt - float(t.b) + 256.0, 256.0);
		col += lightLine(d, uColor[idx], age, pxc) * dissolve(idx, vec2(ci));
	}

	for (int i = 0; i < 4; i++) {
		vec4 info = uHeadInfo[i];
		if (info.z < -0.5) continue;
		vec2 hp = uHead[i].xy;
		vec2 cc = uHead[i].zw;
		vec2 rel = p - hp;
		if (dot(rel, rel) > 16.0) continue;
		float alive = step(0.5, info.z);
		col += lightLine(segd(p - cc, hp - cc), uColor[i], 0.0, pxc) * mix(dissolve(i, floor(cc)), 1.0, alive);
		if (alive > 0.0) {
			vec2 dir = info.xy;
			vec2 perp = vec2(-dir.y, dir.x);
			float a = dot(rel, dir);
			float b = dot(rel, perp);
			float e = length(vec2(a / 0.42, b / 0.22));
			float body = 1.0 - smoothstep(0.8, 1.0 + pxc * 3.0, e);
			float glow = exp(-e * 2.2) * (0.55 + info.w * 0.6);
			col += uColor[i] * glow + vec3(1.0) * body * 0.9;
			if (info.w > 0.0 && a < 0.0) col += uColor[i] * exp(-abs(b) * 14.0) * exp(a * 1.2) * 0.6 * info.w;
		}
	}

	for (int i = 0; i < 4; i++) {
		vec4 cr = uCrash[i];
		if (cr.z < 0.0) continue;
		float age = cr.z;
		vec2 rel = p - cr.xy;
		float r = length(rel);
		float life = 1.0 - age / 80.0;
		if (r > 16.0 || life <= 0.0) continue;
		vec3 cc = uColor[int(cr.w)];
		col += mix(vec3(1.0), cc, min(age / 10.0, 1.0)) * exp(-abs(r - age * 0.22) * 4.0) * life * 0.9;
		col += vec3(1.0) * exp(-r * 2.5) * max(1.0 - age / 14.0, 0.0) * 2.0;
		for (int k = 0; k < 14; k++) {
			float h1 = hash(vec2(float(k), cr.x + cr.y * 7.0));
			float h2 = hash(vec2(cr.y, float(k) * 3.1));
			float ang = h1 * 6.2831853;
			float dist = (0.07 + h2 * 0.16) * age * (1.0 - age / 170.0);
			col += cc * exp(-length(rel - vec2(cos(ang), sin(ang)) * dist) * 7.0) * life * 1.2;
		}
	}
	return col;
}
`;

const GLOW_FRAG = `#version 300 es
precision highp float;
precision highp int;
${SCENE}
uniform sampler2D uPrev;
uniform float uDecay;
out vec4 outColor;
void main() {
	vec2 sp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) + uShake;
	float pxc;
	float fog;
	vec2 p = toBoard(sp, pxc, fog);
	vec3 c = fog > 0.0 ? scene(p, pxc) * fog : vec3(0.0);
	c = max(c - 0.18, 0.0);
	vec3 prev = texture(uPrev, gl_FragCoord.xy / uRes).rgb * uDecay;
	outColor = vec4(max(c, prev), 1.0);
}`;

const DOWN_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uHalfTexel;
uniform vec2 uRes;
out vec4 outColor;
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	vec3 s = texture(uSrc, uv).rgb * 4.0;
	s += texture(uSrc, uv - uHalfTexel).rgb;
	s += texture(uSrc, uv + uHalfTexel).rgb;
	s += texture(uSrc, uv + vec2(uHalfTexel.x, -uHalfTexel.y)).rgb;
	s += texture(uSrc, uv - vec2(uHalfTexel.x, -uHalfTexel.y)).rgb;
	outColor = vec4(s / 8.0, 1.0);
}`;

const UP_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uHalfTexel;
uniform vec2 uRes;
out vec4 outColor;
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	vec2 h = uHalfTexel;
	vec3 s = texture(uSrc, uv + vec2(-h.x * 2.0, 0.0)).rgb;
	s += texture(uSrc, uv + vec2(-h.x, h.y)).rgb * 2.0;
	s += texture(uSrc, uv + vec2(0.0, h.y * 2.0)).rgb;
	s += texture(uSrc, uv + vec2(h.x, h.y)).rgb * 2.0;
	s += texture(uSrc, uv + vec2(h.x * 2.0, 0.0)).rgb;
	s += texture(uSrc, uv + vec2(h.x, -h.y)).rgb * 2.0;
	s += texture(uSrc, uv + vec2(0.0, -h.y * 2.0)).rgb;
	s += texture(uSrc, uv + vec2(-h.x, -h.y)).rgb * 2.0;
	outColor = vec4(s / 12.0, 1.0);
}`;

const FINAL_FRAG = `#version 300 es
precision highp float;
precision highp int;
${SCENE}
uniform sampler2D uGlow;
uniform sampler2D uBloom;
uniform float uCurve;
uniform float uBloomStrength;
uniform vec3 uVoid;
uniform vec3 uFlashColor;
uniform float uFlash;
out vec4 outColor;
void main() {
	vec2 uv = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes;
	// The same barrel curve as the site's tube (CrtScreen.tsx): pushed out by r².
	vec2 c = uv - 0.5;
	vec2 uvc = uv + c * dot(c, c) * uCurve;
	if (uvc.x < 0.0 || uvc.y < 0.0 || uvc.x > 1.0 || uvc.y > 1.0) {
		outColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}
	float pxc;
	float fog;
	vec2 p = toBoard(uvc * uRes + uShake, pxc, fog);
	vec3 col = uVoid;
	if (fog > 0.0) col += scene(p, pxc) * fog;
	vec2 tuv = vec2(uvc.x, 1.0 - uvc.y);
	col += texture(uBloom, tuv).rgb * uBloomStrength + texture(uGlow, tuv).rgb * 0.25;
	col += uFlashColor * uFlash;
	col += (hash(gl_FragCoord.xy + fract(uTick * 0.013) * 97.0) - 0.5) / 255.0;
	outColor = vec4(col, 1.0);
}`;

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
type Program = { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> };

export class Renderer {
	private readonly gl: WebGL2RenderingContext;
	private readonly vao: WebGLVertexArrayObject;
	private readonly glowProg: Program;
	private readonly downProg: Program;
	private readonly upProg: Program;
	private readonly finalProg: Program;
	private readonly boardTex: WebGLTexture;
	private readonly palette: Palette;
	private readonly hdr: boolean;
	private targets: Target[] = [];
	private glowA: Target | null = null;
	private glowB: Target | null = null;
	private chain: Target[] = [];
	private width = 1;
	private height = 1;
	private curve = 0;
	private boardW = 0;
	private boardH = 0;
	private boardData = new Uint8Array(0);
	private births = new Uint8Array(0);
	private seenVersion = -1;
	private seenRound = -1;
	private seenGame: Game | null = null;
	private seenLen = new Int32Array(4);
	/** Tick each cycle crashed (-1: alive). */
	private crashTick = new Float64Array(4).fill(-1);
	private crashAt = new Float32Array(8);
	// Uniform scratch, reused every frame.
	private readonly uHead = new Float32Array(16);
	private readonly uHeadInfo = new Float32Array(16);
	private readonly uColor = new Float32Array(12);
	private readonly uDerez = new Float32Array(4);
	private readonly uCrash = new Float32Array(16);
	/** GPU frame timing, where the browser allows it (Chrome); null elsewhere. */
	private readonly timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
	private readonly queries: WebGLQuery[] = [];
	private readonly gpuMs: number[] = [];

	/** Throws if WebGL2 is unavailable. */
	constructor(
		private readonly canvas: HTMLCanvasElement,
		palette: Palette,
	) {
		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: false,
			preserveDrawingBuffer: false,
			powerPreference: "default",
		});
		if (!gl) throw new Error("WebGL2 unavailable");
		this.gl = gl;
		this.palette = palette;
		this.hdr = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");
		this.vao = gl.createVertexArray()!;
		this.glowProg = this.program(GLOW_FRAG);
		this.downProg = this.program(DOWN_FRAG);
		this.upProg = this.program(UP_FRAG);
		this.finalProg = this.program(FINAL_FRAG);
		this.boardTex = gl.createTexture()!;
		this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
	}

	private program(frag: string): Program {
		const gl = this.gl;
		const compile = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
				const log = gl.getShaderInfoLog(s);
				gl.deleteShader(s);
				throw new Error(`shader: ${log}`);
			}
			return s;
		};
		const vs = compile(gl.VERTEX_SHADER, VERT);
		const fs = compile(gl.FRAGMENT_SHADER, frag);
		const prog = gl.createProgram()!;
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
		return { prog, loc: new Map() };
	}

	private u(p: Program, name: string) {
		let l = p.loc.get(name);
		if (l === undefined) {
			l = this.gl.getUniformLocation(p.prog, name);
			p.loc.set(name, l);
		}
		return l;
	}

	private target(w: number, h: number): Target {
		const gl = this.gl;
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
		else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const fbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		const t = { tex, fbo, w, h };
		this.targets.push(t);
		return t;
	}

	/** Size the drawing buffer in device pixels. `curve` matches CrtScreen's barrel (0 for flat). */
	resize(width: number, height: number, curve: number) {
		const gl = this.gl;
		this.curve = curve;
		if (width === this.width && height === this.height && this.glowA) return;
		this.width = width;
		this.height = height;
		this.canvas.width = width;
		this.canvas.height = height;
		for (const t of this.targets) {
			gl.deleteTexture(t.tex);
			gl.deleteFramebuffer(t.fbo);
		}
		this.targets = [];
		const at = (div: number) =>
			this.target(Math.max(1, Math.round(width / div)), Math.max(1, Math.round(height / div)));
		this.glowA = at(2);
		this.glowB = at(2);
		this.chain = [at(4), at(8), at(16), at(8), at(4)];
	}

	private syncBoard(game: Game) {
		const gl = this.gl;
		if (game.w !== this.boardW || game.h !== this.boardH) {
			this.boardW = game.w;
			this.boardH = game.h;
			this.boardData = new Uint8Array(game.w * game.h * 4);
			this.births = new Uint8Array(game.w * game.h);
			gl.bindTexture(gl.TEXTURE_2D, this.boardTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, game.w, game.h, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			this.seenVersion = -1;
		}
		if (game !== this.seenGame || game.round !== this.seenRound) {
			this.seenGame = game;
			this.seenRound = game.round;
			this.seenLen.fill(0);
			this.crashTick.fill(-1);
			this.seenVersion = -1;
		}
		if (game.version === this.seenVersion) return;
		this.seenVersion = game.version;
		// Stamp cells laid since the last sync with the tick they appeared.
		for (const c of game.cycles) {
			if (c.trailLen < this.seenLen[c.index]!) this.seenLen[c.index] = 0;
			for (let k = this.seenLen[c.index]!; k < c.trailLen; k++) this.births[c.trail[k]!] = game.tick & 255;
			this.seenLen[c.index] = c.trailLen;
		}
		const data = this.boardData;
		const { board, conn } = game;
		for (let i = 0, j = 0; i < board.length; i++, j += 4) {
			data[j] = board[i]!;
			data[j + 1] = conn[i]!;
			data[j + 2] = this.births[i]!;
		}
		gl.bindTexture(gl.TEXTURE_2D, this.boardTex);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, game.w, game.h, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);
	}

	/** Note crashes from the last step, for the burst and the dissolve. */
	noteEvents(game: Game) {
		for (const e of game.events) {
			if (e.type === "crash") {
				this.crashTick[e.cycle] = game.tick;
				const c = game.cycles[e.cycle]!;
				// Where it hit: halfway into the cell it tried to enter.
				this.crashAt[e.cycle * 2] = c.x + 0.5 + DX[c.dir] * 0.5;
				this.crashAt[e.cycle * 2 + 1] = c.y + 0.5 + DY[c.dir] * 0.5;
			}
		}
	}

	/** Board placement, in device pixels. */
	private layout(game: Game) {
		const top = Math.round(this.height * 0.09);
		const pad = Math.round(Math.min(this.width, this.height) * 0.035);
		const cell = Math.min((this.width - pad * 2) / game.w, (this.height - top - pad * 2) / game.h);
		return { cell, cx: this.width / 2, cy: top + (this.height - top) / 2 };
	}

	private sceneUniforms(p: Program, v: View, scale: number, w: number, h: number) {
		const gl = this.gl;
		const g = v.game;
		const { cell, cx, cy } = this.layout(g);
		const tick = g.tick + v.alpha;
		gl.uniform1i(this.u(p, "uBoard"), 0);
		gl.uniform2f(this.u(p, "uBoardSize"), g.w, g.h);
		gl.uniform2f(this.u(p, "uRes"), w, h);
		gl.uniform2f(this.u(p, "uCenter"), cx * scale, cy * scale);
		gl.uniform1f(this.u(p, "uCellPx"), cell * scale);
		gl.uniform1f(this.u(p, "uTilt"), v.tilt);
		gl.uniform1f(this.u(p, "uCam"), g.h * 1.25);
		gl.uniform1f(this.u(p, "uTick"), tick);
		gl.uniform1f(this.u(p, "uTickInt"), g.tick & 255);
		gl.uniform2f(this.u(p, "uShake"), v.shakeX * scale, v.shakeY * scale);
		gl.uniform4fv(this.u(p, "uHead"), this.uHead);
		gl.uniform4fv(this.u(p, "uHeadInfo"), this.uHeadInfo);
		gl.uniform3fv(this.u(p, "uColor"), this.uColor);
		gl.uniform1fv(this.u(p, "uDerez"), this.uDerez);
		gl.uniform4fv(this.u(p, "uCrash"), this.uCrash);
		const pal = this.palette;
		gl.uniform3fv(this.u(p, "uRim"), pal.rim);
		gl.uniform3fv(this.u(p, "uGrid"), pal.grid);
		gl.uniform3fv(this.u(p, "uBlock"), pal.block);
		gl.uniform3fv(this.u(p, "uBlockEdge"), pal.blockEdge);
		gl.uniform1f(this.u(p, "uGridFade"), v.gridFade);
	}

	private fillCycles(v: View) {
		const g = v.game;
		const tick = g.tick + v.alpha;
		for (let i = 0; i < 4; i++) {
			const c = g.cycles[i];
			const o = i * 4;
			if (!c) {
				this.uHeadInfo[o + 2] = -1;
				this.uDerez[i] = -1;
				this.uCrash[o + 2] = -1;
				continue;
			}
			const moving = c.alive && g.phase === "play";
			const frac = moving ? Math.min((c.progress + c.speed * v.alpha) / SUB, 0.999) : c.progress / SUB;
			const cx = c.x + 0.5;
			const cy = c.y + 0.5;
			this.uHead[o] = cx + DX[c.dir] * frac;
			this.uHead[o + 1] = cy + DY[c.dir] * frac;
			this.uHead[o + 2] = cx;
			this.uHead[o + 3] = cy;
			const boost = i === 0 && c.alive && g.boosting && g.energy >= 4 && g.phase === "play" ? 1 : 0;
			this.uHeadInfo[o] = DX[c.dir];
			this.uHeadInfo[o + 1] = DY[c.dir];
			this.uHeadInfo[o + 2] = c.alive ? 1 : 0;
			this.uHeadInfo[o + 3] = boost;
			const color = i === 0 ? this.palette.player : this.palette.brains[c.brain === -1 ? 0 : c.brain];
			this.uColor[i * 3] = color[0];
			this.uColor[i * 3 + 1] = color[1];
			this.uColor[i * 3 + 2] = color[2];
			const crashed = this.crashTick[i]!;
			const age = crashed < 0 ? -1 : Math.max(0, tick - crashed);
			this.uDerez[i] = age;
			this.uCrash[o] = this.crashAt[i * 2]!;
			this.uCrash[o + 1] = this.crashAt[i * 2 + 1]!;
			this.uCrash[o + 2] = age;
			this.uCrash[o + 3] = i;
		}
	}

	private pass(p: Program, to: Target | null, w: number, h: number) {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fbo : null);
		gl.viewport(0, 0, w, h);
		gl.useProgram(p.prog);
	}

	private blur(p: Program, from: Target, to: Target) {
		const gl = this.gl;
		this.pass(p, to, to.w, to.h);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, from.tex);
		gl.uniform1i(this.u(p, "uSrc"), 1);
		gl.uniform2f(this.u(p, "uHalfTexel"), 0.5 / from.w, 0.5 / from.h);
		gl.uniform2f(this.u(p, "uRes"), to.w, to.h);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	draw(v: View) {
		const gl = this.gl;
		if (gl.isContextLost() || !this.glowA || !this.glowB) return;
		this.syncBoard(v.game);
		this.fillCycles(v);
		const query = this.timer && this.queries.length < 4 ? gl.createQuery() : null;
		if (query) gl.beginQuery(this.timer!.TIME_ELAPSED_EXT, query);
		gl.bindVertexArray(this.vao);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.boardTex);

		// 1. Glow with afterglow, half res.
		const [cur, prev] = [this.glowA, this.glowB];
		this.pass(this.glowProg, cur, cur.w, cur.h);
		this.sceneUniforms(this.glowProg, v, cur.w / this.width, cur.w, cur.h);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, prev.tex);
		gl.uniform1i(this.u(this.glowProg, "uPrev"), 1);
		gl.uniform1f(this.u(this.glowProg, "uDecay"), 0.8);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// 2-3. Bloom.
		const [d1, d2, d3, u2, u1] = this.chain as [Target, Target, Target, Target, Target];
		this.blur(this.downProg, cur, d1);
		this.blur(this.downProg, d1, d2);
		this.blur(this.downProg, d2, d3);
		this.blur(this.upProg, d3, u2);
		this.blur(this.upProg, u2, u1);

		// 4. Final.
		const f = this.finalProg;
		this.pass(f, null, this.width, this.height);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.boardTex);
		this.sceneUniforms(f, v, 1, this.width, this.height);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, cur.tex);
		gl.uniform1i(this.u(f, "uGlow"), 1);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, u1.tex);
		gl.uniform1i(this.u(f, "uBloom"), 2);
		gl.uniform1f(this.u(f, "uCurve"), this.curve);
		gl.uniform1f(this.u(f, "uBloomStrength"), this.hdr ? 1.5 : 1.9);
		gl.uniform3fv(this.u(f, "uVoid"), this.palette.void);
		gl.uniform3fv(this.u(f, "uFlashColor"), v.flashColor);
		gl.uniform1f(this.u(f, "uFlash"), v.flash);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		this.glowA = prev;
		this.glowB = cur;
		if (query) {
			gl.endQuery(this.timer!.TIME_ELAPSED_EXT);
			this.queries.push(query);
		}
		this.collectTimings();
	}

	/** Read finished GPU timings (they arrive a frame or two late). */
	private collectTimings() {
		const gl = this.gl;
		while (this.queries.length && gl.getQueryParameter(this.queries[0]!, gl.QUERY_RESULT_AVAILABLE)) {
			const q = this.queries.shift()!;
			if (!gl.getParameter(this.timer!.GPU_DISJOINT_EXT) && this.gpuMs.length < 240) {
				this.gpuMs.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
			}
			gl.deleteQuery(q);
		}
	}

	/** The 75th-percentile GPU time per frame since the last call, or null if unmeasured. */
	takeGpuTime(): number | null {
		if (this.gpuMs.length < 20) return null;
		const sorted = this.gpuMs.sort((a, b) => a - b);
		const p75 = sorted[Math.floor(sorted.length * 0.75)]!;
		this.gpuMs.length = 0;
		return p75;
	}

	get hasGpuTimer() {
		return !!this.timer;
	}

	dispose() {
		const gl = this.gl;
		for (const t of this.targets) {
			gl.deleteTexture(t.tex);
			gl.deleteFramebuffer(t.fbo);
		}
		this.targets = [];
		for (const q of this.queries) gl.deleteQuery(q);
		this.queries.length = 0;
		gl.deleteTexture(this.boardTex);
		for (const p of [this.glowProg, this.downProg, this.upProg, this.finalProg]) gl.deleteProgram(p.prog);
		gl.deleteVertexArray(this.vao);
		// Hand the context back now rather than at garbage collection, once the
		// canvas has really left the page (a remount reuses the same canvas).
		const canvas = this.canvas;
		setTimeout(() => {
			if (!canvas.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
		}, 0);
	}
}

/** Read the site's colour tokens, so the game follows the theme. */
export function readPalette(): Palette {
	const css = getComputedStyle(document.documentElement);
	const hex = (name: string, fallback: string): RGB => {
		const v = css.getPropertyValue(name).trim() || fallback;
		const m = /^#?([0-9a-f]{6})$/i.exec(v);
		const n = Number.parseInt(m ? m[1]! : fallback.slice(1), 16);
		return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
	};
	const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
	const cyan = hex("--color-cyan", "#5ee2ff");
	const cyanDim = hex("--color-cyan-dim", "#2b88b3");
	const ice = hex("--color-ice", "#cff1ff");
	return {
		void: hex("--color-void", "#01050a"),
		rim: scale(cyan, 0.9),
		grid: cyanDim,
		block: hex("--color-panel", "#06121f"),
		blockEdge: hex("--color-line-strong", "#1c4563").map((x) => Math.min(1, x * 2.2)) as RGB,
		player: hex("--color-amber", "#ff9d42"),
		brains: [[cyanDim[0] * 1.5, cyanDim[1] * 1.4, cyanDim[2] * 1.3], cyan, ice],
	};
}
