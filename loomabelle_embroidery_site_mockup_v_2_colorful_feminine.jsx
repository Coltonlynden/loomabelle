import React, { useState, useRef } from "react";

export default function LoomabelleMockupV2() {
  const [tab, setTab] = useState("upload");
  const tabs = [
    { key: "upload", label: "Upload Photo" },
    { key: "draw", label: "Draw & Trace" },
  ];
  const tabRef = useRef<HTMLDivElement>(null);
  const scrollToTabs = () => tabRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen text-slate-800 bg-[#fffaf3]">
      <SiteStyles />
      <TopNav onTryNow={scrollToTabs} />
      <Hero onTryNow={scrollToTabs} />

      <section ref={tabRef} className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 -mt-12">
        <div className="rounded-[28px] bg-white/85 backdrop-blur border border-rose-200/70 shadow-2xl p-4 sm:p-6 stitch-surface">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`tab-btn ${tab === t.key ? "bg-rose-300/50 text-rose-800 shadow-inner" : "hover:bg-rose-100/70 text-slate-700"}`}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-auto text-xs sm:text-sm text-slate-500 italic">mockup only · interactions not wired</span>
          </div>

          {tab === "upload" ? <UploadMock /> : <DrawMock />}
        </div>
      </section>

      <HowItWorks />
      <PatternBreak />
      <InspoShop />
      <Footer />
    </div>
  );
}

function TopNav({ onTryNow }: { onTryNow: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-gradient-to-b from-rose-50/80 to-transparent backdrop-blur supports-[backdrop-filter]:bg-rose-50/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
        <Logo />
        <nav className="hidden sm:flex items-center gap-4 text-sm font-body">
          <a className="nav-link" href="#features">Features</a>
          <a className="nav-link" href="#how">How it works</a>
          <a className="nav-link" href="#gallery">Gallery</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn ghost">Sign in</button>
          <button onClick={onTryNow} className="btn rainbow">Try it</button>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg width="48" height="48" viewBox="0 0 64 64" fill="none" className="drop-shadow-sm">
        <circle cx="32" cy="32" r="22" className="stroke-blue-300" strokeWidth="3" fill="#fffaf3" />
        <circle cx="32" cy="32" r="18" className="stroke-blue-300" strokeDasharray="2 6" strokeWidth="2" fill="none" />
        <g transform="translate(32 32)">
          <circle r="2.2" fill="#f59eb7" />
          {[0,1,2,3,4,5].map((n)=> (
            <circle key={n} r="1.4" fill="#fde68a" transform={`rotate(${n*60}) translate(0 -5)`}/>
          ))}
        </g>
      </svg>
      <div>
        <div className="font-logo text-3xl leading-7 tracking-tight text-slate-800">Loomabelle</div>
        <div className="text-[10px] -mt-0.5 text-slate-500 tracking-[0.18em] uppercase">photo → stitch files</div>
      </div>
    </div>
  );
}

function Hero({ onTryNow }: { onTryNow: () => void }) {
  return (
    <section className="relative isolate overflow-hidden pt-10 sm:pt-16 pb-32">
      <HeroDecoration />
      <div className="absolute -top-8 right-8 opacity-80 rotate-6"><DecorSticker kind="flower" size={68} /></div>
      <div className="absolute bottom-6 left-4 opacity-80 -rotate-6"><DecorSticker kind="scallop" size={76} /></div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-4xl sm:text-6xl font-title font-semibold tracking-tight text-slate-900">
            Turn photos into <span className="text-rose-700 fancy-underline">embroidery</span> files.
          </h1>
          <p className="mt-4 text-slate-700 text-base sm:text-lg font-body">
            A colorful, cozy tool to convert images into stitch‑ready formats. Upload a photo or doodle in our cute stitch canvas.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={onTryNow} className="btn rainbow text-base">Start with a photo</button>
            <button onClick={onTryNow} className="btn soft text-base">Open the drawing tab</button>
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-3 text-sm text-slate-700">
            {["Auto color reduction","Hoop size presets","Thread palette preview","Light & dark fabric modes"].map((x) => (
              <li key={x} className="flex items-center gap-2"><Sparkle />{x}</li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="hero-card colorful border-0">
            <svg viewBox="0 0 520 420" className="w-full h-auto">
              <defs>
                <pattern id="stitchPattern" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
                  <line x1="0" y1="0" x2="0" y2="24" stroke="#93c5fd" strokeWidth="2" strokeDasharray="1 7"/>
                </pattern>
              </defs>
              <circle cx="260" cy="210" r="150" fill="#fffaf3" stroke="#f9a8d4" strokeWidth="10" />
              <circle cx="260" cy="210" r="130" fill="url(#stitchPattern)" stroke="#a5b4fc" strokeWidth="3" strokeDasharray="4 10" />
              {new Array(7).fill(0).map((_,i)=>{
                const a = (i/7)*Math.PI*2; const r=80; const x=260+Math.cos(a)*r; const y=210+Math.sin(a)*r;
                const fills=['#fda4af','#f9a8d4','#c4b5fd','#93c5fd','#99f6e4','#fde68a','#86efac'];
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r="10" fill={fills[i%fills.length]} />
                    <circle cx={x} cy={y-14} r="4" fill="#fde68a"/>
                    <circle cx={x+10} cy={y+8} r="5" fill="#a7f3d0"/>
                  </g>
                );
              })}
              <path d="M370 100 L480 40" stroke="#0ea5e9" strokeWidth="6" strokeLinecap="round"/>
              <path d="M480 40 q -30 40 -10 80 t -40 70" stroke="#fb7185" strokeWidth="4" fill="none" strokeDasharray="1 10"/>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

function UploadMock() {
  return (
    <div className="mt-6 grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 p-4 sm:p-6 rounded-2xl border border-blue-200/60 bg-blue-50/60 shadow-inner">
        <div className="flex items-center gap-3"><IconSpool /><h3 className="font-semibold text-slate-800 font-title">Upload a photo</h3></div>
        <div className="mt-4 upload-zone">
          <div className="pointer-events-none select-none text-center">
            <svg width="56" height="56" viewBox="0 0 24 24" className="mx-auto opacity-70"><path fill="currentColor" d="M12 16v-6m0 0l-3 3m3-3l3 3M6 20h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1.5M6 20a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3l2-2h2l2 2h3"/></svg>
            <p className="text-slate-600">Drag & drop or click to choose</p>
            <p className="text-xs text-slate-500">(mockup only – disabled)</p>
          </div>
          <input disabled type="file" className="absolute inset-0 opacity-0" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {["Auto‑trace subject","Reduce to stitch palette","Edge cleanup","Fill & satin suggestions"].map((x) => (
            <label key={x} className="flex items-center gap-2"><input type="checkbox" disabled defaultChecked className="accent-rose-400" />{x}</label>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 p-4 sm:p-6 rounded-2xl border border-rose-200 bg-rose-50/70 shadow-inner">
        <div className="flex items-center gap-3"><IconHoop /><h3 className="font-semibold font-title">Preview (stitched)</h3></div>
        <div className="mt-4 aspect-video rounded-xl bg-white/90 grid place-items-center stitch-surface">
          <p className="text-slate-500 text-sm">Your stitched preview appears here</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {['DST','PES','EXP','JEF'].map(f => <button key={f} className="btn soft">{f}</button>)}
        </div>
      </div>
    </div>
  );
}

function DrawMock() {
  return (
    <div className="mt-6 grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 p-4 sm:p-6 rounded-2xl border border-violet-200/70 bg-violet-50/60 shadow-inner">
        <div className="flex items-center gap-3"><IconScissors /><h3 className="font-semibold text-slate-800 font-title">Draw & Trace</h3></div>
        <div className="mt-4 aspect-video rounded-xl bg-white/90 grid place-items-center stitch-surface">
          <p className="text-slate-500">Cute stitch canvas (mockup)</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {['Pen','Eraser','Fill','Fabric color','Stitch guides','Undo'].map(x=> (
            <button key={x} className="btn soft" disabled>{x}</button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 p-4 sm:p-6 rounded-2xl border border-green-200 bg-green-50/70 shadow-inner">
        <div className="flex items-center gap-3"><span className="inline-flex w-6 h-6 rounded-full bg-emerald-200" /><h3 className="font-semibold font-title">Thread Palette</h3></div>
        <div className="mt-3 grid grid-cols-6 gap-2">
          {['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac'].map(c=> (
            <div key={c} className="h-10 rounded-full border border-white shadow-sm" style={{background:c}} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <button className="btn soft" disabled>Suggest Stitch Types</button>
          <button className="btn soft" disabled>Export Mock</button>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-title font-semibold">How it works</h2>
        <p className="mt-2 text-slate-600 font-body">Three cozy steps from photo to stitches.</p>
      </div>
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StepCard icon={<IconSpool />} title="Upload or draw">Bring a photo or sketch it right in the browser.</StepCard>
        <StepCard icon={<IconHoop />} title="Tidy & preview">Automatic color reduction and stitch suggestions with a live preview.</StepCard>
        <StepCard icon={<IconScissors />} title="Export">Download popular formats like DST, PES, EXP, and more.</StepCard>
      </div>
    </section>
  );
}

function StepCard({ icon, title, children }: any) {
  return (
    <div className="p-6 rounded-3xl bg-white shadow-xl border border-slate-200/70 stitch-surface">
      <div className="flex items-center gap-3">{icon}<h3 className="font-semibold text-lg font-title">{title}</h3></div>
      <p className="mt-2 text-slate-600 text-sm font-body">{children}</p>
    </div>
  );
}

function PatternBreak() {
  return (
    <div className="my-16">
      <div className="pattern-strip rounded-[32px] mx-auto max-w-6xl h-24 sm:h-28 relative overflow-hidden">
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-[3px] bg-gradient-to-r from-rose-300 via-violet-300 to-blue-300 rounded-full"></div>
        <div className="absolute left-3 -top-4"><DecorSticker kind="heart" size={54} /></div>
        <div className="absolute right-3 -bottom-5"><DecorSticker kind="flower" size={60} /></div>
      </div>
    </div>
  );
}

function InspoShop() {
  return (
    <section id="gallery" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
      <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-rose-50 via-violet-50 to-blue-50 border border-slate-200/60 shadow-xl">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-2xl font-title font-semibold">Make it cute, make it yours</h3>
            <p className="mt-2 text-slate-600 text-sm sm:text-base font-body">Inspired by soft pastels, scalloped edges, and playful shapes. Loomabelle’s look draws from modern stationery and cozy craft vibes.</p>
            <div className="mt-4 flex gap-2">
              <button className="btn soft">Brand kit</button>
              <button className="btn soft">Color themes</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {new Array(6).fill(0).map((_,i)=> (
              <div key={i} className="rounded-2xl h-24 sm:h-28 bg-white/85 border border-slate-200 stitch-surface" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-gradient-to-t from-rose-100/80 to-transparent pt-14 pb-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl bg-white/75 backdrop-blur border border-rose-200 p-6 sm:p-8 stitch-surface relative overflow-hidden">
          <div className="absolute -right-4 -top-6 opacity-70"><DecorSticker kind="flower" size={90} /></div>
          <div className="grid md:grid-cols-2 gap-6 items-center relative z-10">
            <div>
              <h4 className="font-title text-2xl font-semibold">Join the list</h4>
              <p className="text-slate-600 text-sm mt-1 font-body">Be first to hear when the converter goes live.</p>
            </div>
            <form className="grid sm:grid-cols-[1fr_auto] gap-3">
              <input disabled placeholder="Email address" className="input" />
              <button disabled className="btn rainbow">Subscribe</button>
            </form>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-500 font-body">
            <span>© {new Date().getFullYear()} Loomabelle</span>
            <span className="hidden sm:inline">•</span>
            <a className="link" href="#">Brand</a>
            <a className="link" href="#">FAQ</a>
            <a className="link" href="#">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ---------- Tiny icon set (inline SVGs) ---------- */
function IconSpool() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="text-blue-500"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M6 6c0-1.1 2.7-2 6-2s6 .9 6 2m-12 0v12c0 1.1 2.7 2 6 2s6-.9 6-2V6m-12 0c0 1.1 2.7 2 6 2s6-.9 6-2m-10 5c1.5-1 3-2 5-2m-5 5c1.6-1.4 3.7-2.6 6-3"/></svg>
  );
}
function IconHoop() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="text-rose-500"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="5.8" fill="none" stroke="currentColor" strokeDasharray="1.5 4" strokeWidth="1.2"/></svg>
  );
}
function IconScissors() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="text-violet-500"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4Zm0 8a2 2 0 1 0 0 4a2 2 0 0 0 0-4Zm14-9L6 15m12 1L10 8"/></svg>
  );
}

/* ---------- Cute stickers & doodles ---------- */
function DecorSticker({ kind = 'flower', size = 56 }: { kind?: 'flower'|'scallop'|'heart'; size?: number }) {
  if (kind === 'scallop') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M10 50c0-22 18-40 40-40s40 18 40 40-18 40-40 40S10 72 10 50Z" fill="#fde68a"/>
        <circle cx="50" cy="50" r="32" fill="#fff"/>
        <circle cx="50" cy="50" r="28" fill="none" stroke="#f9a8d4" strokeDasharray="3 6" />
      </svg>
    );
  }
  if (kind === 'heart') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100"><path d="M50 82C7 57 17 22 40 28c7 2 10 8 10 8s3-6 10-8c23-6 33 29-10 54Z" fill="#f9a8d4"/></svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#c4b5fd"/>
      {[0,1,2,3,4,5,6,7].map(n=> <circle key={n} cx={50+Math.cos(n*Math.PI/4)*28} cy={50+Math.sin(n*Math.PI/4)*28} r="10" fill="#fef3c7" />)}
    </svg>
  );
}
function Sparkle(){
  return (<svg width="16" height="16" viewBox="0 0 24 24" className="text-rose-500"><path fill="currentColor" d="M12 2l1.8 4.2L18 8l-4.2 1.8L12 14l-1.8-4.2L6 8l4.2-1.8L12 2Zm5 8l1 2l2 1l-2 1l-1 2l-1-2l-2-1l2-1l1-2Z"/></svg>);
}

/* ---------- Page styles (stitch vibes + pastels) ---------- */
function SiteStyles() {
  const patternSVG = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120' fill='none'>
      <g stroke='#9DB7D9' stroke-width='1.5' opacity='0.35'>
        <path d='M15 18c0-3 10-5 22-5s22 2 22 5v22c0 3-10 5-22 5s-22-2-22-5V18Zm0 0c0 3 10 5 22 5s22-2 22-5' />
        <circle cx='90' cy='30' r='16' fill='none'/>
        <circle cx='90' cy='30' r='13' fill='none' stroke-dasharray='1 5'/>
        <path d='M20 90a8 8 0 1 0 0 16a8 8 0 0 0 0-16Zm0 0l80 8M20 106l80-8' />
      </g>
    </svg>`);

  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Quicksand:wght@400;500;600&family=Satisfy&display=swap');

      .font-logo { font-family: 'Satisfy', cursive; }
      .font-title, .font-serif { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
      .font-body { font-family: 'Quicksand', ui-sans-serif, system-ui, -apple-system; }
      body, .min-h-screen { font-family: 'Quicksand', ui-sans-serif, system-ui, -apple-system; }

      .btn { @apply px-4 py-2 rounded-full text-sm font-medium transition shadow-sm border; }
      .btn.primary { @apply bg-rose-500 text-white border-rose-500 hover:bg-rose-600 active:scale-[.98]; }
      .btn.soft { @apply bg-white/80 border-slate-200 hover:bg-white text-slate-700; }
      .btn.ghost { @apply bg-transparent border-transparent hover:bg-white/50; }
      .btn.rainbow { background: linear-gradient(90deg,#f9a8d4,#c4b5fd,#93c5fd,#99f6e4,#fde68a); color:#0f172a; border: none; box-shadow: 0 6px 18px rgba(244,114,182,.25); }
      .tab-btn { @apply px-4 py-2 rounded-full text-sm border border-rose-200 transition; }
      .input { @apply rounded-full px-4 py-2 bg-white/85 border border-slate-200 placeholder:text-slate-400; }
      .link { @apply hover:text-slate-700 underline underline-offset-4 decoration-dotted; }
      .nav-link { @apply text-slate-700/90 hover:text-rose-700 transition; }

      .hero-card { position: relative; border-radius: 28px; box-shadow: 0 10px 40px rgba(0,0,0,.1); background: linear-gradient(180deg, #ffffffdd, #ffffffc0); border: 1px solid rgba(148,163,184,.35); padding: 12px; }
      .hero-card.colorful { background: linear-gradient(135deg,#fff,#fff0,#fff), radial-gradient(120% 80% at 10% 0%, #f9a8d4 0%, transparent 60%), radial-gradient(120% 80% at 90% 20%, #c4b5fd 0%, transparent 60%), radial-gradient(100% 80% at 50% 100%, #93c5fd 0%, transparent 60%); }

      .stitch-surface { background-image: radial-gradient(rgba(244,244,245,.7) 1px, transparent 1px); background-size: 10px 10px; }

      .upload-zone { position: relative; margin-top: 8px; height: 200px; border-radius: 18px; background: rgba(255,255,255,.95); border: 2px dashed #bfdbfe; display:grid; place-items:center; }

      .pattern-strip { background-image: url('data:image/svg+xml;utf8,${patternSVG}'); background-size: 180px; background-repeat: repeat; background-color: #fff7ed; border: 1px solid rgba(148,163,184,.3); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 8px 20px rgba(0,0,0,.06);} 

      .fancy-underline { background-image: linear-gradient(to right, #f9a8d4, #93c5fd); background-size: 100% 12px; background-position: 0 92%; background-repeat: no-repeat; padding-bottom: 2px; }

      .hero-blobs::before, .hero-blobs::after { content: ""; position: absolute; inset: -10% -20% auto -20%; height: 70%; filter: blur(50px); z-index: -1; }
      .hero-blobs::before { background: radial-gradient(40% 40% at 30% 40%, #fbcfe8 0%, transparent 70%), radial-gradient(40% 40% at 70% 60%, #c7d2fe 0%, transparent 70%); opacity: .9; }
      .hero-blobs::after { right: -10%; left: auto; background: radial-gradient(40% 40% at 40% 50%, #bae6fd 0%, transparent 70%), radial-gradient(40% 40% at 70% 60%, #fde68a 0%, transparent 70%); opacity: .85; }
    `}</style>
  );
}

function HeroDecoration() {
  return <div className="absolute inset-0 hero-blobs" aria-hidden="true" />;
}
