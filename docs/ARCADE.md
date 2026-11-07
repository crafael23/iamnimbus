# The arcade

A light-cycle game tucked into the terminal chat. Typing `/afterglow` (`ARCADE_COMMAND` in
`src/components/arcade/config.ts`) opens it over the whole screen. The command shows up in `/help`
and the autocomplete with only `???` as its hint, so visitors can find it without being told what
it is. It never reaches the AI and doesn't use up a guest's messages.

## How it plays

You ride the amber cycle; the system rides the cyan ones. Every cycle leaves a wall behind it.
Crash into a wall, a trail or the border and you lose a life (three per run). Clear the board of
the system's riders to move up a level.

- **Steer:** arrow keys or WASD; swipe on touch screens. You can't reverse.
- **Boost:** hold Space (or the on-screen button). It drains a meter that slowly refills.
- **Grind:** riding with a wall right alongside you refills the boost meter fast and doubles the
  points for that stretch. It's the risky way to score.
- **Score:** points for every cell you ride (times the level, doubled while grinding), plus
  1,000 × level for each cleared round.
- **Opponents** get smarter by level: the Drifter avoids walls late and wanders; the Spacer keeps
  to open space; the Cutter (white) claims the cells it can reach before you and closes you in.
  From level 4, blocks appear on the board and speeds rise.

Esc or P pauses; M mutes. The game pauses itself when the tab is hidden or the window loses focus.

## How it works

| Piece | File | Notes |
|---|---|---|
| Rules | `convex/_lib/arcade/engine.ts` | Pure, deterministic: integers only, a seeded generator, no clocks. Shared by the browser and the server. |
| Opponents | `convex/_lib/arcade/bots.ts` | Wall avoidance, flood fill, and a Voronoi territory split, on preallocated buffers. |
| Renderer | `src/components/arcade/renderer.ts` | Raw WebGL2, no libraries. One texel per board cell; the scene is drawn per pixel, so cost doesn't grow with trail length. |
| Loop, input, recording | `src/components/arcade/session.ts` | Fixed 60 Hz simulation, at most 60 drawn frames a second, dynamic resolution. |
| Sound | `src/components/arcade/audio.ts` | Synthesized with Web Audio; no sound files. |
| UI | `src/components/arcade/Arcade.tsx` | Screens, HUD, leaderboard. Lazy-loaded: none of it is downloaded until the command is typed. |
| Leaderboard | `convex/arcade/`, `convex/_lib/arcade/leaderboard.ts` | Convex, with `@convex-dev/aggregate` for ranks. |

### What a frame costs

The renderer runs four kinds of pass per frame:

1. A glow pass at half resolution, which keeps a fading copy of the last frame (the phosphor
   afterglow).
2. A blur down to 1/16 resolution and back up to 1/4 (the bloom).
3. A final full-resolution pass that draws the board, adds the bloom, and bends the image with
   the same barrel curve as the site's screen (`src/components/crtCurve.ts`).

The canvas sits under the site's glass layer, so the real scanlines and vignette stay in front.
While the game is open the terminal underneath is hidden and inert, so the site's SVG curve filter
has nothing to redraw.

Measured on an Apple-silicon Mac in Chromium at 2311×1428 device pixels (dev build):

| Measure | Result |
|---|---|
| CPU per frame, whole loop | p50 0.1 ms, p99 0.4 ms |
| GPU per frame | p50 2.5–2.7 ms (1.7 ms at 75% resolution, 0.8 ms at 50%) |
| Simulation | exactly 60 ticks/s on a 120 Hz display (every second frame drawn) |
| Long tasks | none |
| Hardest tick (level 9, three bots) | 125 µs worst case |
| Six open–play–close cycles | JS heap flat (33.7–35.5 MB vs 36.4 MB before) |
| After closing | 0 animation frames, WebGL context released, audio context closed, no canvas left |
| Paused, or idle 45 s on the title screen | 0 frames drawn |
| Download | 19.8 KB gzipped (production build), fetched only when the command is typed |

On a weaker GPU, the session times each frame with `EXT_disjoint_timer_query_webgl2` where
available and lowers the resolution while a frame costs more than 5 ms, raising it again when
there's headroom. Without GPU timers (Safari, Firefox) it lowers resolution only when frames are
being missed. Drawing is capped at about 3.3 million pixels and 2× device pixel ratio.

### Why the leaderboard can be trusted

A run starts on the server (`startRun`), which issues the random seed. The browser records every
input together with the tick it was applied on. At the end it sends that list (`submitRun`). A
Convex action replays the whole game from the seed with the same engine and only ranks the score
the replay produces. Runs that arrive faster than they could have been played are rejected, and a
run can't be submitted more than two hours after it started. Every run ends at 30 minutes of game
time, in whatever phase that falls, so the browser and the replay always stop on the same tick.
Replaying a seven-minute game takes about 150 ms. Each player keeps one row on the board: their
best score.

## Credits

Every line of the game is original; no code or assets were copied. These open-source projects
shaped the ideas, and the game's credits screen lists them too:

- [CodeClash LightCycles](https://github.com/CodeClash-ai/LightCycles): deterministic tick
  rules, simultaneous and head-on crashes, seeded replays.
- [momajd/Tron](https://github.com/momajd/Tron): the reactive opponent that steers away from
  walls.
- [nlieb/PyTron](https://github.com/nlieb/PyTron): territory scoring for the opponent that cuts
  you off.
- [Tortured-Metaphor/LightCycle](https://github.com/Tortured-Metaphor/LightCycle): boost on a
  regenerating meter, and arcade game feel.
- [Armagetron Advanced](https://www.armagetronad.org/): riding close to walls as a skill.
- [erichlof/3dLightCycles](https://github.com/erichlof/3dLightCycles): trails that break apart
  when a rider crashes.
- [michaelsmueller/light-cycles](https://github.com/michaelsmueller/light-cycles): a plain
  canvas is enough.
- [alecdwm/webtron](https://github.com/alecdwm/webtron): a modern browser light-cycle
  architecture.
- Also read: [light-merch/TRON_multiplayer](https://github.com/light-merch/TRON_multiplayer),
  [kanishkdan/tron-game](https://github.com/kanishkdan/tron-game),
  [Balajanovski/tron-clone](https://github.com/Balajanovski/tron-clone),
  [philippotto/Tron3D](https://github.com/philippotto/Tron3D),
  [gsobell/lightcycle](https://github.com/gsobell/lightcycle).

The game descends from Gremlin's *Blockade* (1976) and the light cycles of *TRON* (Disney, 1982)
and its Bally Midway arcade game. It's an homage, not affiliated with either.
