import { ReactNode } from "react";
import logoUrl from "@/assets/logo-white.png";

const PILLARS = [
  { symbol: "✦", label: "Exclusive Menus" },
  { symbol: "◈", label: "Special Discounts" },
  { symbol: "✦", label: "Food Community" },
  { symbol: "♛", label: "Top Chef Award" },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-background">

      {/* ── Left: Brand panel ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden items-center justify-center"
        style={{ background: "radial-gradient(ellipse at 50% 40%, #1a1200 0%, #0a0a0a 70%)" }}
      >
        {/* Ambient gold glow behind logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-96 h-96 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)" }}
        />

        {/* Top gold rule */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        {/* Bottom gold rule */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        {/* Left inner rule */}
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-8 px-10 py-16 max-w-md w-full">

          {/* Logo */}
          <div className="relative">
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-full blur-2xl opacity-20"
              style={{ background: "radial-gradient(circle, #D4AF37 0%, transparent 70%)" }}
            />
            <img
              src={logoUrl}
              alt="Friday Food Club"
              className="relative w-64 h-64 object-contain"
              style={{ filter: "drop-shadow(0 0 32px rgba(212,175,55,0.25))" }}
            />
          </div>

          {/* Role label + dividers */}
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-primary/30" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] whitespace-nowrap">
              Creator &amp; Admin Portal
            </span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-primary/30" />
          </div>

          {/* Tagline */}
          <p className="text-muted-foreground/70 text-sm text-center font-light italic leading-relaxed">
            "Good Food. Good People. Exclusive Access."
          </p>

          {/* Brand pillars */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 w-full">
            {PILLARS.map(({ symbol, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-primary/60 text-xs leading-none">{symbol}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
                  {label}
                </span>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Right: Form panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:w-[480px] xl:w-[560px] relative bg-background">

        {/* Mobile-only logo strip */}
        <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
          <img src={logoUrl} alt="FFC" className="w-10 h-10 object-contain" />
          <span className="text-xl font-serif font-bold gold-gradient-text">Friday Food Club</span>
        </div>

        <div className="mx-auto w-full max-w-sm lg:w-[400px]">
          {children}
        </div>
      </div>

    </div>
  );
}
