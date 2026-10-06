/**
 * Illustration of a campus hackathon: a stage screen, students at laptops, and floating pass cards.
 * Pure SVG/CSS so it needs no image files, and it contains no statistics.
 */
const SEATS = [
  { x: 70, skin: '#f2c9a5', shirt: '#6d3df2' },
  { x: 150, skin: '#c98f66', shirt: '#ec4899' },
  { x: 230, skin: '#8d5a3b', shirt: '#3b82f6' },
  { x: 310, skin: '#f0bd94', shirt: '#10b981' },
  { x: 390, skin: '#d9a47a', shirt: '#f59e0b' },
  { x: 470, skin: '#a8714c', shirt: '#8b5cf6' },
];

export default function HeroScene() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-tr from-violet-500/30 via-indigo-500/20 to-pink-500/20 blur-2xl" aria-hidden="true" />

      <svg viewBox="0 0 540 400" role="img" aria-label="Students working on laptops at a campus hackathon in front of a large screen" className="relative w-full rounded-[2rem] shadow-2xl shadow-indigo-950/50 ring-1 ring-white/15">
        <defs>
          <linearGradient id="hs-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1b1450" />
            <stop offset="1" stopColor="#0b1030" />
          </linearGradient>
          <linearGradient id="hs-screen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c4dff" />
            <stop offset="0.6" stopColor="#4f46e5" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
          <radialGradient id="hs-glow" cx="0.5" cy="0.2" r="0.7">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="540" height="400" fill="url(#hs-bg)" />
        <rect width="540" height="400" fill="url(#hs-glow)" />

        {/* Stage screen */}
        <rect x="95" y="34" width="350" height="154" rx="14" fill="url(#hs-screen)" />
        <rect x="95" y="34" width="350" height="154" rx="14" fill="none" stroke="#fff" strokeOpacity="0.25" />
        <text x="270" y="96" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="4" fill="#fff" fillOpacity="0.8">24-HOUR</text>
        <text x="270" y="132" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff">HACKATHON</text>
        <text x="270" y="158" textAnchor="middle" fontSize="12" fontWeight="600" letterSpacing="2" fill="#fff" fillOpacity="0.85">BUILD  -  INNOVATE  -  IMPACT</text>

        {/* Stage lights */}
        <path d="M60 0 L110 36 L40 36 Z" fill="#fff" fillOpacity="0.06" />
        <path d="M480 0 L500 36 L430 36 Z" fill="#fff" fillOpacity="0.06" />

        {/* Floor */}
        <rect y="300" width="540" height="100" fill="#0b1030" fillOpacity="0.7" />

        {/* Students */}
        {SEATS.map((s, i) => (
          <g key={s.x} transform={`translate(${s.x} ${i % 2 ? 6 : 0})`}>
            <path d="M-26 300 C-26 262 -12 248 0 248 C12 248 26 262 26 300 Z" fill={s.shirt} />
            <circle cx="0" cy="226" r="17" fill={s.skin} />
            <path d="M-17 223 C-16 207 16 207 17 223 C10 214 -10 214 -17 223 Z" fill="#1d1b3a" />
            <rect x="-30" y="288" width="60" height="9" rx="3" fill="#cbd5e1" />
            <rect x="-24" y="266" width="48" height="24" rx="3" fill="#e2e8f0" />
            <rect x="-20" y="270" width="40" height="16" rx="2" fill="#312e81" />
            <circle cx="0" cy="278" r="2.6" fill="#a78bfa" />
          </g>
        ))}
        <rect y="296" width="540" height="6" fill="#6d3df2" fillOpacity="0.45" />
      </svg>

      {/* Floating pass card */}
      <div className="animate-float absolute -bottom-8 -left-4 hidden w-56 rounded-2xl bg-white p-4 shadow-2xl shadow-indigo-950/40 sm:block">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">You&apos;re registered!</p>
            <p className="text-xs text-slate-500">Event pass ready</p>
          </div>
        </div>
      </div>
      <div className="animate-float absolute -right-4 -top-6 hidden w-44 rounded-2xl bg-white/95 p-4 shadow-2xl shadow-indigo-950/40 [animation-delay:-3s] sm:block">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Next session</p>
        <p className="mt-1 text-sm font-bold text-slate-900">Hacking begins</p>
        <span className="mt-2 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[0.65rem] font-extrabold tracking-wider text-white">ONGOING</span>
      </div>
    </div>
  );
}
