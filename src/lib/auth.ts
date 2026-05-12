import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Email/password sign-in is dev-only. In prod (OPEN_SIGNUP !== 'true') the
// Credentials provider is not registered at all, so the only path in is
// Google OAuth. See docs/GOOGLE-OAUTH.md § Phase 2.2.
const providers: NextAuthConfig['providers'] = [];
if (process.env.OPEN_SIGNUP === 'true') {
  providers.push(
    Credentials({
      name: 'Email & password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user || !user.hashedPassword) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.hashedPassword);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies its emails, so it's safe to auto-link to an existing
      // user row created via Credentials with the same email. Without this,
      // a user who originally signed up with email/password (in dev) hits
      // OAuthAccountNotLinked the first time they try Google. See Phase 2.1
      // in docs/GOOGLE-OAUTH.md.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // 7-day JWT (down from the NextAuth default 30), with a sliding refresh
  // once per active day so engaged users stay signed in. Salary data
  // warrants a shorter lifetime than the default. See Phase 2.3.
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: { signIn: '/auth/signin' },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
});
