import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'OfferLens — Compare your job offers, side by side.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Brand accent reused from src/app/icon.svg so the OG card matches the
// favicon and in-app logo without loading external fonts (edge runtime
// would otherwise need a remote font fetch on every regeneration).
const ACCENT = '#6366f1';
const BG = '#0b0b12';
const FG = '#f5f5f7';
const MUTED = '#9ca3af';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 88px',
          background: `linear-gradient(135deg, ${BG} 0%, #14142b 100%)`,
          color: FG,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg
            width="96"
            height="96"
            viewBox="0 0 24 24"
            fill="none"
            stroke={ACCENT}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="10" cy="10" r="6.5" />
            <line x1="14.8" y1="14.8" x2="20.5" y2="20.5" />
            <line x1="7.5" y1="12" x2="7.5" y2="10.2" />
            <line x1="10" y1="12" x2="10" y2="8" />
            <line x1="12.5" y1="12" x2="12.5" y2="9" />
          </svg>
          <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: -1.5 }}>
            OfferLens
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 80,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            <span>Compare your job offers,</span>
            <span>side by side.</span>
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: MUTED, lineHeight: 1.3, maxWidth: 920 }}>
            Base, equity, benefits, and live company reviews — with grounded AI verdicts.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 28,
            color: MUTED,
          }}
        >
          <span style={{ display: 'flex' }}>offerlens.in</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
