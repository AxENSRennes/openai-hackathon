"""Generate a consistent local backup while the Mac voice job is pending."""
import hashlib
import json
import os
import pathlib
import subprocess
import time
import wave

root = pathlib.Path(__file__).resolve().parent
request = json.loads((root / 'script.json').read_text())
home = pathlib.Path.home() / '.local/share/coffee-trailer'
voice_jobs = pathlib.Path(os.environ.get('COFFEE_VOICE_JOBS_DIR', home / 'voice-jobs'))
job = voice_jobs / (request['jobId'] + '-vps-backup')
(job / 'audio').mkdir(parents=True, exist_ok=True)
segments = []
for segment in request['segments']:
    output = job / 'audio' / (segment['id'] + '.wav')
    started = time.monotonic()
    if not output.exists():
        command = [
            'nice', '-n', '10', str(home / 'Breeze-TTS-2.cpp/build/breeze-cli'),
            str(pathlib.Path.home() / 'models/breeze-tts-2/breeze-tts-2-q8_0.gguf'), '--cpu',
            '--text', segment['text'], '--seed', '42',
            '--ref-audio', str(home / 'voice-test-british.wav'),
            '--ref-text', 'Your agents can build an entire app. But can they bring you a coffee?',
            '--instruction', 'A serious British technology launch narrator. ' + segment['direction'],
            '--max-new', str(int((segment['maxDurationSeconds'] + 3) * 12.5)),
            '--timings', '--output', str(output),
        ]
        print('Generating ' + segment['id'], flush=True)
        with (job / (segment['id'] + '.log')).open('w') as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    with wave.open(str(output)) as audio:
        duration = audio.getnframes() / audio.getframerate()
        rate, channels = audio.getframerate(), audio.getnchannels()
    segments.append({**segment, 'filename': 'audio/' + output.name, 'durationSeconds': duration,
                     'sampleRate': rate, 'channels': channels,
                     'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                     'generationSeconds': round(time.monotonic() - started, 2)})
    print(f"Ready: {segment['id']} ({duration:.2f}s)", flush=True)
manifest = {'jobId': request['jobId'], 'model': 'BreezeBlue/Breeze-TTS-2',
            'runtime': 'Breeze-TTS-2.cpp Q8 CPU', 'voiceReference': 'voice-test-british.wav',
            'segments': segments}
temporary = job / 'manifest.json.partial'
temporary.write_text(json.dumps(manifest, indent=2) + '\n')
temporary.replace(job / 'manifest.json')
print('Backup narration complete: ' + str(job), flush=True)
