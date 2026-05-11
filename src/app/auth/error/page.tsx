export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold text-[rgb(var(--danger))]">Authentication error</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">{sp.error ?? 'Unknown error'}</p>
        <a href="/auth/signin" className="btn-outline">Back to sign in</a>
      </div>
    </div>
  );
}
