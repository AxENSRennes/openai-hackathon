export const COMMAND_LIMITS = Object.freeze({ minDurationMs: 50, maxDurationMs: 1000 });
export const COMMAND_TYPES = ['move', 'look', 'stop', 'wait', 'take', 'brew', 'place', 'drop', 'push', 'deliver', 'stand_up'];

export function validateCommand(command) {
  if (!command || typeof command !== 'object' || !COMMAND_TYPES.includes(command.type)) return 'Unknown command.';
  if (['move', 'wait'].includes(command.type) && (!Number.isFinite(command.durationMs) || command.durationMs < COMMAND_LIMITS.minDurationMs || command.durationMs > COMMAND_LIMITS.maxDurationMs)) return 'Duration must be between 50 and 1000 milliseconds.';
  if (command.type === 'move' && (!Number.isFinite(command.x) || !Number.isFinite(command.z) || Math.abs(command.x) > 1 || Math.abs(command.z) > 1)) return 'Movement axes must be finite numbers between -1 and 1.';
  if (command.type === 'look' && !Number.isFinite(command.heading)) return 'Heading must be a finite angle in radians.';
  if (['take', 'brew', 'place', 'push'].includes(command.type) && (typeof command.targetId !== 'string' || !command.targetId || command.targetId.length > 100)) return 'An explicit targetId is required.';
  if (command.pace !== undefined && !['careful', 'fast'].includes(command.pace)) return 'Pace must be careful or fast.';
  return null;
}

export const commandSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    type: { type: 'string', enum: COMMAND_TYPES },
    x: { type: ['number', 'null'] }, z: { type: ['number', 'null'] },
    durationMs: { type: ['number', 'null'] }, heading: { type: ['number', 'null'] },
    targetId: { type: ['string', 'null'] }, pace: { type: 'string', enum: ['careful', 'fast'] },
  },
  required: ['type', 'x', 'z', 'durationMs', 'heading', 'targetId', 'pace'],
};
