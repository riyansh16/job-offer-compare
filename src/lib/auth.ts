import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './db';

// Google OAuth is the only sign-in method in every environment (dev, staging,
// prod). Email/password and the OPEN_SIGNUP escape hatch were removed because
// (a) Google has already email-verified the account, (b) no password storage
// means no reset flow or dictionary-attack surface, and (c) one auth path is
// easier to reason about. See docs/GOOGLE-OAUTH.md for the full rationale.
const providers: NextAuthConfig['providers'] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies its emails, so it's safe to auto-link to an existing
      // user row created via the legacy Credentials path (any leftover demo
      // accounts from seed data). Without this, the first Google sign-in
      // for those emails would 500 with OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // 7-day JWT (down from the NextAuth default 30), with a sliding refresh
  // once per active day so engaged users stay signed in. Salary data
  // warrants a shorter lifetime than the default.
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: { signIn: '/auth/signin' },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        // Compute admin status once at sign-in and persist it in the JWT, so
        // the client-side navbar (src/components/TopNav.tsx) can show the
        // Admin link without ADMIN_EMAIL ever reaching the browser. Logic
        // mirrors isAdminEmail() in src/lib/admin.ts — inlined here to avoid a
        // circular import (admin.ts imports `auth` from this file).
        const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        token.isAdmin =
          !!adminEmail && (user.email ?? '').trim().toLowerCase() === adminEmail;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.uid) (session.user as { id?: string }).id = token.uid as string;
        (session.user as { isAdmin?: boolean }).isAdmin = Boolean(
          (token as { isAdmin?: boolean }).isAdmin,
        );
      }
      return session;
    },
  },
  events: {
    // Lightweight sign-in telemetry: bumps lastSignInAt + signInCount on
    // every successful Google sign-in. Used by /admin/stats to report DAU
    // + total sign-ins. Failures here are swallowed so a DB hiccup never
    // blocks login.
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastSignInAt: new Date(),
            signInCount: { increment: 1 },
          },
        });
      } catch (err) {
        console.warn('[auth.events.signIn] failed to bump telemetry:', err);
      }
    },
  },
});
