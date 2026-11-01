export const RUNNERS = [
  { id: 'pip', name: 'Pip', color: '#ea7055', trait: 'Small legs. Big plans.', speed: 1.12, aggression: .42 },
  { id: 'bolt', name: 'Bolt', color: '#e4b441', trait: 'Absolutely no brakes.', speed: 1.35, aggression: .72 },
  { id: 'miso', name: 'Miso', color: '#81bfa8', trait: 'Slow coffee is good coffee.', speed: .95, aggression: .15 },
  { id: 'clawd', name: 'Clawd', color: '#9588ca', trait: 'Your coffee? Our coffee.', speed: 1.05, aggression: .95 },
  { id: 'byte', name: 'Byte', color: '#6aa6ce', trait: 'Recalculating the obvious.', speed: 1.13, aggression: .32 },
  { id: 'gary', name: 'Gary', color: '#d58ba8', trait: 'Just happy to be employed.', speed: 1.04, aggression: .3 },
];

export const MAP = {
  width: 22, depth: 14,
  cups: { x: -8.3, z: 3.2 }, machine: { x: -8.1, z: -3.6 },
  obstacles: [
    { x: -10, z: -5.3, w: 2.7, d: 1.7, type: 'counter' },
    { x: -9.6, z: 4.7, w: 3.2, d: 1.35, type: 'counter' },
    { x: -5.5, z: -.3, w: 2.5, d: 2.5, type: 'island' },
    { x: -.8, z: -3.7, w: .45, d: 4.5, type: 'partition' },
    { x: -.8, z: 2.7, w: .45, d: 3, type: 'partition' },
    ...[-4, 0, 4].flatMap(z => [6, 9.3].map(x => ({ x, z, w: 2.05, d: 1.2, type: 'desk' }))),
  ],
  desks: [-4, 0, 4].flatMap(z => [6, 9.3].map(x => ({ x, z, targetX: x, targetZ: z + 1.25 }))),
};

function randomFrom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const GRID = .5;
const inside = (x, z, margin = .32) => MAP.obstacles.some(o => Math.abs(x - o.x) < o.w / 2 + margin && Math.abs(z - o.z) < o.d / 2 + margin);

function pathTo(from, goal) {
  const toCell = p => [Math.round((p.x + 10.5) / GRID), Math.round((p.z + 6.5) / GRID)];
  const toPoint = (x, z) => ({ x: x * GRID - 10.5, z: z * GRID - 6.5 });
  const key = (x, z) => z * 43 + x;
  const start = toCell(from), end = toCell(goal);
  const queue = [{ x: start[0], z: start[1], g: 0, f: 0 }];
  const visited = new Map([[key(...start), { parent: null }]]);
  let current, reached = false;
  while (queue.length) {
    queue.sort((a, b) => b.f - a.f);
    current = queue.pop();
    if (Math.abs(current.x - end[0]) + Math.abs(current.z - end[1]) <= 1) { reached = true; break; }
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = current.x + dx, z = current.z + dz;
      if (x < 0 || x > 42 || z < 0 || z > 26 || visited.has(key(x,z))) continue;
      const p = toPoint(x,z);
      if (inside(p.x,p.z)) continue;
      const g = current.g + 1;
      visited.set(key(x,z), { parent: key(current.x,current.z), x, z });
      queue.push({ x,z,g,f:g + Math.abs(x-end[0]) + Math.abs(z-end[1]) });
    }
  }
  if (!current || !reached) return [];
  const points = [];
  let k = key(current.x,current.z);
  while (visited.get(k)?.parent !== null && visited.get(k)) {
    const node = visited.get(k);
    points.unshift(toPoint(node.x,node.z));
    k = node.parent;
  }
  points.push({ ...goal });
  return points;
}

export class CoffeeSimulation {
  constructor({ round = 1 } = {}) {
    this.round = round; this.rand = randomFrom(round * 9199 + 42);
    this.elapsed = 0; this.winner = null; this.finished = false; this.events = []; this.spills = []; this.eventId = 0;
    const homeOrder = MAP.desks.map((_, i) => i);
    for (let i = homeOrder.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [homeOrder[i], homeOrder[j]] = [homeOrder[j], homeOrder[i]];
    }
    this.agents = RUNNERS.map((r, i) => {
      const homeIndex = homeOrder[i], desk = MAP.desks[homeIndex];
      return { ...r, speed: r.speed * (.9 + this.rand() * .2), homeIndex, home: { x: desk.targetX, z: desk.targetZ }, x: desk.targetX, z: desk.targetZ, vx: 0, vz: 0, heading: Math.PI, coffee: 0, carrying: false, state: 'Getting a cup', stage: 'cup', fallen: false, fallTimer: 0, cooldown: 1 + this.rand() * 2, slipCooldown: 0, progress: 0, wait: 0, path: [], moving: false, desk, steals: 0, falls: 0, delivered: false, strategy: { pace: i === 2 ? 'careful' : 'fast', route: this.rand() < (i === 2 ? .65 : i === 4 ? .45 : .1) ? 'detour' : 'direct', aggression: r.aggression }, routeLeg: false };
    });
    this.props = [{id:'chair-1',x:2.2,z:.9,vx:0,vz:0},{id:'chair-2',x:4.3,z:-2.1,vx:0,vz:0},{id:'chair-3',x:3,z:4.5,vx:0,vz:0}];
    this.log('Six agents. One coffee machine. What could go wrong?', 'info');
    for (const a of this.agents) this.route(a, MAP.cups);
  }
  log(text, type = 'info', actorId = null) {
    this.events.unshift({ id: `${this.round}-${++this.eventId}`, text, type, actorId, time: this.elapsed });
    this.events = this.events.slice(0, 25);
  }
  setStrategy(id, strategy) {
    const agent = this.agents.find(a => a.id === id);
    if (!agent || !strategy) return;
    agent.strategy = {
      pace: strategy.pace === 'careful' ? 'careful' : 'fast',
      route: strategy.route === 'detour' ? 'detour' : 'direct',
      aggression: Number.isFinite(strategy.aggression) ? clamp(strategy.aggression, 0, 1) : agent.strategy.aggression,
    };
  }
  route(agent, goal) { agent.path = pathTo(agent, goal); agent.goal = { ...goal }; }
  headHome(agent) {
    agent.wait = 0; agent.stage = 'delivery'; agent.routeLeg = agent.strategy.route === 'detour';
    agent.state = 'Bringing it home';
    this.route(agent, agent.routeLeg ? {x:1,z:5.4} : { x: agent.desk.targetX, z: agent.desk.targetZ });
  }
  spill(agent, amount, reason) {
    if (!agent.carrying || agent.coffee <= 0) return;
    const lost = clamp(Number.isFinite(amount) ? amount : 0, 0, agent.coffee);
    agent.coffee -= lost;
    if (lost > 5) this.spills.push({ id: `${this.round}-spill-${++this.eventId}`, x: agent.x, z: agent.z, radius: .45 + lost / 130, ttl: 36, born: this.elapsed });
    if (reason && lost > 8) this.log(`${agent.name} ${reason}. ${Math.round(agent.coffee)}% coffee left.`, 'spill', agent.id);
  }
  fall(agent, dx, dz, reason) {
    if (agent.fallen || agent.slipCooldown > 0) return;
    agent.fallen = true; agent.fallTimer = 1.6 + this.rand() * .65; agent.slipCooldown = 5; agent.falls++;
    agent.vx += dx * 2.4; agent.vz += dz * 2.4;
    agent.state = 'A brief horizontal meeting';
    agent.moving = false;
    this.spill(agent, 18 + this.rand() * 35, reason);
    if (!agent.carrying || agent.coffee === 0) this.log(`${agent.name} is having a floor moment.`, 'fall', agent.id);
  }
  step(dt) {
    if (this.finished) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = clamp(dt, 0, .1); this.elapsed += dt;
    this.spills = this.spills.filter(s => (s.ttl -= dt) > 0).slice(-32);
    for (const a of this.agents) {
      a.cooldown -= dt; a.slipCooldown -= dt;
      if (a.fallen) {
        a.fallTimer -= dt;
        if (a.fallTimer <= 0) {
          a.fallen = false;
          a.state = a.stage === 'delivery' ? 'Back on the clock' : 'Pretending that never happened';
          this.route(a, a.goal);
        }
      }
      if (a.wait > 0 && distance(a, a.goal) > 1.5) {
        a.wait = 0;
        this.route(a, a.goal);
      }
      if (a.wait > 0 && !a.fallen) {
        a.wait -= dt; a.moving = false;
        if (a.wait <= 0) {
          if (a.stage === 'cup') { a.carrying = true; a.stage = 'machine'; a.state = 'To the coffee machine'; this.route(a, MAP.machine); }
          else if (a.stage === 'machine') {
            a.coffee = 100; this.headHome(a); this.log(`${a.name} has a full cup. Confidence: unreasonable.`, 'coffee', a.id);
          }
        }
      } else if (!a.fallen) {
        if (a.stage === 'delivery' && a.coffee < 55) {
          a.stage = 'machine'; a.state = 'Emergency refill'; this.route(a, MAP.machine);
          this.log(`${a.name} is going back for a refill. Again.`, 'refill', a.id);
        }
        const target = a.path[0];
        if (target) {
          const dx = target.x - a.x, dz = target.z - a.z, d = Math.hypot(dx,dz);
          const stationArrival = a.stage !== 'delivery' && distance(a, a.goal) < .7;
          if (stationArrival) { a.path = []; a.moving = false; }
          else if (d < .19) a.path.shift();
          else {
            const speed = a.speed * (a.strategy.pace === 'careful' && a.coffee > 0 ? 1.15 : 1.45);
            a.vx += (dx / d * speed - a.vx) * Math.min(1, dt * 8);
            a.vz += (dz / d * speed - a.vz) * Math.min(1, dt * 8);
            a.heading = Math.atan2(dx,dz); a.moving = true;
          }
        } else if (distance(a, a.goal) > (a.stage === 'delivery' ? .3 : .8)) {
          a.moving = false;
          this.route(a, a.goal);
        } else {
          a.moving = false;
          if (a.stage === 'cup') { a.wait = .65; a.state = 'Acquiring a cup'; }
          else if (a.stage === 'machine') {
            const busy = this.agents.some(b => b !== a && b.stage === 'machine' && b.wait > 0);
            if (!busy) { a.wait = 2.6; a.state = 'Brewing something important'; }
            else { a.state = 'Patiently losing patience'; if (a.cooldown < 0 && this.rand() < dt * .2) this.log(`${a.name} would like to speak to the coffee machine.`, 'info', a.id); }
          } else if (a.stage === 'delivery' && a.routeLeg) {
            a.routeLeg = false; this.route(a,{ x:a.desk.targetX,z:a.desk.targetZ });
          } else if (a.stage === 'delivery' && a.coffee >= 55) {
            a.delivered = true; a.progress = 1; a.state = 'Employee of the minute'; this.winner = a.id; this.finished = true;
            this.log(`${a.name} delivered ${Math.round(a.coffee)}% of a coffee. It counts!`, 'win', a.id);
            return;
          }
        }
      }
      if (!a.moving || a.fallen) { a.vx *= Math.exp(-dt * 3); a.vz *= Math.exp(-dt * 3); }
      this.move(a,dt);
      if (!a.fallen && a.slipCooldown <= 0 && a.moving) {
        const puddle = this.spills.find(s => distance(a,s) < s.radius * .8 && this.elapsed - s.born > .7);
        if (puddle && this.rand() < dt * (a.strategy.pace === 'careful' ? .12 : .9)) this.fall(a, Math.sin(a.heading), Math.cos(a.heading), 'slipped on someone else’s problem');
      }
      if (!a.delivered) a.progress = a.stage === 'cup' ? .08 + Math.max(0,1-distance(a,MAP.cups)/20)*.18 : a.stage === 'machine' ? .3 + Math.max(0,1-distance(a,MAP.machine)/12)*.18 : .55 + Math.max(0,1-distance(a,{x:a.desk.targetX,z:a.desk.targetZ})/20)*.44;
    }
    for(let i=0;i<this.agents.length;i++) for(let j=i+1;j<this.agents.length;j++) this.collide(this.agents[i],this.agents[j],dt);
    for (const prop of this.props) {
      prop.vx *= Math.exp(-dt * 1.8); prop.vz *= Math.exp(-dt * 1.8); this.move(prop,dt,.38);
      for(const a of this.agents) {
        const d = distance(a,prop);
        if(d < .68 && d > .01) {
          const dx=(prop.x-a.x)/d,dz=(prop.z-a.z)/d;
          prop.vx+=dx*dt*12; prop.vz+=dz*dt*12;
          if(Math.hypot(prop.vx,prop.vz)>1.7 && !a.fallen) this.fall(a,-dx,-dz,'was outplayed by an office chair');
          a.vx -= dx * dt * 4; a.vz -= dz * dt * 4;
        }
      }
    }
  }
  move(body,dt,radius=.29) {
    const steps = Math.max(1, Math.ceil(Math.hypot(body.vx, body.vz) * dt / .2));
    for (let i = 0; i < steps; i++) {
      const nx=clamp(body.x+body.vx*dt/steps,-10.5,10.5),nz=clamp(body.z+body.vz*dt/steps,-6.5,6.5);
      if(!inside(nx,body.z,radius)) body.x=nx; else body.vx*=-.22;
      if(!inside(body.x,nz,radius)) body.z=nz; else body.vz*=-.22;
    }
  }
  collide(a,b,dt) {
    const d=distance(a,b); if(d<.01 || d>1.12) return;
    const dx=(b.x-a.x)/d,dz=(b.z-a.z)/d;
    if(d<.62) {
      const pressure=(.62-d)*dt*35;
      a.vx-=dx*pressure; a.vz-=dz*pressure; b.vx+=dx*pressure; b.vz+=dz*pressure;
    }
    const attacker = a.cooldown < b.cooldown ? a : b, victim = attacker===a?b:a;
    if(attacker.cooldown>0 || attacker.fallen || victim.fallen || this.rand()>dt*attacker.strategy.aggression*.9) return;
    attacker.cooldown=4+this.rand()*3;
    const sign=attacker===a?1:-1;
    if(victim.coffee>=55 && attacker.coffee<55 && attacker.carrying) {
      attacker.coffee=victim.coffee; victim.coffee=0; attacker.steals++; this.headHome(attacker);
      this.log(`${attacker.name} stole ${victim.name}’s coffee. Teamwork!`, 'steal', attacker.id);
    }
    this.fall(victim,dx*sign,dz*sign,`was gently reorganized by ${attacker.name}`);
    if(!victim.carrying) this.log(`${attacker.name} scheduled a collision with ${victim.name}.`, 'push', attacker.id);
  }
  finish() {
    if(this.finished) return this.winner;
    this.winner=null; this.finished=true; this.timedOut=true;
    this.log('Time! No coffee delivered. All bets are refunded.', 'draw');
    return this.winner;
  }
  snapshot() {
    return { elapsed:this.elapsed,winner:this.winner,finished:this.finished,timedOut:!!this.timedOut,
      agents:this.agents.map(({path,desk,strategy,goal,wait,...agent})=>({...agent,home:{...agent.home},pace:strategy.pace,route:strategy.route})),
      spills:this.spills.map(s=>({...s})),events:[...this.events],props:this.props.map(p=>({...p})) };
  }
}
