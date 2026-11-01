// Test-only transport. No request to api.openai.com leaves this process.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, options);
  const path = new URL(url).pathname;
  if (path === '/v1/audio/transcriptions') return Response.json({ text: 'Wait here.' });
  const body = JSON.parse(options.body);
  const observation = path === '/v1/decisions' ? body.input[1].content[0].data : JSON.parse(body.input);
  const east = /east/i.test(observation.instruction) && observation.history.length === 0;
  if (path === '/v1/decisions') {
    const choice = east ? 'move:east:careful:250' : 'wait';
    if (!body.questions[0].choices.some(option => option.value === choice)) throw new Error('Test selected an absent command');
    return Response.json({ answers: [{ name: 'next_command', type: 'choice', choice, confidence: .95 }] });
  }
  if (path === '/v1/responses') return Response.json({ output_text: JSON.stringify(east ? { type: 'move', x: 1, z: 0, durationMs: 250, pace: 'careful' } : { type: 'wait', durationMs: 500 }) });
  throw new Error(`Unmocked OpenAI endpoint: ${path}`);
};
