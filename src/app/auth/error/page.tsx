/**
 * Auth error page. NextAuth redirects here with `?error=<code>` when an
 * OAuth or credentials sign-in fails. We translate the machine codes into
 * friendly messages so users know what to do next. See Phase 2.8 in
 * docs/GOOGLE-OAUTH.md.
 */
const MESSAGES: Record<string, { title: string; detail: string }> = {
  OAuthAccountNotLinked: {
    title: 'Account already linked elsewhere',
    detail:
      'This email is already linked to a different sign-in method. Use the original method to sign in, or contact the admin to merge the accounts.',
  },
  AccessDenied: {
    title: 'Sign-in cancelled',
    detail: 'You cancelled the sign-in flow before completing it.',
  },
  Configuration: {
    title: 'Server error',
    detail:
      'There is a problem with the server configuration (most likely a missing or invalid OAuth credential). Please contact the admin.',
  },
  Verification: {
    title: 'Link expired',
    detail: 'The sign-in link expired or was already used. Request a new one.',
  },
  CredentialsSignin: {
    title: 'Invalid email or password',
    detail: 'The email and password combination did not match any account.',
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const code = sp.error ?? '';
  const known = MESSAGES[code];
  const title = known?.title ?? 'Authentication error';
  const detail = known?.detail ?? code ?? 'Unknown error';

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold text-[rgb(var(--danger))]">{title}</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">{detail}</p>
        {code && !known && (
          <p className="text-xs text-[rgb(var(--muted-foreground))]">
            Error code: <code>{code}</code>
          </p>
        )}
        <a href="/auth/signin" className="btn-outline">Back to sign in</a>
      </div>
    </div>
  );
}
