import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms governing your use of OfferLens. Plain English, India-governed.',
};

const LAST_UPDATED = 'May 14, 2026';
const CONTACT_EMAIL = 'riyansh2502@gmail.com';
const LINKEDIN_URL = 'https://www.linkedin.com/in/riyansh16';

export default function TermsPage() {
  return (
    <article className="prose-app mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <p className="text-sm">
        Please read these terms before using OfferLens. By creating an
        account or using the service, you agree to them. If you do not agree,
        do not use the service.
      </p>

      <Section title="1. What this service is">
        <p>
          OfferLens is a web tool that helps individuals score and
          compare competing job offers using a weighted formula plus public
          third-party data (Indeed ratings, Reddit/HN sentiment, Yahoo
          Finance stock CAGR) and AI-generated commentary.
        </p>
        <p>
          It is a personal project, not a registered business. It is provided
          free of charge with no service-level guarantees.
        </p>
      </Section>

      <Section title="2. Not professional advice">
        <p>
          The scores, AI verdicts, negotiation suggestions, and any other
          output from this service are <strong>not</strong> financial,
          legal, tax, or career advice. They are decision-support outputs
          based on the data you enter and the public data we fetch. You are
          responsible for your own decisions.
        </p>
        <p>
          Please verify any number that matters to you (compensation,
          equity, taxes, ratings) against authoritative sources before
          making a decision.
        </p>
      </Section>

      <Section title="3. Your account">
        <p>
          You must be at least 18 years old to use the service. You agree to
          provide accurate sign-in information and to keep your account
          credentials secure. You are responsible for all activity under
          your account.
        </p>
        <p>
          One person, one account. You may not share credentials, sell
          access, or create accounts on behalf of others.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Reverse engineer, scrape, or systematically extract data</li>
          <li>Spam the AI insights endpoint or other rate-limited APIs</li>
          <li>
            Submit content that is unlawful, defamatory, infringing, or that
            attempts to compromise the service (SQL injection, XSS, prompt
            injection, etc.)
          </li>
          <li>Resell or sublicense any output without permission</li>
          <li>Use the service to harass any company, recruiter, or person</li>
        </ul>
        <p>
          We may suspend or delete accounts that abuse the service. We will
          tell you why if we can.
        </p>
      </Section>

      <Section title="5. Your content">
        <p>
          You retain ownership of the offer details and comparisons you create.
          You grant us a limited license to store, process, and display this
          content solely so we can provide the service to you
          (it would be hard to compute a comparison otherwise).
        </p>
        <p>
          We will never publish your content publicly or share it with
          other users.
        </p>
      </Section>

      <Section title="6. Third-party content and data">
        <p>
          Indeed ratings, Reddit/HN posts, and Yahoo Finance stock data are
          owned by their respective providers and shown here under fair-use
          excerpting with source attribution where possible. We make no
          claim of accuracy on third-party data — providers can change or
          remove information at any time.
        </p>
      </Section>

      <Section title="7. AI-generated content">
        <p>
          AI verdicts and commentary are generated on demand by Microsoft
          Azure OpenAI. They can be wrong, biased, or stale. They are
          probabilistic outputs, not deterministic facts. Always read them
          alongside the underlying numbers shown in the same view.
        </p>
      </Section>

      <Section title="8. Service availability">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;. We do not promise uninterrupted access. We may
          add, change, or remove features at any time. We may suspend or
          permanently shut down the service with reasonable notice.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          To the maximum extent permitted by law: the operator is not
          liable for any indirect, incidental, special, consequential, or
          punitive damages arising from your use of the service, including
          but not limited to lost wages, lost opportunities, decisions
          based on inaccurate data, or service downtime. Your sole remedy
          for dissatisfaction is to stop using the service and (optionally)
          delete your account.
        </p>
      </Section>

      <Section title="10. Termination">
        <p>
          You may delete your account at any time by emailing{' '}
          <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          We may terminate or suspend your account if you violate these
          terms or if we shut down the service.
        </p>
      </Section>

      <Section title="11. Changes to these terms">
        <p>
          We may update these terms occasionally. The &ldquo;last
          updated&rdquo; date at the top reflects when. For significant
          changes, signed-in users will see a notice on the dashboard.
          Continued use after a change means you accept the new terms.
        </p>
      </Section>

      <Section title="12. Governing law">
        <p>
          These terms are governed by the laws of India. Any dispute
          arising from these terms or your use of the service is subject to
          the exclusive jurisdiction of the courts in Bengaluru, Karnataka.
        </p>
      </Section>

      <footer className="border-t pt-4 text-sm text-[rgb(var(--muted-foreground))]">
        <p>
          Questions? Email{' '}
          <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
          or message on{' '}
          <a className="link" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>.{' '}
          See also our <Link href="/privacy" className="link">Privacy Policy</Link>.
        </p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm text-[rgb(var(--muted-foreground))]">
        {children}
      </div>
    </section>
  );
}
