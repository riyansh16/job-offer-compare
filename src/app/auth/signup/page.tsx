import Link from 'next/link';
import { SignUpForm } from '@/components/AuthForms';

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <SignUpForm />
        <p className="text-center text-sm text-[rgb(var(--muted-foreground))]">
          Already have an account?{' '}
          <Link href="/auth/signin" className="text-[rgb(var(--primary))] underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
