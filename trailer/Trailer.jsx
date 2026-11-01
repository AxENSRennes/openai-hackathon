import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { World } from './World.jsx';
import { FPS, shotAt, subtitleAt } from './timeline.mjs';

const cream = '#fff3d5', green = '#203b30', lime = '#d3ee86';
const mono = '"DejaVu Sans Mono", monospace';
const title = { fontFamily: 'Barlow, sans-serif', fontWeight: 900, lineHeight: .92, letterSpacing: -1 };
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const ease = t => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;

function Eyebrow({ children, style }) {
  return <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', ...style }}>{children}</div>;
}
function Cup({ size = 100, color = cream }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><path d="M13 22h33v23a9 9 0 0 1-9 9H22a9 9 0 0 1-9-9V22Zm33 4h5a9 9 0 0 1 0 18h-5M23 13V7m13 6V7" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Trailer() {
  const frame = useCurrentFrame(), seconds = frame / FPS, shot = shotAt(seconds), subtitle = subtitleAt(seconds);
  const [fontHandle] = useState(() => delayRender('Loading the trailer typography'));
  useEffect(() => {
    Promise.all([document.fonts.load('900 100px Barlow'), document.fonts.load('600 24px DM')])
      .then(() => continueRender(fontHandle));
  }, [fontHandle]);
  const enter = ease(shot.time * 2.8);
  const introIndex = Math.min(2, Math.floor(seconds / 2));
  const introLocal = seconds % 2;
  const words = [['WRITE', 'CODE.', 'Build complete.'], ['FIX', 'BUGS.', 'All tests passed.'], ['SHIP', 'APPS.', 'Deployment successful.']][introIndex];
  const isWorld = !['intro', 'logo'].includes(shot.id);
  return <AbsoluteFill style={{ background: green, color: cream, fontFamily: 'DM, Arial, sans-serif', overflow: 'hidden' }}>
    <style>{`@font-face{font-family:Barlow;src:url('${staticFile('fonts/BarlowCondensed-Black.ttf')}')}@font-face{font-family:DM;src:url('${staticFile('fonts/DMSans.ttf')}')}*{box-sizing:border-box}`}</style>
    {isWorld && <World shot={shot} frame={frame} />}
    {isWorld && shot.id !== 'question' && <AbsoluteFill style={{ background: 'linear-gradient(180deg,rgba(12,27,21,.4),transparent 35%,transparent 65%,rgba(12,27,21,.65))', pointerEvents: 'none' }} />}
    {shot.id === 'bet' && <AbsoluteFill style={{ background: 'linear-gradient(90deg,#203b30ed,#203b30bb 38%,transparent 67%)' }} />}

    {shot.id === 'intro' && <AbsoluteFill style={{ padding: '49px 65px', background: cream, color: green }}>
      <Eyebrow>Artificial intelligence. Incredible progress.</Eyebrow>
      <div style={{ display: 'flex', height: '84%', alignItems: 'center', justifyContent: 'space-between' }}>
        <div key={introIndex} style={{ ...title, fontSize: 171, transform: `translateY(${(1 - ease(introLocal * 4)) * 45}px)`, opacity: ease(introLocal * 4) }}>
          {words[0]}<br /><span style={{ color: introIndex === 1 ? '#b65837' : '#527d58' }}>{words[1]}</span>
        </div>
        <div style={{ width: 385, height: 280, background: green, color: cream, padding: 30, borderRadius: 15, transform: 'rotate(-3deg)', boxShadow: '13px 18px 0 #203b3020', fontFamily: mono }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>{['#ee9260', '#edcc70', '#b9df7b'].map(c => <span key={c} style={{ width: 10, height: 10, background: c, borderRadius: 8 }} />)}</div>
          <div style={{ fontSize: 15, color: '#b0c2ad', marginBottom: 22 }}>agent@your-project ~</div>
          <div style={{ fontSize: 21, lineHeight: 1.7 }}><span style={{ color: lime }}>✓</span> {words[2]}<br /><span style={{ opacity: .4 }}>Waiting for next task_</span></div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 94, left: 69, height: 4, width: 1140, background: '#203b3020' }}><div style={{ height: 4, width: `${Math.min(100, seconds / 6 * 100)}%`, background: green }} /></div>
    </AbsoluteFill>}

    {shot.id === 'question' && <div style={{ position: 'absolute', left: 64, top: 185, maxWidth: 550, color: green, transform: `translateY(${(1 - enter) * 18}px)`, opacity: enter }}>
      <Eyebrow style={{ marginBottom: 23 }}>One small problem.</Eyebrow>
      <div style={{ ...title, fontSize: 88 }}>WHAT ABOUT<br />THE COFFEE?</div>
      <div style={{ fontFamily: mono, fontSize: 14, marginTop: 28, letterSpacing: 1.6 }}>TASK STATUS: UNRESOLVED</div>
    </div>}

    {shot.id === 'lineup' && <div style={{ position: 'absolute', top: 47, left: 60, opacity: enter }}>
      <Eyebrow>Introducing your new colleagues.</Eyebrow>
      <div style={{ ...title, fontSize: 80, marginTop: 12 }}>BODIES INCLUDED.</div>
    </div>}
    {shot.id === 'brew' && <div style={{ position: 'absolute', top: 54, right: 60, textAlign: 'right' }}><Eyebrow>The mission</Eyebrow><div style={{ ...title, fontSize: 85, marginTop: 10 }}>ONE COFFEE.</div></div>}
    {shot.id === 'carry' && <div style={{ position: 'absolute', top: 54, left: 60 }}><Eyebrow>One simple task.</Eyebrow></div>}
    {shot.id === 'slow' && <>
      <div style={{ position: 'absolute', top: 50, left: 60, fontFamily: mono, fontSize: 14, letterSpacing: 3 }}>DELIVERY IN PROGRESS<span style={{ opacity: Math.floor(frame / 12) % 2 ? .2 : 1 }}>_</span></div>
      {shot.time > 1.5 && shot.time < 1.6 && <AbsoluteFill style={{ background: '#fff3d5', opacity: .18 }} />}
    </>}
    {shot.id === 'aftermath' && <div style={{ position: 'absolute', top: 58, left: 60 }}><div style={{ ...title, fontSize: 76 }}>SMALL SCOPE.<br />BIG CONSEQUENCES.</div></div>}
    {shot.id === 'customer' && <div style={{ position: 'absolute', top: 85, left: 64, color: green }}><Eyebrow>Meanwhile…</Eyebrow><div style={{ ...title, fontSize: 92, marginTop: 16 }}>STILL<br />WAITING.</div></div>}
    {shot.id === 'instructions' && <div style={{ position: 'absolute', left: 64, top: 58, width: 522, transform: `translateY(${(1 - enter) * -20}px)`, opacity: enter }}>
      <Eyebrow style={{ marginBottom: 16 }}>You give the instructions.</Eyebrow>
      <div style={{ padding: '23px 27px', background: cream, color: green, borderRadius: '20px 20px 20px 0', fontSize: 28, fontWeight: 650, boxShadow: '0 8px 35px #152c2940' }}>“Take the long way.<br />Keep the coffee safe.”</div>
      <div style={{ marginTop: 12, fontFamily: mono, fontSize: 13, letterSpacing: 1 }}>ASTRA · CAREFUL ROUTE</div>
    </div>}
    {shot.id === 'bet' && <>
      <div style={{ position: 'absolute', top: 96, left: 64, maxWidth: 550 }}><Eyebrow>Everyone else gets a stake.</Eyebrow><div style={{ ...title, fontSize: 103, marginTop: 18 }}>BACK YOUR<br />FAVOURITE.</div><div style={{ marginTop: 25, fontSize: 20 }}>Join on your phone.<br />Bragging rights. Imaginary coins.</div></div>
      <div style={{ position: 'absolute', top: 28, right: 120, width: 303, height: 650, padding: 8, background: '#172b24', borderRadius: 35, transform: `translateY(${(1 - enter) * 100}px) rotate(5deg)`, boxShadow: '15px 20px 55px #10291d65' }}><Img src={staticFile('phone.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 27 }} /></div>
    </>}
    {shot.id === 'delivery' && <div style={{ position: 'absolute', left: 58, top: 60 }}><Eyebrow>Eventually.</Eyebrow>{shot.time > .6 && <div style={{ ...title, fontSize: 77, marginTop: 10, color: lime }}>COFFEE. DELIVERED.</div>}</div>}

    {shot.id === 'logo' && <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: cream, color: green }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, transform: `scale(${.94 + enter * .06})`, opacity: enter }}><Cup size={136} color="#b75c37" /><div style={{ ...title, fontSize: 160 }}>COFFEE RUN</div></div>
      <div style={{ fontSize: 25, marginTop: 25, letterSpacing: -.4 }}>Artificial intelligence. <strong>Questionable coordination.</strong></div>
      <div style={{ fontFamily: mono, fontSize: 17, marginTop: 38, letterSpacing: 1.5 }}>coffee.colvenalabs.com</div>
      <div style={{ position: 'absolute', bottom: 27, fontSize: 11, letterSpacing: 1, opacity: .7 }}>DIRECTED GAMEPLAY · BUILT WITH CODEX · RAPIER · THREE.JS · REMOTION</div>
    </AbsoluteFill>}

    {subtitle && shot.id !== 'logo' && <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}><div style={{ padding: '10px 21px', borderRadius: 8, background: '#13291fe8', color: cream, fontSize: 23, fontWeight: 550, boxShadow: '0 3px 12px #0002' }}>{subtitle}</div></div>}
    {isWorld && <div style={{ position: 'absolute', bottom: 8, right: 21, color: cream, fontSize: 9, letterSpacing: 1.2, textShadow: '0 1px 3px #000' }}>DIRECTED GAMEPLAY</div>}
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 7, 1249, 1259], [1, 0, 0, 1], clamp), background: '#13281f', pointerEvents: 'none' }} />
  </AbsoluteFill>;
}
