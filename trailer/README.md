# Coffee Run trailer

A 42-second, 1280 × 720, 30 fps Remotion trailer. The approved English script is
in `script.json`. The visual treatment is a serious British technology launch
for seven AI-controlled mascots attempting one coffee delivery.

## Build and render

Requires Node.js 22.12 or later, npm, Python 3, and FFmpeg/FFprobe.

```sh
npm ci
npm run video:prepare
npm run video:stills
npm run video:render
npm run video:mix
```

The final command writes `trailer/out/coffee-run-trailer.mp4`. Rendering and audio
mixing are separate so replacing narration does not require rendering the 3D
picture again. Inspect and edit with `npm run video:studio`.

The renderer selects `angle` on macOS and `swangle` on Linux. Override with
`REMOTION_GL` if needed. `VIDEO_CONCURRENCY` defaults to four on macOS and two
on Linux. Reduce concurrency if memory pressure rises. A short render probe is:

```sh
node trailer/render.mjs --frames=660-689
```

## Voice job

`video:prepare` stages the approved request at
`~/.local/share/coffee-trailer/voice-jobs/coffee-run-trailer-v1/request.json`.
Override the jobs directory with `COFFEE_VOICE_JOBS_DIR`.

The Mac voice agent should generate one WAV for each of the seven segment IDs,
using one reference narrator. The complete job contains `audio/<id>.wav` and a
`manifest.json` with `jobId: "coffee-run-trailer-v1"`. The mixer validates file
durations, checks transcript and SHA-256 fields when supplied, and refuses to
speed up a line by more than 20%. Upload the manifest last.

The mixer prefers the completed local primary job, then the local VPS backup,
then the checked-in `assets/voice-backup` job. Select a specific job explicitly:

```sh
python3 trailer/mix.py --voice-dir /absolute/path/to/voice-job
```

The included scratch narration uses Breeze TTS 2 Q8 and an original synthetic
reference voice. Its model and self-hosted outputs are subject to BreezeBlue's
research and non-commercial license. No model weights are included. The Mac's
separate Qwen3-TTS setup can replace these clips. Before final delivery, listen
to the `stakes` line carefully: two independent ASR runs transcribed “One coffee”
as “One copy.” Regenerate this line if the pronunciation is ambiguous.

Optional intelligibility diagnostics:

```sh
uv run --no-project --with faster-whisper python trailer/check-voices.py
```

This is an ASR diagnostic, not a naturalness or accent evaluation.

## Physics and edit

`prepare.mjs` uses the real `CoffeeSimulation`, Rapier, and validated game
commands. It records brewing, pickup, carrying, pushing, falling, dropping,
spilling, the careful route, and legal delivery. Initial positions and cup
contents are staged for each shot and documented in the generated take data.
These are directed gameplay takes, not recordings of live model decisions or
live speech recognition. The instruction overlay describes the staged route.

`timeline.mjs` maps the 42-second edit to these recorded states. Slow motion
plays the same physical cup trajectory at one third speed. The Three.js view
samples an absolute frame and does not advance physics while rendering.

`mix.py` derives shove, cup-impact, and delivery cues from recorded events.
It uses the supplied music, original procedural foley, and the seven approved
narration clips. It exports H.264 picture with stereo AAC at 48 kHz and records
the audio inputs and timing in `out/mix-report.json`.

## Assets and validation

- Game environment, seven mascots, cups, and chairs: this repository's original
  Coffee Run assets. The source files remain authoritative.
- `assets/phone.png`: the actual `/join` interface after a confirmed wager of
  100 imaginary coins on an isolated local development server.
- Music: `video/assets/openai_hackathon.m4a`; see its adjacent provenance file.
- Fonts: Barlow Condensed Black and DM Sans from Google Fonts, with their OFL
  notices in `assets/fonts`.
- Scratch voice model/runtime details and audio hashes: the included voice
  backup manifest. Original narration reference was generated for this project.

Generated takes, bundles, stills, and rendered videos are ignored by Git.
Run `node --test tests/trailer.test.js` for replay determinism, command tracing,
timeline continuity, and the silent comedy beat. The complete project suite
and client build also passed during preparation.

At the Mac handoff, the full picture render was interrupted at approximately
35%; no completed 42-second MP4 is claimed. A one-second H.264 motion probe
and representative stills were rendered successfully on the VPS. Finish and
review the complete export on the Mac.
