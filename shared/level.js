export const RUNNERS = [
  { id: 'pip', name: 'Pip', color: '#ee765b', trait: 'Small legs. Big plans.', pace: 1.08, aggression: .45 },
  { id: 'bolt', name: 'Bolt', color: '#efbc45', trait: 'Absolutely no brakes.', pace: 1.22, aggression: .65 },
  { id: 'miso', name: 'Miso', color: '#62bc9c', trait: 'Protects the good stuff.', pace: .98, aggression: .12 },
  { id: 'clawd', name: 'Clawd', color: '#ae8bd8', trait: 'Our coffee, actually.', pace: 1.04, aggression: .9 },
  { id: 'byte', name: 'Byte', color: '#62afe1', trait: 'A very elaborate shortcut.', pace: 1.08, aggression: .35 },
  { id: 'gary', name: 'Gary', color: '#e396b2', trait: 'Just happy to be employed.', pace: 1.02, aggression: .25 },
];

export const LEVEL = {
  bounds: { minX: -9.6, maxX: 9.6, minZ: -6.6, maxZ: 6.6 },
  customer: { x: 7, z: -2.3, delivery: { x: 7, z: .65 }, desk: { x: 7, z: -1, w: 3.2, d: 1.4, h: 1.12 } },
  cupRack: { x: -7, z: 3.5 },
  stations: [
    { id: 'brew-a', x: -8, z: -4.2, cupX: -8, cupZ: -4.98, cupY: 1.17, duration: 6.8 },
    { id: 'brew-b', x: -5.8, z: -4.2, cupX: -5.8, cupZ: -4.98, cupY: 1.17, duration: 6.8 },
  ],
  obstacles: [
    { id: 'brew-counter', x: -7, z: -5.7, w: 5.4, d: 1.5, h: 1.08 },
    { id: 'cup-counter', x: -7, z: 4.8, w: 4.5, d: 1.4, h: 1.08 },
    { id: 'island', x: -4.1, z: -.25, w: 2.6, d: 2.25, h: 1.08 },
    { id: 'partition-north', x: .4, z: -3.65, w: .32, d: 3.3, h: 1.1 },
    { id: 'partition-south', x: .4, z: 2.65, w: .32, d: 2.5, h: 1.1 },
    { id: 'customer-desk', x: 7, z: -1, w: 3.2, d: 1.4, h: 1.12 },
    { id: 'prep-island', x: -1.9, z: 2.6, w: 1.8, d: 1.25, h: 1.02 },
    { id: 'communal-table', x: 3.6, z: -.9, w: 2.7, d: 1.65, h: .94 },
    { id: 'office-copier', x: 8.6, z: 3.2, w: 1.5, d: 1.45, h: 1.15 },
    { id: 'north-storage', x: 3, z: -4.4, w: 1.6, d: 1.4, h: 1.15 },
    { id: 'plant-shelf', x: 4.5, z: -5.8, w: 4.8, d: 1, h: .7 },
  ],
  gate: { x: .4, z: -.15, w: .35, d: 2.65, period: 22, closedFor: 5 },
  spawns: [{x:2.2,z:2.8},{x:4.6,z:2.8},{x:6.8,z:2.8},{x:2.2,z:5},{x:4.6,z:5},{x:6.8,z:5}],
  chairs: [{id:'chair-1',x:2.7,z:.7},{id:'chair-2',x:4.2,z:2},{id:'chair-3',x:-1.5,z:3.7}],
};
