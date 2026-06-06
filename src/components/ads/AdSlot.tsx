'use client';

import { useEffect, useRef } from 'react';

export type AdPlacement = 'companies-list' | 'company-detail';

type Provider = 'adsense' | 'medianet' | 'ezoic' | 'none';

function getProvider(): Provider {
  const v = (process.env.NEXT_PUBLIC_AD_PROVIDER ?? 'none').toLowerCase();
  if (v === 'adsense' || v === 'medianet' || v === 'ezoic') return v;
  return 'none';
}

// Per-placement slot/crid/id pulled from NEXT_PUBLIC env vars so nothing
// proprietary lands in source. Add new placements by adding env keys here.
function getAdsenseSlot(p: AdPlacement): string | undefined {
  if (p === 'companies-list') return process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMPANIES_LIST;
  if (p === 'company-detail') return process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMPANY_DETAIL;
  return undefined;
}

function getMedianetCrid(p: AdPlacement): string | undefined {
  if (p === 'companies-list') return process.env.NEXT_PUBLIC_MEDIANET_CRID_COMPANIES_LIST;
  if (p === 'company-detail') return process.env.NEXT_PUBLIC_MEDIANET_CRID_COMPANY_DETAIL;
  return undefined;
}

function getEzoicId(p: AdPlacement): number | undefined {
  const raw =
    p === 'companies-list'
      ? process.env.NEXT_PUBLIC_EZOIC_ID_COMPANIES_LIST
      : process.env.NEXT_PUBLIC_EZOIC_ID_COMPANY_DETAIL;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    _mNHandle?: { queue: Array<() => void> };
    _mNDetails?: { loadTag: (id: string, size: string, crid: string) => void };
    ezstandalone?: { cmd: Array<() => void>; showAds: (...ids: number[]) => void };
  }
}

export function AdSlot({ placement, className }: { placement: AdPlacement; className?: string }) {
  const provider = getProvider();
  const ref = useRef<HTMLDivElement | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (pushedRef.current) return;

    if (provider === 'adsense') {
      try {
        (window.adsbygoogle = window.adsbygoogle ?? []).push({});
        pushedRef.current = true;
      } catch {
        // AdSense script not yet loaded; harmless.
      }
      return;
    }

    if (provider === 'medianet') {
      const crid = getMedianetCrid(placement);
      if (!crid) return;
      try {
        window._mNHandle = window._mNHandle ?? { queue: [] };
        window._mNHandle.queue.push(() => {
          window._mNDetails?.loadTag(`${crid}`, '300x250', crid);
        });
        pushedRef.current = true;
      } catch {
        // ignore
      }
      return;
    }

    if (provider === 'ezoic') {
      const id = getEzoicId(placement);
      if (id == null) return;
      try {
        window.ezstandalone = window.ezstandalone ?? { cmd: [], showAds: () => {} };
        window.ezstandalone.cmd.push(() => {
          window.ezstandalone?.showAds(id);
        });
        pushedRef.current = true;
      } catch {
        // ignore
      }
    }
  }, [provider, placement]);

  if (provider === 'none') return null;

  if (provider === 'adsense') {
    const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
    const slot = getAdsenseSlot(placement);
    if (!client || !slot) return null;
    return (
      <aside
        className={className ?? 'my-4 flex justify-center'}
        aria-label="Advertisement"
        data-ad-placement={placement}
      >
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', maxWidth: 728 }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </aside>
    );
  }

  if (provider === 'medianet') {
    const crid = getMedianetCrid(placement);
    if (!crid) return null;
    return (
      <aside
        className={className ?? 'my-4 flex justify-center'}
        aria-label="Advertisement"
        data-ad-placement={placement}
      >
        <div id={crid} ref={ref} style={{ minHeight: 250 }} />
      </aside>
    );
  }

  if (provider === 'ezoic') {
    const id = getEzoicId(placement);
    if (id == null) return null;
    return (
      <aside
        className={className ?? 'my-4 flex justify-center'}
        aria-label="Advertisement"
        data-ad-placement={placement}
      >
        <div id={`ezoic-pub-ad-placeholder-${id}`} style={{ minHeight: 250 }} />
      </aside>
    );
  }

  return null;
}
