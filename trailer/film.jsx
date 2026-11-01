import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Trailer } from './Trailer.jsx';
import { DURATION, FPS } from './timeline.mjs';

registerRoot(() => <Composition id="CoffeeRunTrailer" component={Trailer} width={1280} height={720} fps={FPS} durationInFrames={DURATION * FPS} />);
