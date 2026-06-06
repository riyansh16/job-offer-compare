import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What data OfferLens collects, how it is used, and your rights under India\u2019s DPDPA.',
};

const LAST_UPDATED = 'May 14, 2026';
const CONTACT_EMAIL = 'riyansh2502@gmail.com';
const LINKEDIN_URL = 'https://www.linkedin.com/in/riyansh16';

export default function PrivacyPage() {
  return (
    <article className="prose-app mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <section className="space-y-2">
        <p className="text-sm">
          This page explains, in plain English, exactly what OfferLens
          collects, why, where it lives, and what you can do about it. We try
          to be specific instead of hiding behind boilerplate. If anything here
          is unclear, email{' '}
          <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>

      <Section title="1. Who runs this service">
        <p>
          OfferLens is a personal project operated by Riyansh Pal,
          based in India. It is not a registered company. Contact:{' '}
          <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
          or via{' '}
          <a className="link" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p>
          Only what is needed to make the product work. Specifically:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Account identity.</strong> If you sign in with Google, we
            receive your name, email address, and Google profile picture URL.
            If you create a local password account (only available in dev
            instances), we store your email and a one-way bcrypt hash of your
            password — never the password itself.
          </li>
          <li>
            <strong>Sign-in telemetry.</strong> Timestamp of your last sign-in
            and a count of how many times you have signed in. Used only to
            understand product activity (admin dashboard).
          </li>
          <li>
            <strong>Offer details you enter.</strong> Company, role, base
            salary, bonus, equity grants, sign-on bonus, benefits, and work
            mode. This data is the product.
          </li>
          <li>
            <strong>Comparisons and AI insights you generate.</strong> The
            scored comparison snapshot and any AI-generated verdict / trade-off
            / negotiation text linked to it.
          </li>
          <li>
            <strong>Your &ldquo;current role&rdquo;</strong> if you set one, so
            it can baseline future comparisons.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect: phone number, address, payment
          info, biometric data, or device fingerprinting. There are no
          third-party advertising trackers on this site.
        </p>
      </Section>

      <Section title="3. What we send to third parties">
        <p>
          To produce comparisons and AI verdicts, certain data leaves our
          server. Here is the full list — nothing else is shared:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Azure OpenAI (Microsoft).</strong> When you click
            &ldquo;Generate AI verdict&rdquo;, the comparison snapshot
            (compensation numbers, weights, normalized scores, and company
            names) is sent to Azure OpenAI for analysis. Microsoft&rsquo;s
            commercial Azure OpenAI service does not use customer data to
            train its models. Your name and email are never included in the
            prompt.
          </li>
          <li>
            <strong>Google Gemini (Google).</strong> Used only to fetch public
            Indeed ratings for the catalog of companies. The company name is
            sent — never any user-specific data.
          </li>
          <li>
            <strong>Public APIs (no auth).</strong> Yahoo Finance (stock
            prices), Reddit (sentiment), Hacker News (sentiment), and an FX
            rates feed. Only the company name or ticker symbol is sent.
          </li>
          <li>
            <strong>Authentication providers.</strong> If you sign in with
            Google, Google sees that you used it to access this site (standard
            OAuth). We do not share anything else with Google.
          </li>
        </ul>
        <p>
          We do not sell, rent, or trade your data. We do not run marketing
          or ad tracking pixels.
        </p>
      </Section>

      <Section title="4. Where your data lives">
        <p>
          Your account, offers, and comparisons are stored in an Azure
          Database for PostgreSQL Flexible Server hosted in East Asia. The
          web application runs on Azure Static Web Apps, also in Asia.
          Connections are encrypted in transit (TLS) and the database
          requires SSL.
        </p>
      </Section>

      <Section title="5. How long we keep it">
        <p>
          As long as your account exists. If you delete your account (email
          us — see contact below), we delete your user row, which cascades
          to: all your offers, all your comparisons, all your saved AI
          insights, your weight profile presets, and your sign-in telemetry.
          The catalog of public companies you compared against is shared
          across users and is not deleted.
        </p>
      </Section>

      <Section title="6. Your rights (India DPDPA, 2023)">
        <p>
          As a Data Principal under India&rsquo;s Digital Personal Data
          Protection Act, 2023, you can:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Ask what personal data we hold about you</li>
          <li>Ask us to correct any inaccurate personal data</li>
          <li>Ask us to delete your account and all associated data</li>
          <li>Withdraw consent at any time (which means deleting your account)</li>
          <li>Lodge a complaint with the Data Protection Board of India</li>
        </ul>
        <p>
          To exercise any of these, email{' '}
          <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          We will respond within 30 days.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>
          We set exactly one cookie: a secure, httpOnly session cookie issued
          by Auth.js (NextAuth) when you sign in. It contains your signed
          session token and lasts 7 days. We do not use analytics cookies or
          third-party cookies.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          Best-effort: HTTPS everywhere, SSL-required Postgres, OAuth via
          Google, bcrypt password hashing where applicable, and no
          plaintext credential storage. We are not a regulated financial or
          healthcare service; you should not enter information you would
          not be comfortable losing in a worst-case breach. If you discover
          a vulnerability, please report it to{' '}
          <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
          before disclosing publicly.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          The service is intended for working adults evaluating job offers.
          We do not knowingly collect data from anyone under 18. If you
          believe a child has signed up, please email us and we will delete
          the account.
        </p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          If we make a material change (e.g. start collecting a new field,
          add a new third-party processor), we will update the &ldquo;last
          updated&rdquo; date at the top of this page. For significant
          changes, signed-in users will see a notice on the dashboard the
          next time they visit.
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
          See also our <Link href="/terms" className="link">Terms of Service</Link>.
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
