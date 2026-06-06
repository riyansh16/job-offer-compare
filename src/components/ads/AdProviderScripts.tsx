import Script from 'next/script';

type Provider = 'adsense' | 'medianet' | 'ezoic' | 'none';

function getProvider(): Provider {
  const v = (process.env.NEXT_PUBLIC_AD_PROVIDER ?? 'none').toLowerCase();
  if (v === 'adsense' || v === 'medianet' || v === 'ezoic') return v;
  return 'none';
}

export function AdProviderScripts() {
  const provider = getProvider();

  if (provider === 'adsense') {
    const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
    if (!client) return null;
    return (
      <Script
        id="adsense-loader"
        async
        strategy="afterInteractive"
        crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`}
      />
    );
  }

  if (provider === 'medianet') {
    const cid = process.env.NEXT_PUBLIC_MEDIANET_CID;
    if (!cid) return null;
    return (
      <Script
        id="medianet-loader"
        async
        strategy="afterInteractive"
        src={`https://contextual.media.net/dmedianet.js?cid=${encodeURIComponent(cid)}`}
      />
    );
  }

  if (provider === 'ezoic') {
    return (
      <>
        <Script
          id="ezoic-loader"
          async
          strategy="afterInteractive"
          src="https://www.ezojs.com/ezoic/sa.min.js"
        />
        <Script id="ezoic-init" strategy="afterInteractive">
          {`window.ezstandalone = window.ezstandalone || {}; window.ezstandalone.cmd = window.ezstandalone.cmd || [];`}
        </Script>
      </>
    );
  }

  return null;
}
