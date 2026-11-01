"""Mix the supplied music, event-timed foley, and the completed voice job."""
import argparse
import array
import hashlib
import json
import math
import os
import pathlib
import random
import subprocess
import wave

root = pathlib.Path(__file__).resolve().parent
script = json.loads((root / 'script.json').read_text())
takes = json.loads((root / 'generated/takes.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--voice-dir', type=pathlib.Path)
parser.add_argument('--picture', type=pathlib.Path, default=root / 'out/picture.mp4')
parser.add_argument('--output', type=pathlib.Path, default=root / 'out/coffee-run-trailer.mp4')
args = parser.parse_args()
rate = 48000
samples = array.array('f', [0]) * (42 * rate)
rng = random.Random(20261101)

def tone(start, duration, frequency, volume, bend=1):
    offset = round(start * rate)
    phase = 0
    for i in range(round(duration * rate)):
        t = i / rate
        phase += 2 * math.pi * frequency * (bend ** (t / duration)) / rate
        envelope = min(1, t / .006) * math.exp(-7 * t / duration)
        if offset + i < len(samples):
            samples[offset + i] += math.sin(phase) * envelope * volume

def noise(start, duration, volume, smoothing=.8):
    offset = round(start * rate)
    previous = 0
    for i in range(round(duration * rate)):
        previous = previous * smoothing + rng.uniform(-1, 1) * (1 - smoothing)
        envelope = min(1, i / 180) * math.exp(-5 * i / (duration * rate))
        if offset + i < len(samples):
            samples[offset + i] += previous * envelope * volume

# The opening is intentionally silent from six to ten seconds except for VO.
for start in [.4, .55, .67, 2.2, 2.33, 2.48, 4.16, 4.32, 4.44]:
    noise(start, .035, .3, .6)
for start in [1.45, 3.4, 5.35]:
    tone(start, .16, 880, .1); tone(start + .08, .2, 1320, .08)
noise(15.05, 2.1, .12, .94); tone(15.05, 1.9, 105, .045)
ready = next(e['time'] for e in takes['brew']['events'] if e['type'] == 'ready')
for i, note in enumerate([660, 880]):
    tone(15 + ready - 5.3 + i * .1, .24, note, .09)
for start in [18 + i * .32 for i in range(9)] + [32.3 + i * .36 for i in range(15)]:
    tone(start, .065, 78, .07); noise(start, .055, .09, .92)
push = next(e['time'] for e in takes['chaos']['events'] if e['type'] == 'push')
impact = next(e['time'] for e in takes['chaos']['events'] if e['type'] == 'spill')
push_at = 21 + (push - 3) * 3
impact_at = 21 + (impact - 3) * 3
noise(push_at - .1, .22, .38, .85); tone(push_at, .22, 95, .45, .5)
noise(impact_at, .45, .45, .5); tone(impact_at, .2, 230, .16, .4)
tone(impact_at + .025, .13, 1450, .09)
tone(35.35, .14, 760, .085); tone(35.48, .2, 1140, .08)
win = next(e['time'] for e in takes['delivery']['events'] if e['type'] == 'win')
for i, note in enumerate([392, 494, 587, 784]):
    tone(38 + win - .5 + i * .1, .6, note, .12)
tone(41.1, .17, 1250, .1); tone(41.12, .1, 1840, .045)
effects = root / 'generated/foley.wav'
with wave.open(str(effects), 'wb') as output:
    output.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    pcm = array.array('h', (round(max(-.95, min(.95, x)) * 32767) for x in samples))
    output.writeframes(pcm.tobytes())

base = pathlib.Path(os.environ.get('COFFEE_VOICE_JOBS_DIR', pathlib.Path.home() / '.local/share/coffee-trailer/voice-jobs'))
choices = [args.voice_dir] if args.voice_dir else [base / script['jobId'], base / (script['jobId'] + '-vps-backup'), root / 'assets/voice-backup']
voice_dir = next((p for p in choices if p and (p / 'manifest.json').exists()), None)
if voice_dir is None:
    raise SystemExit('No complete voice job. Upload all seven WAVs and manifest.json, then rerun this command.')
manifest = json.loads((voice_dir / 'manifest.json').read_text())
if manifest.get('jobId') != script['jobId']:
    raise SystemExit('Voice manifest jobId does not match the approved script.')

def probe(file):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(file)]))['format']

if abs(float(probe(args.picture)['duration']) - 42) > .05:
    raise SystemExit('The input picture must be the complete 42-second render, not a motion probe.')

inputs = ['ffmpeg', '-hide_banner', '-y', '-i', str(args.picture), '-i', str(root.parent / 'video/assets/openai_hackathon.m4a'), '-i', str(effects)]
filters = [
    '[1:a]asplit=4[m1][m2][m3][m4]',
    '[m1]atrim=0:6,asetpts=PTS-STARTPTS,volume=0.16,afade=t=in:d=0.3,afade=t=out:st=5.55:d=0.45[music1]',
    '[m2]atrim=6:17,asetpts=PTS-STARTPTS,volume=0.16,afade=t=in:d=0.25,afade=t=out:st=10.6:d=0.4,adelay=10000|10000[music2]',
    '[m3]atrim=17:22.5,asetpts=PTS-STARTPTS,volume=0.11,afade=t=in:d=0.35,adelay=27000|27000[music3]',
    '[m4]atrim=22.5:30.165,asetpts=PTS-STARTPTS,volume=0.19,afade=t=out:st=6.8:d=0.85,adelay=32000|32000[music4]',
    '[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.8[fx]',
]
mix_labels = ['music1', 'music2', 'music3', 'music4', 'fx']
report = {'jobId': script['jobId'], 'picture': str(args.picture), 'voiceDirectory': str(voice_dir), 'voiceModel': manifest.get('model'), 'segments': [], 'eventCues': {'push': push_at, 'impact': impact_at, 'delivery': 38 + win - .5}}
for index, segment in enumerate(script['segments'], 3):
    audio = voice_dir / 'audio' / (segment['id'] + '.wav')
    if not audio.is_file():
        raise SystemExit('Missing narration segment: ' + str(audio))
    duration = float(probe(audio)['duration'])
    speed = max(1, duration / segment['maxDurationSeconds'])
    if speed > 1.2:
        raise SystemExit(f"{segment['id']} is too long ({duration:.2f}s). Regenerate the line rather than rushing it.")
    entries = manifest.get('segments', [])
    original = next((x for x in entries if isinstance(x, dict) and x.get('id') == segment['id']), {}) if isinstance(entries, list) else {}
    digest = hashlib.sha256(audio.read_bytes()).hexdigest()
    if original.get('sha256') and original['sha256'] != digest:
        raise SystemExit('Narration checksum mismatch: ' + segment['id'])
    if original.get('text') and original['text'] != segment['text']:
        raise SystemExit('Narration transcript mismatch: ' + segment['id'])
    inputs += ['-i', str(audio)]
    label = 'voice' + str(index)
    delay = round(segment['startSeconds'] * 1000)
    filters.append(f'[{index}:a]highpass=f=80,atempo={speed:.6f},loudnorm=I=-17:TP=-2:LRA=7,aformat=sample_rates=48000:channel_layouts=stereo,adelay={delay}|{delay}[{label}]')
    mix_labels.append(label)
    report['segments'].append({'id': segment['id'], 'durationSeconds': duration, 'startSeconds': segment['startSeconds'], 'tempo': speed, 'sha256': digest})
filters.append(''.join('[' + name + ']' for name in mix_labels) + f'amix=inputs={len(mix_labels)}:normalize=0:duration=longest,alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=9,atrim=duration=42[master]')
temporary = args.output.with_name(args.output.stem + '.partial.mp4')
subprocess.run(inputs + ['-filter_complex', ';'.join(filters), '-map', '0:v:0', '-map', '[master]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', '42', '-movflags', '+faststart', str(temporary)], check=True)
if abs(float(probe(temporary)['duration']) - 42) > .1:
    raise SystemExit('Final export has an unexpected duration.')
temporary.replace(args.output)
(args.output.parent / 'mix-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('Export complete: ' + str(args.output))
