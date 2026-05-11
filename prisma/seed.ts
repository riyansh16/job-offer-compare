/**
 * Prisma seed: writes system weight profiles always.
 * If SEED_DEMO=true, also creates a demo user + 3 sample offers + a comparison.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PRESET_WEIGHTS } from '../src/lib/engine/presets';

const prisma = new PrismaClient();

async function main() {
  // System weight profiles.
  for (const [name, weights] of Object.entries(PRESET_WEIGHTS)) {
    const existing = await prisma.weightProfile.findFirst({
      where: { name, isPreset: true },
    });
    if (!existing) {
      await prisma.weightProfile.create({
        data: { name, isPreset: true, weights: JSON.stringify(weights) },
      });
      console.log(`Created preset profile "${name}"`);
    }
  }

  if (process.env.SEED_DEMO !== 'true') {
    console.log('Done. Set SEED_DEMO=true to also seed demo data.');
    return;
  }

  const demoEmail = 'demo@example.com';
  let user = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: demoEmail,
        name: 'Demo User',
        hashedPassword: await bcrypt.hash('demo12345', 12),
      },
    });
    console.log(`Created demo user ${demoEmail} / password demo12345`);
  }

  // Seed a broad catalog of companies: big tech, mid-size, scale-ups, and startups.
  // tickerSymbol is set for publicly traded ones (enables historical CAGR auto-fill).
  //
  // NOTE: Ratings are NOT seeded here. They are fetched live from Glassdoor +
  // Indeed via Gemini-grounded search. Run `npm run db:refresh-ratings` once
  // after seeding to populate, or rely on the daily cron via
  // /api/cron/refresh-ratings.
  const COMPANY_CATALOG: Array<{
    name: string;
    slug: string;
    tickerSymbol: string | null;
    isPublic: boolean;
    hqLocation: string;
    industry: string;
    size: string;
  }> = [
    // --- US Big Tech (public) ---
    { name: 'Microsoft', slug: 'microsoft', tickerSymbol: 'MSFT', isPublic: true,
      hqLocation: 'Redmond, WA', industry: 'Software', size: '200000+' },
    { name: 'Alphabet', slug: 'alphabet', tickerSymbol: 'GOOGL', isPublic: true,
      hqLocation: 'Mountain View, CA', industry: 'Internet', size: '180000+' },
    { name: 'Meta', slug: 'meta', tickerSymbol: 'META', isPublic: true,
      hqLocation: 'Menlo Park, CA', industry: 'Social', size: '70000+' },
    { name: 'Amazon', slug: 'amazon', tickerSymbol: 'AMZN', isPublic: true,
      hqLocation: 'Seattle, WA', industry: 'E-commerce / Cloud', size: '1500000+' },
    { name: 'Apple', slug: 'apple', tickerSymbol: 'AAPL', isPublic: true,
      hqLocation: 'Cupertino, CA', industry: 'Consumer Tech', size: '160000+' },
    { name: 'Netflix', slug: 'netflix', tickerSymbol: 'NFLX', isPublic: true,
      hqLocation: 'Los Gatos, CA', industry: 'Streaming', size: '13000+' },
    { name: 'Nvidia', slug: 'nvidia', tickerSymbol: 'NVDA', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Semiconductors', size: '30000+' },
    { name: 'Tesla', slug: 'tesla', tickerSymbol: 'TSLA', isPublic: true,
      hqLocation: 'Austin, TX', industry: 'Automotive', size: '140000+' },
    { name: 'Salesforce', slug: 'salesforce', tickerSymbol: 'CRM', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'SaaS', size: '70000+' },
    { name: 'Oracle', slug: 'oracle', tickerSymbol: 'ORCL', isPublic: true,
      hqLocation: 'Austin, TX', industry: 'Database / Cloud', size: '160000+' },
    { name: 'IBM', slug: 'ibm', tickerSymbol: 'IBM', isPublic: true,
      hqLocation: 'Armonk, NY', industry: 'Enterprise IT', size: '300000+' },
    { name: 'Adobe', slug: 'adobe', tickerSymbol: 'ADBE', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'Creative Software', size: '30000+' },
    { name: 'Intuit', slug: 'intuit', tickerSymbol: 'INTU', isPublic: true,
      hqLocation: 'Mountain View, CA', industry: 'FinTech', size: '18000+' },
    { name: 'ServiceNow', slug: 'servicenow', tickerSymbol: 'NOW', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'SaaS', size: '25000+' },
    { name: 'Snowflake', slug: 'snowflake', tickerSymbol: 'SNOW', isPublic: true,
      hqLocation: 'Bozeman, MT', industry: 'Data Warehouse', size: '7000+' },
    { name: 'Palantir', slug: 'palantir', tickerSymbol: 'PLTR', isPublic: true,
      hqLocation: 'Denver, CO', industry: 'Data / Analytics', size: '4000+' },
    { name: 'Datadog', slug: 'datadog', tickerSymbol: 'DDOG', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Observability', size: '7000+' },
    { name: 'Cloudflare', slug: 'cloudflare', tickerSymbol: 'NET', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'CDN / Security', size: '4000+' },
    { name: 'MongoDB', slug: 'mongodb', tickerSymbol: 'MDB', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Database', size: '5000+' },
    { name: 'Atlassian', slug: 'atlassian', tickerSymbol: 'TEAM', isPublic: true,
      hqLocation: 'Sydney, AU', industry: 'Developer Tools', size: '12000+' },
    { name: 'Shopify', slug: 'shopify', tickerSymbol: 'SHOP', isPublic: true,
      hqLocation: 'Ottawa, ON', industry: 'E-commerce', size: '10000+' },
    { name: 'Block', slug: 'block', tickerSymbol: 'SQ', isPublic: true,
      hqLocation: 'Oakland, CA', industry: 'FinTech', size: '12000+' },
    { name: 'Uber', slug: 'uber', tickerSymbol: 'UBER', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Mobility', size: '30000+' },
    { name: 'Airbnb', slug: 'airbnb', tickerSymbol: 'ABNB', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Travel', size: '7000+' },
    { name: 'Pinterest', slug: 'pinterest', tickerSymbol: 'PINS', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Social', size: '4000+' },
    { name: 'Snap', slug: 'snap', tickerSymbol: 'SNAP', isPublic: true,
      hqLocation: 'Santa Monica, CA', industry: 'Social', size: '5000+' },
    { name: 'Roblox', slug: 'roblox', tickerSymbol: 'RBLX', isPublic: true,
      hqLocation: 'San Mateo, CA', industry: 'Gaming', size: '2000+' },
    { name: 'Coinbase', slug: 'coinbase', tickerSymbol: 'COIN', isPublic: true,
      hqLocation: 'Remote / US', industry: 'Crypto', size: '3000+' },
    { name: 'GitLab', slug: 'gitlab', tickerSymbol: 'GTLB', isPublic: true,
      hqLocation: 'Remote / US', industry: 'DevOps', size: '2000+' },
    { name: 'Twilio', slug: 'twilio', tickerSymbol: 'TWLO', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Communications API', size: '6000+' },
    { name: 'DocuSign', slug: 'docusign', tickerSymbol: 'DOCU', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'SaaS', size: '6000+' },
    { name: 'Zoom', slug: 'zoom', tickerSymbol: 'ZM', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'Video Conferencing', size: '8000+' },

    // --- Late-stage / pre-IPO scale-ups (private) ---
    { name: 'Stripe', slug: 'stripe', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Payments', size: '8000+' },
    { name: 'Databricks', slug: 'databricks', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Data / AI Platform', size: '7000+' },
    { name: 'OpenAI', slug: 'openai', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Research', size: '2000+' },
    { name: 'Anthropic', slug: 'anthropic', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Research', size: '700+' },
    { name: 'SpaceX', slug: 'spacex', tickerSymbol: null, isPublic: false,
      hqLocation: 'Hawthorne, CA', industry: 'Aerospace', size: '13000+' },
    { name: 'Canva', slug: 'canva', tickerSymbol: null, isPublic: false,
      hqLocation: 'Sydney, AU', industry: 'Design SaaS', size: '4000+' },
    { name: 'Notion', slug: 'notion', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Productivity', size: '600+' },
    { name: 'Figma', slug: 'figma', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Design Tools', size: '1500+' },
    { name: 'Discord', slug: 'discord', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Communications', size: '900+' },
    { name: 'Reddit', slug: 'reddit', tickerSymbol: 'RDDT', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Social', size: '2000+' },
    { name: 'Plaid', slug: 'plaid', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'FinTech', size: '1500+' },
    { name: 'Brex', slug: 'brex', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'FinTech', size: '1000+' },
    { name: 'Ramp', slug: 'ramp', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'FinTech', size: '700+' },
    { name: 'Mercury', slug: 'mercury', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'FinTech', size: '700+' },
    { name: 'Vercel', slug: 'vercel', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Developer Platform', size: '500+' },
    { name: 'Linear', slug: 'linear', tickerSymbol: null, isPublic: false,
      hqLocation: 'Remote', industry: 'Project Management', size: '100+' },
    { name: 'Supabase', slug: 'supabase', tickerSymbol: null, isPublic: false,
      hqLocation: 'Remote', industry: 'Backend Platform', size: '100+' },
    { name: 'Hugging Face', slug: 'hugging-face', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'AI / ML Tools', size: '300+' },
    { name: 'Replit', slug: 'replit', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Developer Tools', size: '200+' },

    // --- Early-stage / smaller startups (private, often pay in equity) ---
    { name: 'Cursor', slug: 'cursor', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Dev Tools', size: '50+' },
    { name: 'Perplexity', slug: 'perplexity', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Search', size: '150+' },
    { name: 'Mistral AI', slug: 'mistral-ai', tickerSymbol: null, isPublic: false,
      hqLocation: 'Paris, FR', industry: 'AI Research', size: '100+' },
    { name: 'Cohere', slug: 'cohere', tickerSymbol: null, isPublic: false,
      hqLocation: 'Toronto, ON', industry: 'AI / NLP', size: '300+' },
    { name: 'Scale AI', slug: 'scale-ai', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Data', size: '900+' },
    { name: 'Modal', slug: 'modal', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'AI Infra', size: '50+' },
    { name: 'PostHog', slug: 'posthog', tickerSymbol: null, isPublic: false,
      hqLocation: 'Remote', industry: 'Product Analytics', size: '80+' },
    { name: 'Bun', slug: 'oven', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'JS Runtime', size: '20+' },
    { name: 'Resend', slug: 'resend', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Email API', size: '30+' },
    { name: 'Liveblocks', slug: 'liveblocks', tickerSymbol: null, isPublic: false,
      hqLocation: 'Paris, FR', industry: 'Realtime APIs', size: '20+' },

    // --- International (public) ---
    { name: 'SAP', slug: 'sap', tickerSymbol: 'SAP', isPublic: true,
      hqLocation: 'Walldorf, DE', industry: 'Enterprise SaaS', size: '110000+' },
    { name: 'Spotify', slug: 'spotify', tickerSymbol: 'SPOT', isPublic: true,
      hqLocation: 'Stockholm, SE', industry: 'Audio Streaming', size: '8000+' },
    { name: 'Booking.com', slug: 'booking-com', tickerSymbol: 'BKNG', isPublic: true,
      hqLocation: 'Amsterdam, NL', industry: 'Travel', size: '20000+' },
    { name: 'Adyen', slug: 'adyen', tickerSymbol: null, isPublic: true,
      hqLocation: 'Amsterdam, NL', industry: 'Payments', size: '3000+' },
    { name: 'Klarna', slug: 'klarna', tickerSymbol: null, isPublic: false,
      hqLocation: 'Stockholm, SE', industry: 'BNPL', size: '4000+' },
    { name: 'Revolut', slug: 'revolut', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'FinTech', size: '8000+' },
    { name: 'Wise', slug: 'wise', tickerSymbol: null, isPublic: true,
      hqLocation: 'London, UK', industry: 'FX / Payments', size: '5000+' },
    { name: 'Monzo', slug: 'monzo', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'FinTech', size: '3000+' },
    { name: 'Deliveroo', slug: 'deliveroo', tickerSymbol: 'ROO.L', isPublic: true,
      hqLocation: 'London, UK', industry: 'Food Delivery', size: '3000+' },

    // --- Indian tech (services + product) ---
    { name: 'TCS', slug: 'tcs', tickerSymbol: 'TCS.NS', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'IT Services', size: '600000+' },
    { name: 'Infosys', slug: 'infosys', tickerSymbol: 'INFY', isPublic: true,
      hqLocation: 'Bangalore, IN', industry: 'IT Services', size: '300000+' },
    { name: 'Wipro', slug: 'wipro', tickerSymbol: 'WIT', isPublic: true,
      hqLocation: 'Bangalore, IN', industry: 'IT Services', size: '230000+' },
    { name: 'Flipkart', slug: 'flipkart', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'E-commerce', size: '20000+' },
    { name: 'Zomato', slug: 'zomato', tickerSymbol: 'ZOMATO.NS', isPublic: true,
      hqLocation: 'Gurgaon, IN', industry: 'Food Delivery', size: '6000+' },
    { name: 'Razorpay', slug: 'razorpay', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Payments', size: '3000+' },
    { name: 'Swiggy', slug: 'swiggy', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Food Delivery', size: '7000+' },
    { name: 'PhonePe', slug: 'phonepe', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Payments', size: '3000+' },
    { name: 'Freshworks', slug: 'freshworks', tickerSymbol: 'FRSH', isPublic: true,
      hqLocation: 'San Mateo, CA', industry: 'CRM SaaS', size: '7000+' },
    { name: 'Zoho', slug: 'zoho', tickerSymbol: null, isPublic: false,
      hqLocation: 'Chennai, IN', industry: 'SaaS', size: '15000+' },

    // --- Other notable / consulting / quant ---
    { name: 'Two Sigma', slug: 'two-sigma', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Quant Trading', size: '1700+' },
    { name: 'Citadel', slug: 'citadel', tickerSymbol: null, isPublic: false,
      hqLocation: 'Miami, FL', industry: 'Hedge Fund', size: '4000+' },
    { name: 'Jane Street', slug: 'jane-street', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Quant Trading', size: '2000+' },
    { name: 'Hudson River Trading', slug: 'hudson-river-trading', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Quant Trading', size: '900+' },
    { name: 'McKinsey', slug: 'mckinsey', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Consulting', size: '45000+' },
    { name: 'Bain & Company', slug: 'bain', tickerSymbol: null, isPublic: false,
      hqLocation: 'Boston, MA', industry: 'Consulting', size: '19000+' },
    { name: 'Boston Consulting Group', slug: 'bcg', tickerSymbol: null, isPublic: false,
      hqLocation: 'Boston, MA', industry: 'Consulting', size: '32000+' },
    { name: 'Deloitte', slug: 'deloitte', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'Consulting', size: '450000+' },
    { name: 'Accenture', slug: 'accenture', tickerSymbol: 'ACN', isPublic: true,
      hqLocation: 'Dublin, IE', industry: 'Consulting', size: '750000+' },
    { name: 'Cognizant', slug: 'cognizant', tickerSymbol: 'CTSH', isPublic: true,
      hqLocation: 'Teaneck, NJ', industry: 'IT Services', size: '350000+' },
    { name: 'Capgemini', slug: 'capgemini', tickerSymbol: null, isPublic: true,
      hqLocation: 'Paris, FR', industry: 'IT Services', size: '350000+' },
    { name: 'HCLTech', slug: 'hcltech', tickerSymbol: 'HCLTECH.NS', isPublic: true,
      hqLocation: 'Noida, IN', industry: 'IT Services', size: '220000+' },
    { name: 'Tech Mahindra', slug: 'tech-mahindra', tickerSymbol: 'TECHM.NS', isPublic: true,
      hqLocation: 'Pune, IN', industry: 'IT Services', size: '150000+' },
    { name: 'Mindtree', slug: 'mindtree', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'IT Services', size: '40000+' },

    // --- Job boards / HR / recruiting ---
    // Indeed is private; we use parent Recruit Holdings (RCRUY ADR) as a proxy ticker for CAGR.
    { name: 'Indeed', slug: 'indeed', tickerSymbol: 'RCRUY', isPublic: false,
      hqLocation: 'Austin, TX', industry: 'Job Board', size: '14000+' },
    // LinkedIn is owned by Microsoft; use MSFT as the proxy ticker.
    { name: 'LinkedIn', slug: 'linkedin', tickerSymbol: 'MSFT', isPublic: false,
      hqLocation: 'Sunnyvale, CA', industry: 'Professional Network', size: '20000+' },
    { name: 'Glassdoor', slug: 'glassdoor', tickerSymbol: 'RCRUY', isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Job Board / Reviews', size: '700+' },
    { name: 'ZipRecruiter', slug: 'ziprecruiter', tickerSymbol: 'ZIP', isPublic: true,
      hqLocation: 'Santa Monica, CA', industry: 'Job Board', size: '1500+' },
    { name: 'Monster', slug: 'monster', tickerSymbol: null, isPublic: false,
      hqLocation: 'Weston, MA', industry: 'Job Board', size: '1500+' },
    { name: 'Naukri (Info Edge)', slug: 'naukri', tickerSymbol: 'NAUKRI.NS', isPublic: true,
      hqLocation: 'Noida, IN', industry: 'Job Board', size: '6000+' },
    { name: 'Dice', slug: 'dice', tickerSymbol: null, isPublic: false,
      hqLocation: 'Centennial, CO', industry: 'Tech Job Board', size: '500+' },
    { name: 'AngelList / Wellfound', slug: 'wellfound', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Startup Jobs', size: '200+' },
    { name: 'Hired', slug: 'hired', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Tech Recruiting', size: '300+' },
    { name: 'Levels.fyi', slug: 'levels-fyi', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Comp Data', size: '50+' },
    { name: 'Workday', slug: 'workday', tickerSymbol: 'WDAY', isPublic: true,
      hqLocation: 'Pleasanton, CA', industry: 'HR SaaS', size: '20000+' },
    { name: 'Greenhouse', slug: 'greenhouse', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'ATS / Recruiting', size: '700+' },
    { name: 'Lever', slug: 'lever', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'ATS / Recruiting', size: '300+' },
    { name: 'Gusto', slug: 'gusto', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Payroll / HR', size: '2500+' },
    { name: 'Rippling', slug: 'rippling', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'HR / IT Platform', size: '3500+' },
    { name: 'Deel', slug: 'deel', tickerSymbol: null, isPublic: false,
      hqLocation: 'Remote / US', industry: 'Global Payroll', size: '5000+' },
    { name: 'Remote.com', slug: 'remote-com', tickerSymbol: null, isPublic: false,
      hqLocation: 'Remote', industry: 'Global Payroll', size: '1500+' },
    { name: 'BambooHR', slug: 'bamboohr', tickerSymbol: null, isPublic: false,
      hqLocation: 'Lindon, UT', industry: 'HR SaaS', size: '1500+' },
    { name: 'Blind', slug: 'blind', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Workplace Network', size: '100+' },

    // --- More US Big Tech / large enterprise ---
    { name: 'eBay', slug: 'ebay', tickerSymbol: 'EBAY', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'E-commerce', size: '11000+' },
    { name: 'PayPal', slug: 'paypal', tickerSymbol: 'PYPL', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'Payments', size: '27000+' },
    { name: 'Cisco', slug: 'cisco', tickerSymbol: 'CSCO', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'Networking', size: '90000+' },
    { name: 'Intel', slug: 'intel', tickerSymbol: 'INTC', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Semiconductors', size: '120000+' },
    { name: 'AMD', slug: 'amd', tickerSymbol: 'AMD', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Semiconductors', size: '26000+' },
    { name: 'Qualcomm', slug: 'qualcomm', tickerSymbol: 'QCOM', isPublic: true,
      hqLocation: 'San Diego, CA', industry: 'Semiconductors', size: '50000+' },
    { name: 'Broadcom', slug: 'broadcom', tickerSymbol: 'AVGO', isPublic: true,
      hqLocation: 'Palo Alto, CA', industry: 'Semiconductors', size: '20000+' },
    { name: 'Texas Instruments', slug: 'texas-instruments', tickerSymbol: 'TXN', isPublic: true,
      hqLocation: 'Dallas, TX', industry: 'Semiconductors', size: '30000+' },
    { name: 'VMware', slug: 'vmware', tickerSymbol: null, isPublic: false,
      hqLocation: 'Palo Alto, CA', industry: 'Virtualization', size: '38000+' },
    { name: 'Dell Technologies', slug: 'dell', tickerSymbol: 'DELL', isPublic: true,
      hqLocation: 'Round Rock, TX', industry: 'Hardware', size: '120000+' },
    { name: 'HP', slug: 'hp', tickerSymbol: 'HPQ', isPublic: true,
      hqLocation: 'Palo Alto, CA', industry: 'Hardware', size: '60000+' },
    { name: 'HPE', slug: 'hpe', tickerSymbol: 'HPE', isPublic: true,
      hqLocation: 'Houston, TX', industry: 'Enterprise IT', size: '60000+' },

    // --- Gaming / entertainment ---
    { name: 'Electronic Arts', slug: 'ea', tickerSymbol: 'EA', isPublic: true,
      hqLocation: 'Redwood City, CA', industry: 'Gaming', size: '13000+' },
    { name: 'Activision Blizzard', slug: 'activision-blizzard', tickerSymbol: null, isPublic: false,
      hqLocation: 'Santa Monica, CA', industry: 'Gaming', size: '17000+' },
    { name: 'Epic Games', slug: 'epic-games', tickerSymbol: null, isPublic: false,
      hqLocation: 'Cary, NC', industry: 'Gaming', size: '6000+' },
    { name: 'Valve', slug: 'valve', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bellevue, WA', industry: 'Gaming', size: '500+' },
    { name: 'Unity', slug: 'unity', tickerSymbol: 'U', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Gaming Engine', size: '5000+' },
    { name: 'Riot Games', slug: 'riot-games', tickerSymbol: null, isPublic: false,
      hqLocation: 'Los Angeles, CA', industry: 'Gaming', size: '4500+' },
    { name: 'Take-Two Interactive', slug: 'take-two', tickerSymbol: 'TTWO', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Gaming', size: '11000+' },
    { name: 'Ubisoft', slug: 'ubisoft', tickerSymbol: null, isPublic: true,
      hqLocation: 'Paris, FR', industry: 'Gaming', size: '20000+' },

    // --- Streaming / media / consumer ---
    { name: 'Disney', slug: 'disney', tickerSymbol: 'DIS', isPublic: true,
      hqLocation: 'Burbank, CA', industry: 'Media', size: '220000+' },
    { name: 'Warner Bros. Discovery', slug: 'warner-bros-discovery', tickerSymbol: 'WBD', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Media', size: '37000+' },
    { name: 'Comcast', slug: 'comcast', tickerSymbol: 'CMCSA', isPublic: true,
      hqLocation: 'Philadelphia, PA', industry: 'Media / Telecom', size: '180000+' },

    // --- Other notable AI / data ---
    { name: 'Character.AI', slug: 'character-ai', tickerSymbol: null, isPublic: false,
      hqLocation: 'Menlo Park, CA', industry: 'AI Companions', size: '50+' },
    { name: 'Runway', slug: 'runway', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Generative Video', size: '100+' },
    { name: 'ElevenLabs', slug: 'elevenlabs', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'Voice AI', size: '100+' },
    { name: 'xAI', slug: 'xai', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Research', size: '300+' },
    { name: 'DeepMind', slug: 'deepmind', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'AI Research', size: '2000+' },

    // --- Travel / hospitality / mobility ---
    { name: 'Lyft', slug: 'lyft', tickerSymbol: 'LYFT', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Mobility', size: '3000+' },
    { name: 'DoorDash', slug: 'doordash', tickerSymbol: 'DASH', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Food Delivery', size: '8000+' },
    { name: 'Instacart', slug: 'instacart', tickerSymbol: 'CART', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Grocery Delivery', size: '4000+' },
    { name: 'Expedia', slug: 'expedia', tickerSymbol: 'EXPE', isPublic: true,
      hqLocation: 'Seattle, WA', industry: 'Travel', size: '15000+' },

    // --- Cybersecurity ---
    { name: 'CrowdStrike', slug: 'crowdstrike', tickerSymbol: 'CRWD', isPublic: true,
      hqLocation: 'Austin, TX', industry: 'Cybersecurity', size: '8000+' },
    { name: 'Palo Alto Networks', slug: 'palo-alto-networks', tickerSymbol: 'PANW', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Cybersecurity', size: '14000+' },
    { name: 'Okta', slug: 'okta', tickerSymbol: 'OKTA', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Identity', size: '6000+' },
    { name: 'Zscaler', slug: 'zscaler', tickerSymbol: 'ZS', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'Cloud Security', size: '7000+' },
    { name: 'Wiz', slug: 'wiz', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Cloud Security', size: '900+' },

    // --- More India + APAC ---
    { name: 'CRED', slug: 'cred', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'FinTech', size: '900+' },
    { name: 'Paytm', slug: 'paytm', tickerSymbol: 'PAYTM.NS', isPublic: true,
      hqLocation: 'Noida, IN', industry: 'Payments', size: '11000+' },
    { name: 'Ola', slug: 'ola', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Mobility', size: '4000+' },
    { name: 'Meesho', slug: 'meesho', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Social Commerce', size: '1700+' },
    { name: 'Zepto', slug: 'zepto', tickerSymbol: null, isPublic: false,
      hqLocation: 'Mumbai, IN', industry: 'Quick Commerce', size: '500+' },
    { name: 'BYJU\u2019S', slug: 'byjus', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'EdTech', size: '50000+' },
    { name: 'Postman', slug: 'postman', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'API Tools', size: '900+' },
    { name: 'Browserstack', slug: 'browserstack', tickerSymbol: null, isPublic: false,
      hqLocation: 'Mumbai, IN', industry: 'Dev Tools', size: '1200+' },
    { name: 'Grab', slug: 'grab', tickerSymbol: 'GRAB', isPublic: true,
      hqLocation: 'Singapore, SG', industry: 'Super App', size: '11000+' },
    { name: 'Sea Group', slug: 'sea-group', tickerSymbol: 'SE', isPublic: true,
      hqLocation: 'Singapore, SG', industry: 'Internet', size: '67000+' },
    { name: 'Rakuten', slug: 'rakuten', tickerSymbol: null, isPublic: true,
      hqLocation: 'Tokyo, JP', industry: 'E-commerce', size: '32000+' },
    { name: 'LINE', slug: 'line', tickerSymbol: null, isPublic: false,
      hqLocation: 'Tokyo, JP', industry: 'Messaging', size: '4000+' },
    { name: 'Naver', slug: 'naver', tickerSymbol: null, isPublic: true,
      hqLocation: 'Seoul, KR', industry: 'Internet', size: '4000+' },
    { name: 'Kakao', slug: 'kakao', tickerSymbol: null, isPublic: true,
      hqLocation: 'Seoul, KR', industry: 'Internet', size: '4000+' },
  ];

  for (const c of COMPANY_CATALOG) {
    await prisma.company.upsert({
      where: { slug: c.slug },
      update: {
        // Refresh metadata on every seed run so updates flow through.
        name: c.name,
        tickerSymbol: c.tickerSymbol,
        isPublic: c.isPublic,
        hqLocation: c.hqLocation,
        industry: c.industry,
        size: c.size,
      },
      create: c,
    });
  }
  console.log(`Upserted ${COMPANY_CATALOG.length} companies into the catalog.`);
  console.log('Ratings (Glassdoor / Indeed) are NOT seeded. Run `npm run db:refresh-ratings`');
  console.log('after seeding to populate from live web search via Gemini.');

  // Resolve a few we'll attach demo offers to.
  const findCompany = (slug: string) =>
    prisma.company.findUnique({ where: { slug } });
  const msft = await findCompany('microsoft');
  const googl = await findCompany('alphabet');
  const stripe = await findCompany('stripe');
  const razorpay = await findCompany('razorpay');
  const wise = await findCompany('wise');
  if (!msft || !googl || !stripe || !razorpay || !wise)
    throw new Error('seed: failed to resolve demo companies');

  const baseSchedule = JSON.stringify({ years: 4, cliffMonths: 12, cadence: 'quarterly' });

  await prisma.jobOffer.deleteMany({ where: { userId: user.id } });

  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: msft.id, title: 'Senior SWE', level: '63',
      location: 'Redmond, WA', isCurrent: true, status: 'Active',
      compensation: { create: {
        // Current role, ~1 year into a $250K/4y grant. Vests roughly 62.5K/yr.
        baseSalary: 185000, targetBonusPct: 15, signOnBonus: 0, equityTotal: 62500,
        equityVestSchedule: baseSchedule, benefitsValueAnnual: 18000, ptoDays: 22,
        workMode: 'Hybrid', commuteCostMonthly: 200, qualitativeScore: 75,
      } },
    },
  });

  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: googl.id, title: 'L5 SWE', level: 'L5',
      location: 'Mountain View, CA', status: 'Active',
      compensation: { create: {
        // New offer: $320K total grant / 4 years = $80K/yr (assuming flat schedule).
        baseSalary: 220000, targetBonusPct: 18, signOnBonus: 50000, equityTotal: 80000,
        equityVestSchedule: baseSchedule, benefitsValueAnnual: 22000, ptoDays: 20,
        workMode: 'Hybrid', commuteCostMonthly: 350, qualitativeScore: 80,
      } },
    },
  });

  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: stripe.id, title: 'Senior Engineer',
      location: 'Remote', status: 'Active',
      compensation: { create: {
        // New offer: $400K total grant / 4 years = $100K/yr.
        baseSalary: 210000, targetBonusPct: 0, signOnBonus: 25000, equityTotal: 100000,
        equityVestSchedule: baseSchedule, benefitsValueAnnual: 16000, ptoDays: 28,
        workMode: 'Remote', commuteCostMonthly: 0, qualitativeScore: 70,
      } },
    },
  });

  // Non-USD examples to showcase currency conversion.
  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: razorpay.id, title: 'Senior Engineer',
      location: 'Bangalore, IN', status: 'Active',
      compensation: { create: {
        baseSalary: 4500000, currency: 'INR',
        // ₹6M total grant / 4 years = ₹1.5M/yr.
        targetBonusPct: 12, signOnBonus: 500000, equityTotal: 1500000,
        equityVestSchedule: baseSchedule, benefitsValueAnnual: 200000, ptoDays: 25,
        workMode: 'Hybrid', commuteCostMonthly: 5000, qualitativeScore: 72,
      } },
    },
  });

  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: wise.id, title: 'Senior Backend Engineer',
      location: 'London, UK', status: 'Active',
      compensation: { create: {
        baseSalary: 95000, currency: 'GBP',
        // £80K total grant / 4 years = £20K/yr.
        targetBonusPct: 10, signOnBonus: 5000, equityTotal: 20000,
        equityVestSchedule: baseSchedule, benefitsValueAnnual: 6000, ptoDays: 28,
        workMode: 'Hybrid', commuteCostMonthly: 200, qualitativeScore: 76,
      } },
    },
  });

  console.log('Demo offers created (incl. INR + GBP). Sign in at /auth/signin with demo@example.com / demo12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
