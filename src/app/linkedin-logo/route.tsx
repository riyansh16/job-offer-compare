import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  const size = 400;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
        }}
      >
        <svg
          width="320"
          height="320"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4f46e5"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="10" cy="10" r="6.5" />
          <line x1="14.8" y1="14.8" x2="20.5" y2="20.5" />
          <line x1="7.5" y1="12" x2="7.5" y2="10.2" />
          <line x1="10" y1="12" x2="10" y2="8" />
          <line x1="12.5" y1="12" x2="12.5" y2="9" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    },
  );
}