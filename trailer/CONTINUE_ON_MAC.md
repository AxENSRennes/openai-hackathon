# Continue Coffee Run trailer on this Mac

You are continuing an existing implementation, not starting a new trailer.
Finish the approved 42-second Coffee Run trailer and export a playable MP4.

Repository: https://github.com/AxENSRennes/openai-hackathon
Branch: `codex/integrate-seven-mascots`
Expected Mac checkout: `/Users/axel2/Projects/openai-hackathon`
VPS SSH alias: `dev-vps`, account `dev`.
VPS checkout: `/home/dev/Projects/openai-hackathon`.

Inspect Git status first. Preserve the Mac voice agent's work and all local
changes. Fetch the branch and use a separate worktree if the current checkout
is dirty. Do not reset, clean, overwrite user changes, or merge into `main`.
Pushing or merging `main` deploys the live game; this task is the video.

Read `AGENTS.md`, `trailer/README.md`, `trailer/script.json`, and this handoff.
Communicate with the user in French. Write code, comments, and artifacts in
English.

## Existing implementation

- Remotion composition: `trailer/film.jsx`, ID `CoffeeRunTrailer`.
- Edit: `Trailer.jsx` and `timeline.mjs`; exactly 1,260 frames at 30 fps.
- Directed physics recorder: `record-physics.mjs` and `prepare.mjs`.
- Rendering of the real office and seven mascots: `World.jsx`.
- Music supplied by the user: `video/assets/openai_hackathon.m4a`.
- Actual phone betting UI and local fonts are included under `trailer/assets`.
- Seven scratch WAVs and their manifest are included under
  `trailer/assets/voice-backup`; this permits immediate rendering and mixing.
- Mixing/export: `mix.py`. Narration can be replaced without rendering the
  picture again.

The VPS completed representative 720p stills and a one-second H.264 motion
probe. A complete picture render was interrupted at approximately 35%.
There is no finished 42-second trailer yet. All 54 project tests and the client
build passed before handoff. A Remotion CLI warning about the existing Zod
security override may appear; renders worked with that override. Preserve it.

## Creative brief

Keep the approved script and timing in `script.json`:

1. 0–6s: agents write code, fix bugs, ship apps. Clean typography and terminal.
2. 6–10s: “But can they bring you a coffee?” Music cuts. A single cup.
3. 10–15s: bodies and one simple task; reveal the seven mascots.
4. 15–21s: brew and carry the coffee; “What could possibly go wrong?”
5. 21–27s: no narration; physical shove, falling cup, slow motion, impact.
6. 27–32s: “We may have over-engineered this.” Cut to the waiting customer.
7. 32–38s: give instructions, then back your favourite on the actual phone UI.
8. 38–42s: legal delivery, Coffee Run logo, and
   “Artificial intelligence. Questionable coordination.”

Use a very serious, warm British narrator with dry understatement. Preserve
pauses. The existing directed takes use real game commands and Rapier; avoid
representing the staging as a live AI or speech-recognition recording.

## Finish the work

1. Inspect the Mac's existing TTS environment at
   `~/.local/share/coffee-trailer/voice/` and reuse the work of the voice agent.
   It was preparing Qwen3-TTS VoiceDesign plus Base for an original, consistent
   British voice. Preserve its reference and installed models. The original
   inspected hardware was an Apple M5 with 16 GB RAM.
2. Run `npm ci`, then `npm run video:prepare` and `npm run video:stills`.
   Inspect the frames, particularly cup framing, text contrast, fall grounding,
   cup flight, the waiting customer, and the phone screen.
3. Generate or retrieve the seven approved narration segments. The authoritative
   request is `trailer/script.json`; the VPS copy is at
   `/home/dev/.local/share/coffee-trailer/voice-jobs/coffee-run-trailer-v1/request.json`.
   Use one narrator reference for the whole film. Exact text, no added words.
   Fit each maximum duration and leave natural endings. Do not add music.
4. Prioritize the `stakes` line: two ASR models heard the backup's “One coffee”
   as “One copy.” Listen and regenerate until the word is clearly coffee.
   Verify all lines by listening; ASR alone does not establish voice quality.
5. Store the finished job locally under
   `~/.local/share/coffee-trailer/voice-jobs/coffee-run-trailer-v1/`, with
   `audio/<segment-id>.wav` and `manifest.json`. Preserve model/runtime/voice
   settings, exact transcripts, sample rates, durations, and SHA-256 hashes.
   The manifest must contain the correct `jobId`.
6. Run `npm run video:render`. macOS defaults to ANGLE and four render workers.
   If that fails, test `REMOTION_GL=swangle VIDEO_CONCURRENCY=2` on a short
   `node trailer/render.mjs --frames=660-689` probe before a full render.
7. Run `npm run video:mix`, or pass `--voice-dir` to `trailer/mix.py` explicitly.
   Install FFmpeg if it is absent. The output is
   `trailer/out/coffee-run-trailer.mp4`.
8. Watch the full export with audio. Verify 42 seconds, H.264/AAC, no missing
   assets, readable text, no clipped words, audible narration, well-timed silence,
   and event-synchronized sound. Check actual scene motion, not only stills.
   Run the relevant tests after changes. Commit and push the video source changes
   on this branch and report the exact output path and remaining limitations.
9. Upload the completed voice job and final MP4 over the existing SSH connection
   to `/home/dev/.local/share/coffee-trailer/voice-jobs/coffee-run-trailer-v1/`
   and `/home/dev/.local/share/coffee-trailer/exports/`, respectively. Stage
   uploads under temporary names and rename after verifying hashes. Send the
   manifest last. Do not deploy or restart the game.

Model weights, Python environments, and generated bundles stay outside Git.
The checked-in scratch voice uses BreezeBlue's research/non-commercial license;
prefer the Mac's Apache-licensed Qwen setup for the final narration if its
actual listening quality meets the brief. Do not equate original-model rankings
with the quality of a local quantized port.
