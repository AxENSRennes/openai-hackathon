import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAP, RUNNERS } from '../shared/simulation.js';

const COLORS = { cream: '#f5eddc', wall: '#b6c4a3', green: '#334b3d', dark: '#283c35', wood: '#d7ad77', coffee: '#70412b', gold: '#d4a15b', white: '#fff9ec' };
const clamp = THREE.MathUtils.clamp;

export class CoffeeScene {
  constructor(container) {
    this.container = container; this.disposed = false; this.mode = 'overview'; this.selected = 'pip'; this.state = null;
    this.characters = new Map(); this.puddles = new Map(); this.chairs = new Map(); this.particles = []; this.popups = []; this.seenEvents = new Set(); this.lastRound = null;
    this.materials = new Map(); this.textures = []; this.t = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9ecdf');
    this.scene.fog = new THREE.Fog('#e9ecdf', 52, 95);
    this.camera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 150);
    this.camera.position.set(25, 28, 31); this.target = new THREE.Vector3(0, 0, 0);
    this.camera.lookAt(this.target);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute('aria-label', 'Live three-dimensional office coffee race');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    const hemi = new THREE.HemisphereLight('#fff4da', '#6b8c78', 2); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0d3', 3.3);
    sun.position.set(-10, 24, 10); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 18, bottom: -18, near: .1, far: 70 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .035; sun.shadow.bias = -.0001;
    sun.shadow.radius = 4; this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#e8f2ff', 1.1); fill.position.set(16, 9, -15); this.scene.add(fill);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.buildRoom(); this.buildKitchen(); this.buildOffice(); this.buildDetails();
    this.steam = [];
    for(let i=0;i<7;i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:this.softTexture(),color:'#fff9eb',opacity:.25,transparent:true,depthWrite:false}));
      this.world.add(sprite); this.steam.push(sprite);
    }
    for(const [i,runner] of RUNNERS.entries()) this.makeCharacter(runner,i);
    this.selection = new THREE.Mesh(new THREE.RingGeometry(.48,.54,48),new THREE.MeshBasicMaterial({color:'#d7ed66',side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));
    this.selection.rotation.x=-Math.PI/2; this.selection.position.y=.065; this.world.add(this.selection);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.onPointer = event => this.pick(event);
    this.renderer.domElement.addEventListener('pointerup',this.onPointer);
    this.clock = new THREE.Clock(); this.resize();
    this.renderer.setAnimationLoop(() => this.animate());
  }
  material(color, options={}) {
    const key = color+JSON.stringify(options);
    if(!this.materials.has(key)) this.materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.82,metalness:0,...options}));
    return this.materials.get(key);
  }
  mesh(geometry,color,parent=this.world,options={}) {
    const mesh=new THREE.Mesh(geometry,this.material(color,options)); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
  }
  box(x,y,z,w,h,d,color,parent=this.world,radius=.06) {
    const geometry=radius>0?new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/3,h/3,d/3)):new THREE.BoxGeometry(w,h,d);
    const mesh=this.mesh(geometry,color,parent); mesh.position.set(x,y,z); return mesh;
  }
  cylinder(x,y,z,rt,rb,height,color,parent=this.world,segments=20) {
    const mesh=this.mesh(new THREE.CylinderGeometry(rt,rb,height,segments),color,parent); mesh.position.set(x,y,z); return mesh;
  }
  sphere(x,y,z,r,color,parent=this.world,sx=1,sy=1,sz=1) {
    const mesh=this.mesh(new THREE.SphereGeometry(r,16,12),color,parent); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); return mesh;
  }
  group(x=0,y=0,z=0,parent=this.world) { const group=new THREE.Group();group.position.set(x,y,z);parent.add(group);return group; }
  softTexture() {
    if(this.blurTexture) return this.blurTexture;
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    this.blurTexture=new THREE.CanvasTexture(canvas);this.textures.push(this.blurTexture);return this.blurTexture;
  }
  text(content,{color='#2e4438',background=null,size=1,width=512,height=160,font=60}={}) {
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(background){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${font}px 'Arial',sans-serif`;
    const lines=content.split('\n');lines.forEach((line,i)=>ctx.fillText(line,width/2,height/2+(i-(lines.length-1)/2)*font*1.05));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;this.textures.push(texture);
    const mat=new THREE.MeshBasicMaterial({map:texture,transparent:!background,side:THREE.DoubleSide,depthWrite:false});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(size*width/height,size),mat);return plane;
  }
  plant(x,z,scale=1) {
    const group=this.group(x,0,z);group.scale.setScalar(scale);
    this.cylinder(0,.32,0,.34,.25,.64,'#d58a67',group);
    this.cylinder(0,.63,0,.29,.29,.03,'#5e4834',group);
    for(let i=0;i<7;i++) {
      const angle=i*2.399;
      const leaf=this.sphere(Math.sin(angle)*.21,.95+(i%3)*.17,Math.cos(angle)*.21,.3,i%2?'#50765a':'#6d9267',group,.45,1.5,.8);
      leaf.rotation.set(Math.sin(angle)*.3,angle,Math.cos(angle)*.4);
    }
  }
  cup(x,y,z,color=COLORS.white,parent=this.world,scale=1) {
    const group=this.group(x,y,z,parent);group.scale.setScalar(scale);
    const profile=[new THREE.Vector2(.145,0),new THREE.Vector2(.18,.3),new THREE.Vector2(.145,.3),new THREE.Vector2(.12,.035)];
    this.mesh(new THREE.LatheGeometry(profile,20),color,group);
    const handle=this.mesh(new THREE.TorusGeometry(.09,.032,8,16),color,group);handle.position.set(.19,.17,0);
    const liquid=this.cylinder(0,.245,0,.14,.14,.015,COLORS.coffee,group);group.userData.liquid=liquid;
    return group;
  }
  buildRoom() {
    this.box(0,-.65,0,23.1,.9,15.1,COLORS.green,this.world,.2);
    this.box(0,-.12,0,22.6,.25,14.6,'#d2bd97',this.world,.12);
    this.box(0,-.01,0,22.2,.08,14.2,'#e6d0ab',this.world,.03);
    for(let x=-10.5;x<-.9;x+=1) for(let z=-6.5;z<7;z+=1) this.box(x,.045,z,.975,.025,.975,(Math.round(x+z)%2===0)?'#e4e5cb':'#f3eddc',this.world,.012);
    for(let z=-6.6;z<7;z+=.65) {
      this.box(5.15,.045,z,11.25,.03,.625,Math.round(z*10)%3===0?'#dfbd8e':'#e4c79b',this.world,.006);
      for(let x=1.5;x<10.5;x+=3) this.box(x+(Math.round(z*10)%2)*.6,.063,z,.018,.006,.6,'#c4a574',this.world,0);
    }
    this.box(0,1.42,-7.08,22.4,2.85,.22,'#b6c4a3');
    this.box(-11.08,1.42,0,.22,2.85,14.4,'#d2d7bb');
    this.box(0,.17,7.08,22.4,.34,.2,'#f2e6ce');
    this.box(11.08,.17,0,.2,.34,14.4,'#f2e6ce');
    this.box(0,.2,-6.91,22,.3,.12,'#f1e5cd');
    this.box(-10.91,.2,0,.12,.3,14,'#f1e5cd');
    for(const x of [2.2,6.4]) {
      this.box(x,1.8,-6.89,3.3,1.6,.12,'#f7f0d8');
      this.box(x,1.8,-6.79,3.04,1.34,.08,'#a8d3d0');
      this.box(x,1.8,-6.72,.08,1.4,.08,'#faf3df');
      this.box(x,1.8,-6.71,3.08,.08,.08,'#faf3df');
      this.box(x,1.04,-6.63,3.5,.11,.45,'#f6ead0');
    }
    for(const o of MAP.obstacles.filter(o=>o.type==='partition')) {
      this.box(o.x,.52,o.z,o.w,1.04,o.d,'#79977d');
      this.box(o.x,1.08,o.z,o.w+.12,.15,o.d+.1,'#e5c89e');
      this.box(o.x,1.8,o.z,.09,1.3,o.d,'#a0bbaa',this.world,.01).material=this.material('#a0bbaa',{transparent:true,opacity:.23,depthWrite:false});
      for(const dz of [-o.d/2,0,o.d/2]) this.box(o.x,1.76,o.z+dz,.15,1.4,.08,'#d7ba8c');
      this.box(o.x,2.43,o.z,.15,.1,o.d,'#d7ba8c');
    }
    this.box(-.8,2.45,-.05,.35,.22,2.8,'#d7ba8c');
    const sign=this.text('NO RUNNING',{size:.28,width:512,height:110,font:52,background:'#f6eacb'});sign.position.set(-.54,2.43,-.02);sign.rotation.y=Math.PI/2;this.world.add(sign);
    this.door=this.group(-.8,0,1.16);this.box(0,.85,-.52,.1,1.55,1.08,'#edc46e',this.door);
    const doorGlass=this.box(.005,1.1,-.52,.11,.57,.62,'#acd3cc',this.door,.03);doorGlass.material=this.material('#acd3cc',{transparent:true,opacity:.65});
    this.sphere(.13,.8,-.9,.07,COLORS.gold,this.door);
  }
  buildKitchen() {
    const counter = (x,z,w,d) => {
      this.box(x,.48,z,w,.96,d,'#74977a');
      this.box(x,1.01,z,w+.13,.16,d+.12,'#fbefd9');
      for(let px=x-w/2+.5;px<x+w/2;px+=.75) {
        this.box(px,.48,z+d/2+.015,.65,.71,.03,'#83a087');
        this.box(px,.77,z+d/2+.06,.22,.035,.04,'#dabb7c');
      }
    };
    counter(-10,-5.3,2.7,1.7);counter(-9.6,4.7,3.2,1.35);
    counter(-5.5,-.3,2.5,2.5);
    this.box(-9.85,1.71,-5.35,1.7,1.28,1.15,'#cf6546',this.world,.12);
    this.box(-9.85,1.57,-4.74,1.38,.82,.08,'#353d37');
    this.box(-9.85,1.16,-4.58,1.52,.1,.49,'#535b50');
    for(const x of [-10.3,-9.84,-9.4]) {
      this.sphere(x,1.91,-4.67,.07,x===-9.84?'#d7ed66':'#faf4df');
      this.cylinder(x,1.45,-4.49,.045,.045,.25,'#d5d2b7');
    }
    this.cup(-9.85,1.2,-4.43);
    this.cylinder(-9.85,2.45,-5.35,.45,.31,.52,'#565447');
    this.cylinder(-9.85,2.72,-5.35,.47,.47,.06,COLORS.dark);
    const label=this.text('COFFEE',{size:.48,width:512,height:120,font:78,color:'#fcf3dc'});label.position.set(-9.85,2.68,-6.89);this.world.add(label);
    for(let i=0;i<6;i++) this.cup(-10.6+(i%3)*.5,1.1+Math.floor(i/3)*.3,4.55, i%2?'#eeb867':COLORS.white);
    const tray=this.box(-9.0,1.12,4.8,.85,.05,.55,'#d3ad76');
    this.cylinder(-8.85,1.2,4.78,.15,.15,.12,'#bc754e');
    const cupsLabel=this.text('CUPS',{size:.28,width:256,height:80,font:52});cupsLabel.position.set(-9.5,1.2,5.42);this.world.add(cupsLabel);
    this.box(-5.65,1.14,-.4,1.4,.08,1.2,'#c89966');
    this.cup(-5.9,1.2,-.7,'#e2b85a');this.cup(-5.2,1.2,-.1);
    const donut=this.mesh(new THREE.TorusGeometry(.2,.085,8,20),'#bd8254');donut.rotation.x=Math.PI/2;donut.position.set(-5.2,1.26,-.8);
    const icing=this.mesh(new THREE.TorusGeometry(.2,.052,8,20),'#e7a0a8');icing.rotation.x=Math.PI/2;icing.position.set(-5.2,1.32,-.8);
    this.box(-5.6,1.19,.35,.65,.03,.4,'#fbf2d9');
    for(let i=0;i<3;i++)this.box(-5.57+i*.12,1.21,.35,.025,.006,.24,'#adae90',this.world,0);
    this.plant(-10.3,6.1,.8);this.plant(-2.3,-5.9,1.15);
    const poster=this.text('BUT FIRST,\nCOFFEE.',{background:'#f4dfad',color:'#7a6741',width:320,height:400,font:43,size:1.5});poster.position.set(-10.92,1.85,1);poster.rotation.y=Math.PI/2;this.world.add(poster);
    this.box(-8, .06,-3.5,2.6,.018,1.9,'#bd795b',this.world,.1);
    const matLabel=this.text('PLEASE QUEUE',{color:'#f6dfb7',size:.25,width:512,height:100,font:48});matLabel.rotation.x=-Math.PI/2;matLabel.position.set(-8,.077,-3.3);this.world.add(matLabel);
  }
  chair(x,z,color='#849882') {
    const g=this.group(x,0,z);
    this.cylinder(0,.33,0,.06,.06,.5,'#6c7265',g);
    for(let i=0;i<5;i++) {
      const angle=i*Math.PI*2/5;
      const spoke=this.box(Math.sin(angle)*.18,.1,Math.cos(angle)*.18,.06,.06,.43,'#737b6e',g,.02);spoke.rotation.y=angle;
      this.sphere(Math.sin(angle)*.35,.09,Math.cos(angle)*.35,.07,'#3d5044',g);
    }
    this.box(0,.62,0,.71,.18,.71,color,g,.09);
    this.box(0,1.02,.3,.72,.72,.15,color,g,.1);
    this.box(-.43,.85,0,.1,.08,.52,'#5e7362',g);this.box(.43,.85,0,.1,.08,.52,'#5e7362',g);
    return g;
  }
  buildOffice() {
    this.deskMarks=[];
    MAP.desks.forEach((desk,i)=>{
      const {x,z}=desk;
      for(const dx of [-.78,.78]) for(const dz of [-.42,.42]) this.box(x+dx,.45,z+dz,.1,.9,.1,'#a37d50');
      this.box(x,.98,z,2.12,.18,1.3,'#f4dfb7');
      this.box(x,.87,z+.46,1.65,.22,.12,'#c5a077');
      const deskMat=this.box(x+.07,1.086,z+.03,1.52,.025,.81,RUNNERS[i].color,this.world,.05);
      deskMat.material=deskMat.material.clone();this.deskMarks.push(deskMat);
      this.box(x,1.18,z-.31,.12,.22,.12,'#68776a');
      this.box(x,1.57,z-.35,1.03,.65,.1,'#455c51');
      this.box(x,1.57,z-.285,.88,.51,.015,'#b2c9ad',this.world,.018);
      for(let line=0;line<3;line++) this.box(x-.1+(line%2)*.08,1.66-line*.12,z-.272,.49-line*.07,.025,.008,line===0?'#6e957d':'#88aa92',this.world,0);
      this.box(x,1.12,z+.27,.7,.04,.22,'#f8f1dc');
      for(let j=0;j<6;j++) this.box(x-.27+j*.1,1.15,z+.27,.04,.014,.12,'#c9cdb5',this.world,0);
      this.box(x+.55,1.12,z+.2,.12,.05,.18,'#f8f1dc');
      this.box(x-.75,1.16,z-.2,.2,.2,.2,'#e7b974');
      for(let j=0;j<3;j++) this.cylinder(x-.82+j*.06,1.4,z-.2,.014,.014,.35,j===0?'#d78358':'#697b5e');
      const homeRing=this.mesh(new THREE.RingGeometry(.35,.4,40),RUNNERS[i].color);homeRing.material=homeRing.material.clone();homeRing.rotation.x=-Math.PI/2;homeRing.position.set(desk.targetX,.067,desk.targetZ);this.deskMarks.push(homeRing);
      this.chair(x,z-.95,'#87977c');
    });
    for(const p of [{id:'chair-1',x:2.2,z:.9},{id:'chair-2',x:4.3,z:-2.1},{id:'chair-3',x:3,z:4.5}])this.chairs.set(p.id,this.chair(p.x,p.z,'#e9b95f'));
    this.plant(10,-6,1.2);this.plant(10,6.15,.85);this.plant(1.5,-5.7,.7);
    const floorText=this.text('MONDAY INC.',{color:'#a28c65',size:.55,width:640,height:140,font:75});floorText.rotation.x=-Math.PI/2;floorText.position.set(3,.068,5.7);this.world.add(floorText);
  }
  buildDetails() {
    const poster=this.text('DO LESS.\nSPILL MORE.',{background:'#f6e5b4',color:'#557451',width:400,height:320,font:52,size:1.6});poster.position.set(-4.8,1.8,-6.91);this.world.add(poster);
    this.cylinder(-.3,2.03,-6.88,.42,.42,.09,COLORS.white).rotation.x=Math.PI/2;
    this.clockHands=this.group(-.3,2.03,-6.79);
    const clockFace=this.mesh(new THREE.CircleGeometry(.35,36),'#f9f2de',this.clockHands);
    const hour=this.box(0,.08,.02,.035,.22,.02,COLORS.dark,this.clockHands,.01);hour.rotation.z=-.8;
    this.secondHand=this.box(0,.12,.04,.018,.3,.015,'#d87450',this.clockHands,.004);
    for(let i=0;i<4;i++)this.box(-7.1+i*.18,.025,6.1,.07,.02,.5,'#e0ba6c',this.world,0);
    const sign=this.text('COFFEE RUN',{color:'#f7e6bf',size:.5,width:640,height:130,font:78});sign.position.set(1.4,-.52,7.57);this.world.add(sign);
    for(let i=0;i<5;i++) {
      const paper=this.box(2.1+i*.24,.08,1.8+i*.16,.38,.015,.5,'#f7f0dc',this.world,.005);paper.rotation.y=i*.4;
    }
  }
  makeCharacter(runner,index) {
    const root=this.group();const body=this.group(0,0,0,root);
    const ring=this.mesh(new THREE.CircleGeometry(.35,32),runner.color,root);ring.rotation.x=-Math.PI/2;ring.position.y=.065;ring.material=this.material(runner.color,{transparent:true,opacity:.3,depthWrite:false});
    const torso=this.mesh(new THREE.CapsuleGeometry(.28,.34,5,12),runner.color,body);torso.position.y=.92;
    this.box(0,1.11,.25,.13,.22,.025,'#fcf2db',body,.02);
    const tie=this.mesh(new THREE.ConeGeometry(.06,.24,4),'#394d43',body);tie.position.set(0,1.09,.29);tie.rotation.z=Math.PI;
    const head=this.group(0,1.55,0,body);
    const skin=['#f3c99b','#cf946b','#e2b487','#bd815e','#efcda5','#e7bfa2'][index];
    this.sphere(0,0,0,.36,skin,head,1,1.06,.95);
    const hair=['#805b3d','#b68542','#3b4132','#4a3329','#6a4e3c','#9a7854'][index];
    this.sphere(0,.18,-.06,.34,hair,head,1,.65,.95);
    for(let i=0;i<3;i++)this.sphere(-.19+i*.16,.23,.15,.13,hair,head,1,.8,1);
    this.sphere(-.34,-.01,0,.08,skin,head);this.sphere(.34,-.01,0,.08,skin,head);
    this.sphere(-.12,.015,.31,.045,'#2c352d',head,.75,1,1);this.sphere(.12,.015,.31,.045,'#2c352d',head,.75,1,1);
    this.sphere(0,-.045,.34,.065,skin,head,.75,1,1);
    this.box(0,-.17,.312,.09,.022,.02,'#a76746',head,.009);
    if(index===4) {
      for(const x of [-.12,.12]) {const lens=this.mesh(new THREE.TorusGeometry(.095,.017,6,16),'#3a4b42',head);lens.position.set(x,.015,.35);}
      this.box(0,.02,.35,.07,.015,.02,'#3a4b42',head,.002);
    }
    if(index===1) {
      this.sphere(0,.24,0,.37,'#e9ba4c',head,1,.55,1);
      this.box(0,.22,.31,.45,.05,.34,'#e9ba4c',head,.05);
    }
    const legs=[];
    for(const side of [-1,1]) {
      const leg=this.group(side*.13,.64,0,body);
      this.box(0,-.18,0,.18,.4,.2,'#3a4c43',leg,.07);
      this.box(0,-.4,.075,.23,.14,.35,'#f5e8ce',leg,.055);legs.push(leg);
    }
    const arms=[];
    for(const side of [-1,1]) {
      const arm=this.group(side*.32,1.13,0,body);
      this.mesh(new THREE.CapsuleGeometry(.1,.25,4,8),runner.color,arm).position.y=-.15;
      this.sphere(0,-.4,.015,.115,skin,arm);arms.push(arm);
    }
    const mug=this.cup(0,-.34,.16,COLORS.white,arms[1],1.1);mug.visible=false;
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=104;
    const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;this.textures.push(labelTexture);
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture,transparent:true,depthTest:false}));label.position.y=2.35;label.scale.set(1.65,.67,1);label.renderOrder=10;root.add(label);
    this.characters.set(runner.id,{root,body,head,arms,legs,mug,label,labelCanvas,labelTexture,labelKey:'',runner,target:null,phase:index*1.7});
    const home=MAP.desks[index];root.position.set(home.targetX,0,home.targetZ);
    this.updateLabel(this.characters.get(runner.id),{coffee:0,carrying:false});
  }
  updateLabel(character,agent) {
    const coffee=Math.round(agent.coffee||0),key=`${coffee}-${agent.carrying}-${agent.fallen}`;
    if(character.labelKey===key)return;character.labelKey=key;
    const c=character.labelCanvas.getContext('2d');c.clearRect(0,0,256,104);
    c.fillStyle='#fff9ec';c.beginPath();c.roundRect(8,8,240,78,22);c.fill();
    c.fillStyle=character.runner.color;c.beginPath();c.arc(37,40,10,0,Math.PI*2);c.fill();
    c.fillStyle='#293e33';c.font='800 30px Arial';c.textAlign='left';c.fillText(character.runner.name,58,50);
    if(agent.carrying) {
      c.fillStyle='#e7deca';c.beginPath();c.roundRect(27,65,200,8,4);c.fill();
      if(coffee>0){c.fillStyle=coffee>=55?'#81954e':'#d86a49';c.beginPath();c.roundRect(27,65,200*coffee/100,8,4);c.fill();}
    }
    if(agent.fallen){c.fillStyle='#c2583b';c.font='900 32px Arial';c.fillText('!',215,49);}
    character.labelTexture.needsUpdate=true;
  }
  update(state) {
    if(!state)return;this.state=state;
    if(this.lastRound!==state.round){
      this.lastRound=state.round;this.seenEvents.clear();
      for(const p of this.puddles.values()){this.world.remove(p);p.geometry.dispose();p.material.dispose();}this.puddles.clear();
    }
    for(const agent of state.agents||[]) {
      const char=this.characters.get(agent.id);if(!char)continue;
      char.target=agent;this.updateLabel(char,agent);
      if(Number.isInteger(agent.homeIndex)) {
        const mat=this.deskMarks[agent.homeIndex*2];const ring=this.deskMarks[agent.homeIndex*2+1];
        mat?.material.color.set(char.runner.color);ring?.material.color.set(char.runner.color);
      }
    }
    const ids=new Set();
    for(const spill of state.spills||[]) {
      ids.add(spill.id);let mesh=this.puddles.get(spill.id);
      if(!mesh){
        const shape=new THREE.Shape();
        for(let i=0;i<=30;i++){const angle=i/30*Math.PI*2,r=1+Math.sin(i*2.8)*.11;const x=Math.cos(angle)*r,z=Math.sin(angle)*r*.72;i===0?shape.moveTo(x,z):shape.lineTo(x,z);}
        mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:'#865636',roughness:.22,transparent:true,opacity:.82,depthWrite:false}));
        mesh.rotation.x=-Math.PI/2;mesh.position.set(spill.x,.082,spill.z);mesh.scale.setScalar(spill.radius);mesh.receiveShadow=true;this.world.add(mesh);this.puddles.set(spill.id,mesh);
      }
      mesh.material.opacity=Math.min(.85,spill.ttl/4);
    }
    for(const [id,puddle]of this.puddles)if(!ids.has(id)){this.world.remove(puddle);puddle.geometry.dispose();puddle.material.dispose();this.puddles.delete(id);}
    for(const prop of state.props||[]){const chair=this.chairs.get(prop.id);if(chair)chair.userData.target=prop;}
    for(const event of state.events||[]) {
      if(this.seenEvents.has(event.id))continue;this.seenEvents.add(event.id);
      if(['spill','fall','steal','push'].includes(event.type)){
        const char=this.characters.get(event.actorId);
        if(char){this.burst(char.root.position,event.type==='steal'?'#e0bb57':COLORS.coffee);this.popup(char.root.position,event.type);}
      }
      if(event.type==='win')this.confetti();
    }
  }
  burst(position,color) {
    for(let i=0;i<10;i++){
      const mesh=this.sphere(position.x,.7,position.z,.045+Math.random()*.035,color);
      this.particles.push({mesh,vx:(Math.random()-.5)*3,vy:2+Math.random()*2,vz:(Math.random()-.5)*3,life:.8+Math.random()*.6});
    }
  }
  popup(position,type) {
    const labels={steal:'COFFEE HEIST!',fall:'FLOOR MEETING',spill:'SPILLED IT!',push:'EXCUSE ME!'};
    const plane=this.text(labels[type]||'WHOOPS',{background:type==='steal'?'#dfec81':'#e99163',color:'#293e33',size:.4,width:512,height:100,font:47});
    this.textures=this.textures.filter(texture=>texture!==plane.material.map);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:plane.material.map,transparent:true,depthTest:false}));
    plane.geometry.dispose();plane.material.dispose();
    sprite.scale.set(2.7,.53,1);sprite.position.copy(position);sprite.position.y=2.7;sprite.renderOrder=12;this.world.add(sprite);
    this.popups.push({sprite,life:2.3});
  }
  confetti() {
    for(let i=0;i<70;i++){
      const mesh=this.box((Math.random()-.5)*15,6+Math.random()*4,(Math.random()-.5)*10,.12,.03,.22,RUNNERS[i%6].color);
      this.particles.push({mesh,vx:(Math.random()-.5)*2,vy:-1,vz:(Math.random()-.5)*2,life:5,confetti:true});
    }
  }
  setCamera(mode) {this.mode=mode==='track'?'track':'overview';}
  focusRunner(id) {if(this.characters.has(id))this.selected=id;}
  pick(event) {
    const rect=this.renderer.domElement.getBoundingClientRect();
    const p=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(p,this.camera);
    for(const hit of ray.intersectObjects([...this.characters.values()].map(c=>c.root),true)) {
      for(const [id,char]of this.characters) {
        let current=hit.object;
        while(current){if(current===char.root){this.selected=id;this.container.dispatchEvent(new CustomEvent('runnerselect',{detail:{id}}));return;}current=current.parent;}
      }
    }
  }
  resize() {
    const w=this.container.clientWidth||900,h=this.container.clientHeight||600;
    this.renderer.setSize(w,h,false);
    const aspect=w/h,vertical=Math.max(19.2,30/aspect);
    this.camera.left=-vertical*aspect/2;this.camera.right=vertical*aspect/2;this.camera.top=vertical/2;this.camera.bottom=-vertical/2;
    this.baseVertical=vertical;this.camera.updateProjectionMatrix();
  }
  animate() {
    if(this.disposed)return;
    const dt=Math.min(this.clock.getDelta(),.05);this.t+=dt;
    for(const [id,char]of this.characters) {
      const a=char.target;
      if(!a){char.body.position.y=Math.sin(this.t*2+char.phase)*.02;continue;}
      const root=char.root,lerp=1-Math.exp(-dt*14),moving=!!a.moving&&this.state.phase==='racing'&&!a.fallen;
      if(root.position.distanceTo(new THREE.Vector3(a.x,0,a.z))>15)root.position.set(a.x,0,a.z);
      root.position.x=THREE.MathUtils.lerp(root.position.x,a.x,lerp);root.position.z=THREE.MathUtils.lerp(root.position.z,a.z,lerp);
      const angle=a.heading||0;
      char.body.rotation.y+=Math.atan2(Math.sin(angle-char.body.rotation.y),Math.cos(angle-char.body.rotation.y))*Math.min(1,dt*10);
      char.body.rotation.z=THREE.MathUtils.damp(char.body.rotation.z,a.fallen?1.48:0,12,dt);
      char.body.position.y=THREE.MathUtils.damp(char.body.position.y,a.fallen?.28:(moving?Math.abs(Math.sin(this.t*11+char.phase))*.09:Math.sin(this.t*2+char.phase)*.018),12,dt);
      char.head.rotation.z=Math.sin(this.t*3+char.phase)*.035;
      for(let i=0;i<2;i++) {
        const swing=moving?Math.sin(this.t*11+char.phase+i*Math.PI):0;
        char.legs[i].rotation.x=THREE.MathUtils.damp(char.legs[i].rotation.x,swing*.65,15,dt);
        char.arms[i].rotation.x=THREE.MathUtils.damp(char.arms[i].rotation.x,a.carrying?(i===1?-1.25:-.35):-swing*.55,12,dt);
        char.arms[i].rotation.z=a.fallen?(i===0?.8:-.8):(i===0?.1:-.1);
      }
      char.mug.visible=!!a.carrying;char.mug.userData.liquid.visible=a.coffee>0;
      char.mug.userData.liquid.position.y=.04+.21*clamp(a.coffee/100,0,1);
      char.mug.rotation.x=-char.arms[1].rotation.x;
      char.mug.rotation.z=moving?Math.sin(this.t*11+char.phase)*.1:0;
      char.label.position.y=a.fallen?1.15:2.35;
      if(id===this.selected)this.selection.position.set(root.position.x,.09,root.position.z);
    }
    for(const [id,chair]of this.chairs){const p=chair.userData.target;if(!p)continue;chair.position.x=THREE.MathUtils.damp(chair.position.x,p.x,12,dt);chair.position.z=THREE.MathUtils.damp(chair.position.z,p.z,12,dt);chair.rotation.y+=(p.vx+p.vz)*dt*.8;}
    for(let i=0;i<this.steam.length;i++){
      const phase=(this.t*.35+i/this.steam.length)%1;
      this.steam[i].position.set(-9.85+Math.sin(this.t+i)*.15,2.1+phase*1.3,-4.8+Math.cos(this.t*.6+i)*.12);
      this.steam[i].scale.setScalar(.25+phase*.65);this.steam[i].material.opacity=Math.sin(phase*Math.PI)*.3;
    }
    const near=(this.state?.agents||[]).filter(a=>Math.abs(a.x+.8)<1.5&&Math.abs(a.z)<1.7);
    this.door.rotation.y=THREE.MathUtils.damp(this.door.rotation.y,near.length?Math.sin(this.t*4)*1.25:.1,6,dt);
    this.secondHand.rotation.z=-this.t*.3;
    this.particles=this.particles.filter(p=>{
      p.life-=dt;p.vy-=dt*(p.confetti?.25:7);p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;
      if(p.confetti){p.mesh.rotation.x+=dt*3;p.mesh.rotation.z+=dt*2;}
      if(p.life<=0||p.mesh.position.y<.08){this.world.remove(p.mesh);p.mesh.geometry.dispose();return false;}return true;
    });
    this.popups=this.popups.filter(p=>{
      p.life-=dt;p.sprite.position.y+=dt*.25;p.sprite.material.opacity=Math.min(1,p.life*2);
      if(p.life<=0){this.world.remove(p.sprite);p.sprite.material.map.dispose();p.sprite.material.dispose();return false;}return true;
    });
    const aspect=this.container.clientWidth/Math.max(1,this.container.clientHeight);
    if(this.mode==='track'){
      const char=this.characters.get(this.selected);if(char){this.target.lerp(new THREE.Vector3(char.root.position.x,.5,char.root.position.z),1-Math.exp(-dt*3));}
    }else this.target.lerp(new THREE.Vector3(0,.4,0),1-Math.exp(-dt*3));
    this.camera.position.copy(this.target).add(new THREE.Vector3(25,28,31));this.camera.lookAt(this.target);
    const desired=this.mode==='track'?Math.max(8,12/aspect):this.baseVertical;
    const vertical=THREE.MathUtils.damp(this.camera.top*2,desired,4,dt);
    this.camera.left=-vertical*aspect/2;this.camera.right=vertical*aspect/2;this.camera.top=vertical/2;this.camera.bottom=-vertical/2;this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    this.disposed=true;this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerup',this.onPointer);
    this.scene.traverse(object=>{object.geometry?.dispose();if(object.material?.map)object.material.map.dispose();});
    for(const m of this.materials.values())m.dispose();for(const texture of this.textures)texture.dispose();
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
