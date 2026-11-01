"""Independent intelligibility check; ASR is a diagnostic, not a listening score.

Run with: uv run --no-project --with faster-whisper python trailer/check-voices.py
"""
import json
import os
import argparse
import pathlib
import subprocess
import numpy as np
from faster_whisper import WhisperModel

root = pathlib.Path(__file__).resolve().parent
request = json.loads((root / 'script.json').read_text())
jobs = pathlib.Path(os.environ.get('COFFEE_VOICE_JOBS_DIR', pathlib.Path.home() / '.local/share/coffee-trailer/voice-jobs'))
parser = argparse.ArgumentParser()
parser.add_argument('--voice-dir', type=pathlib.Path)
args = parser.parse_args()
options = [args.voice_dir] if args.voice_dir else [jobs / request['jobId'], jobs / (request['jobId'] + '-vps-backup'), root / 'assets/voice-backup']
job = next((p for p in options if p and (p / 'manifest.json').exists()), None)
if job is None:
    raise SystemExit('No complete narration job is available.')
base = job / 'audio'
model = WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=2,
                     download_root=str(pathlib.Path.home() / 'models/whisper'))
results = []
for segment in request['segments']:
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(base / (segment['id'] + '.wav')),
                                   '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'])
    audio = np.frombuffer(pcm, dtype=np.float32)
    pieces, _ = model.transcribe(audio, language='en', beam_size=3)
    text = ' '.join(piece.text.strip() for piece in pieces)
    result = {'id': segment['id'], 'expected': segment['text'], 'transcribed': text}
    results.append(result)
    print(json.dumps(result), flush=True)
(root / 'out/transcription-check.json').write_text(json.dumps(results, indent=2) + '\n')
