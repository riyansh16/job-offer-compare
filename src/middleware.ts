import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

const PUBLIC_PATHS = ['/', '/auth/signin', '/auth/signup', '/auth/error', '/privacy', '/terms', '/companies', '/demo'];

export default auth((req: NextRequest & { auth: unknown }) => {
  // Canonicalize www -> apex so NextAuth's Host always matches AUTH_URL.
  // next.config.mjs redirects() is ignored by SWA's hybrid runtime; doing
  // it here guarantees the 308 fires before any auth logic runs. SWA's
  // proxy rewrites `Host` to the internal *.azurestaticapps.net hostname
  // and puts the real one in `x-forwarded-host`, so check that first.
  const publicHost =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    req.nextUrl.host;
  if (publicHost?.toLowerCase() === 'www.offerlens.in') {
    const url = req.nextUrl.clone();
    url.host = 'offerlens.in';
    url.protocol = 'https:';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/companies/')
  ) {
    return NextResponse.next();
  }
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/signin';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
