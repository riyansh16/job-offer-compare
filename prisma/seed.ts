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
  // NOTE: Ratings are NOT seeded here. They are fetched live from Indeed +
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

    // --- Banks / payments / fintech (public) ---
    { name: 'JPMorgan Chase', slug: 'jpmorgan', tickerSymbol: 'JPM', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Investment Bank', size: '300000+' },
    { name: 'Goldman Sachs', slug: 'goldman-sachs', tickerSymbol: 'GS', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Investment Bank', size: '45000+' },
    { name: 'Morgan Stanley', slug: 'morgan-stanley', tickerSymbol: 'MS', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Investment Bank', size: '80000+' },
    { name: 'BlackRock', slug: 'blackrock', tickerSymbol: 'BLK', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Asset Management', size: '19000+' },
    { name: 'American Express', slug: 'american-express', tickerSymbol: 'AXP', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Payments', size: '70000+' },
    { name: 'Visa', slug: 'visa', tickerSymbol: 'V', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Payments', size: '28000+' },
    { name: 'Mastercard', slug: 'mastercard', tickerSymbol: 'MA', isPublic: true,
      hqLocation: 'Purchase, NY', industry: 'Payments', size: '33000+' },
    { name: 'Robinhood', slug: 'robinhood', tickerSymbol: 'HOOD', isPublic: true,
      hqLocation: 'Menlo Park, CA', industry: 'Brokerage', size: '2000+' },
    { name: 'Affirm', slug: 'affirm', tickerSymbol: 'AFRM', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'BNPL / FinTech', size: '2500+' },

    // --- Quant / HFT / market making ---
    { name: 'D. E. Shaw', slug: 'de-shaw', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Quant Hedge Fund', size: '2000+' },
    { name: 'Millennium Management', slug: 'millennium', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Hedge Fund', size: '5500+' },
    { name: 'Point72', slug: 'point72', tickerSymbol: null, isPublic: false,
      hqLocation: 'Stamford, CT', industry: 'Hedge Fund', size: '2700+' },
    { name: 'Optiver', slug: 'optiver', tickerSymbol: null, isPublic: false,
      hqLocation: 'Amsterdam, NL', industry: 'Market Maker', size: '2000+' },
    { name: 'IMC Trading', slug: 'imc-trading', tickerSymbol: null, isPublic: false,
      hqLocation: 'Amsterdam, NL', industry: 'Market Maker', size: '1500+' },
    { name: 'Susquehanna International Group', slug: 'susquehanna', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bala Cynwyd, PA', industry: 'Quant / Market Maker', size: '3000+' },
    { name: 'Tower Research Capital', slug: 'tower-research', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'HFT', size: '1000+' },
    { name: 'Jump Trading', slug: 'jump-trading', tickerSymbol: null, isPublic: false,
      hqLocation: 'Chicago, IL', industry: 'HFT', size: '1000+' },
    { name: 'Akuna Capital', slug: 'akuna-capital', tickerSymbol: null, isPublic: false,
      hqLocation: 'Chicago, IL', industry: 'HFT', size: '700+' },

    // --- Enterprise SaaS (public) ---
    { name: 'HubSpot', slug: 'hubspot', tickerSymbol: 'HUBS', isPublic: true,
      hqLocation: 'Cambridge, MA', industry: 'CRM / Marketing', size: '8000+' },
    { name: 'Zendesk', slug: 'zendesk', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Customer Support SaaS', size: '6000+' },
    { name: 'Box', slug: 'box', tickerSymbol: 'BOX', isPublic: true,
      hqLocation: 'Redwood City, CA', industry: 'Content Cloud', size: '2700+' },
    { name: 'Dropbox', slug: 'dropbox', tickerSymbol: 'DBX', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'File Sync', size: '2700+' },
    { name: 'Asana', slug: 'asana', tickerSymbol: 'ASAN', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Work Management', size: '1800+' },
    { name: 'Monday.com', slug: 'monday', tickerSymbol: 'MNDY', isPublic: true,
      hqLocation: 'Tel Aviv, IL', industry: 'Work Management', size: '2200+' },
    { name: 'Confluent', slug: 'confluent', tickerSymbol: 'CFLT', isPublic: true,
      hqLocation: 'Mountain View, CA', industry: 'Streaming Data', size: '2900+' },
    { name: 'Elastic', slug: 'elastic', tickerSymbol: 'ESTC', isPublic: true,
      hqLocation: 'Mountain View, CA', industry: 'Search / Observability', size: '3500+' },
    { name: 'Smartsheet', slug: 'smartsheet', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bellevue, WA', industry: 'Work Management', size: '3500+' },

    // --- AI startups (new wave) ---
    { name: 'Glean', slug: 'glean', tickerSymbol: null, isPublic: false,
      hqLocation: 'Palo Alto, CA', industry: 'Enterprise Search AI', size: '600+' },
    { name: 'Harvey', slug: 'harvey', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Legal AI', size: '400+' },
    { name: 'Sierra', slug: 'sierra', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Conversational AI', size: '300+' },
    { name: 'Decagon', slug: 'decagon', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'Customer Support AI', size: '150+' },
    { name: 'Together AI', slug: 'together-ai', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Cloud / Inference', size: '200+' },
    { name: 'Replicate', slug: 'replicate', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Francisco, CA', industry: 'AI Model Hosting', size: '60+' },
    { name: 'Stability AI', slug: 'stability-ai', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'Generative AI', size: '150+' },
    { name: 'CoreWeave', slug: 'coreweave', tickerSymbol: 'CRWV', isPublic: true,
      hqLocation: 'Roseland, NJ', industry: 'AI Cloud / GPU', size: '900+' },
    { name: 'Suno', slug: 'suno', tickerSymbol: null, isPublic: false,
      hqLocation: 'Cambridge, MA', industry: 'Generative Music AI', size: '100+' },

    // --- Semiconductors / hardware (public) ---
    { name: 'ARM', slug: 'arm', tickerSymbol: 'ARM', isPublic: true,
      hqLocation: 'Cambridge, UK', industry: 'Semiconductor IP', size: '7000+' },
    { name: 'ASML', slug: 'asml', tickerSymbol: 'ASML', isPublic: true,
      hqLocation: 'Veldhoven, NL', industry: 'Lithography', size: '40000+' },
    { name: 'TSMC', slug: 'tsmc', tickerSymbol: 'TSM', isPublic: true,
      hqLocation: 'Hsinchu, TW', industry: 'Foundry', size: '76000+' },
    { name: 'Marvell', slug: 'marvell', tickerSymbol: 'MRVL', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Semiconductors', size: '6500+' },
    { name: 'Micron', slug: 'micron', tickerSymbol: 'MU', isPublic: true,
      hqLocation: 'Boise, ID', industry: 'Memory Semis', size: '48000+' },
    { name: 'Analog Devices', slug: 'analog-devices', tickerSymbol: 'ADI', isPublic: true,
      hqLocation: 'Wilmington, MA', industry: 'Analog Semis', size: '24000+' },
    { name: 'Applied Materials', slug: 'applied-materials', tickerSymbol: 'AMAT', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Semi Equipment', size: '34000+' },
    { name: 'Lam Research', slug: 'lam-research', tickerSymbol: 'LRCX', isPublic: true,
      hqLocation: 'Fremont, CA', industry: 'Semi Equipment', size: '17000+' },
    { name: 'Synopsys', slug: 'synopsys', tickerSymbol: 'SNPS', isPublic: true,
      hqLocation: 'Sunnyvale, CA', industry: 'EDA / Chip Design', size: '20000+' },

    // --- More Indian startups ---
    { name: 'Zerodha', slug: 'zerodha', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Brokerage', size: '1100+' },
    { name: 'Groww', slug: 'groww', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Brokerage / FinTech', size: '1100+' },
    { name: 'OYO', slug: 'oyo', tickerSymbol: null, isPublic: false,
      hqLocation: 'Gurgaon, IN', industry: 'Hospitality', size: '4000+' },
    { name: 'Nykaa', slug: 'nykaa', tickerSymbol: 'NYKAA.NS', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'Beauty E-commerce', size: '4500+' },
    { name: 'BharatPe', slug: 'bharatpe', tickerSymbol: null, isPublic: false,
      hqLocation: 'New Delhi, IN', industry: 'Payments', size: '1000+' },
    { name: 'Dream11', slug: 'dream11', tickerSymbol: null, isPublic: false,
      hqLocation: 'Mumbai, IN', industry: 'Fantasy Sports', size: '900+' },
    { name: 'Lenskart', slug: 'lenskart', tickerSymbol: null, isPublic: false,
      hqLocation: 'Faridabad, IN', industry: 'Eyewear Retail', size: '15000+' },
    { name: 'PhysicsWallah', slug: 'physicswallah', tickerSymbol: null, isPublic: false,
      hqLocation: 'Noida, IN', industry: 'EdTech', size: '7000+' },
    { name: 'Honasa (Mamaearth)', slug: 'honasa', tickerSymbol: 'HONASA.NS', isPublic: true,
      hqLocation: 'Gurgaon, IN', industry: 'Consumer Brands', size: '1100+' },

    // --- Indian ad-tech / consumer internet / unicorns ---
    { name: 'InMobi', slug: 'inmobi', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Mobile Ad-Tech', size: '2500+' },
    { name: 'Glance', slug: 'glance', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Content / Lock-Screen', size: '600+' },
    { name: 'ShareChat', slug: 'sharechat', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Social Media', size: '1500+' },
    { name: 'Myntra', slug: 'myntra', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Fashion E-commerce', size: '4500+' },
    { name: 'MakeMyTrip', slug: 'makemytrip', tickerSymbol: 'MMYT', isPublic: true,
      hqLocation: 'Gurgaon, IN', industry: 'Online Travel', size: '4000+' },
    { name: 'ixigo', slug: 'ixigo', tickerSymbol: 'IXIGO.NS', isPublic: true,
      hqLocation: 'Gurgaon, IN', industry: 'Online Travel', size: '600+' },
    { name: 'Delhivery', slug: 'delhivery', tickerSymbol: 'DELHIVERY.NS', isPublic: true,
      hqLocation: 'Gurgaon, IN', industry: 'Logistics', size: '60000+' },
    { name: 'PB Fintech (Policybazaar)', slug: 'pb-fintech', tickerSymbol: 'POLICYBZR.NS', isPublic: true,
      hqLocation: 'Gurgaon, IN', industry: 'InsurTech', size: '14000+' },
    { name: 'Ola Electric', slug: 'ola-electric', tickerSymbol: 'OLAELEC.NS', isPublic: true,
      hqLocation: 'Bangalore, IN', industry: 'Electric Vehicles', size: '4000+' },
    { name: 'Urban Company', slug: 'urban-company', tickerSymbol: null, isPublic: false,
      hqLocation: 'Gurgaon, IN', industry: 'Home Services', size: '1500+' },
    { name: 'Cars24', slug: 'cars24', tickerSymbol: null, isPublic: false,
      hqLocation: 'Gurgaon, IN', industry: 'Used Auto Marketplace', size: '8000+' },
    { name: 'Spinny', slug: 'spinny', tickerSymbol: null, isPublic: false,
      hqLocation: 'Gurgaon, IN', industry: 'Used Auto Marketplace', size: '2500+' },
    { name: 'Pine Labs', slug: 'pine-labs', tickerSymbol: null, isPublic: false,
      hqLocation: 'Noida, IN', industry: 'Payments Infra', size: '3000+' },
    { name: 'Acko', slug: 'acko', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'InsurTech', size: '1500+' },
    { name: 'PharmEasy', slug: 'pharmeasy', tickerSymbol: null, isPublic: false,
      hqLocation: 'Mumbai, IN', industry: 'HealthTech', size: '4500+' },
    { name: 'Practo', slug: 'practo', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'HealthTech', size: '1000+' },
    { name: 'Cult.fit', slug: 'cult-fit', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Fitness / Wellness', size: '2500+' },
    { name: 'Unacademy', slug: 'unacademy', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'EdTech', size: '4000+' },
    { name: 'upGrad', slug: 'upgrad', tickerSymbol: null, isPublic: false,
      hqLocation: 'Mumbai, IN', industry: 'EdTech', size: '4000+' },
    { name: 'Eruditus', slug: 'eruditus', tickerSymbol: null, isPublic: false,
      hqLocation: 'Mumbai, IN', industry: 'Executive Education', size: '2500+' },
    { name: 'Mu Sigma', slug: 'mu-sigma', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bangalore, IN', industry: 'Analytics', size: '3500+' },

    // --- More gaming ---
    { name: 'Nintendo', slug: 'nintendo', tickerSymbol: 'NTDOY', isPublic: true,
      hqLocation: 'Kyoto, JP', industry: 'Gaming', size: '7000+' },
    { name: 'Sony Interactive Entertainment', slug: 'sony-interactive', tickerSymbol: 'SONY', isPublic: true,
      hqLocation: 'San Mateo, CA', industry: 'Gaming / PlayStation', size: '12000+' },
    { name: 'Bungie', slug: 'bungie', tickerSymbol: null, isPublic: false,
      hqLocation: 'Bellevue, WA', industry: 'Gaming', size: '1200+' },
    { name: 'Square Enix', slug: 'square-enix', tickerSymbol: null, isPublic: true,
      hqLocation: 'Tokyo, JP', industry: 'Gaming', size: '5000+' },
    { name: 'Bethesda', slug: 'bethesda', tickerSymbol: null, isPublic: false,
      hqLocation: 'Rockville, MD', industry: 'Gaming', size: '2000+' },
    { name: 'Capcom', slug: 'capcom', tickerSymbol: null, isPublic: true,
      hqLocation: 'Osaka, JP', industry: 'Gaming', size: '3000+' },
    { name: 'CD Projekt', slug: 'cd-projekt', tickerSymbol: null, isPublic: true,
      hqLocation: 'Warsaw, PL', industry: 'Gaming', size: '1100+' },

    // --- Defense / aerospace ---
    { name: 'Lockheed Martin', slug: 'lockheed-martin', tickerSymbol: 'LMT', isPublic: true,
      hqLocation: 'Bethesda, MD', industry: 'Defense / Aerospace', size: '122000+' },
    { name: 'Boeing', slug: 'boeing', tickerSymbol: 'BA', isPublic: true,
      hqLocation: 'Arlington, VA', industry: 'Aerospace', size: '170000+' },
    { name: 'RTX', slug: 'rtx', tickerSymbol: 'RTX', isPublic: true,
      hqLocation: 'Arlington, VA', industry: 'Defense / Aerospace', size: '185000+' },
    { name: 'Northrop Grumman', slug: 'northrop-grumman', tickerSymbol: 'NOC', isPublic: true,
      hqLocation: 'Falls Church, VA', industry: 'Defense', size: '101000+' },
    { name: 'General Dynamics', slug: 'general-dynamics', tickerSymbol: 'GD', isPublic: true,
      hqLocation: 'Reston, VA', industry: 'Defense', size: '111000+' },
    { name: 'BAE Systems', slug: 'bae-systems', tickerSymbol: null, isPublic: true,
      hqLocation: 'London, UK', industry: 'Defense', size: '100000+' },
    { name: 'Anduril', slug: 'anduril', tickerSymbol: null, isPublic: false,
      hqLocation: 'Costa Mesa, CA', industry: 'Defense Tech', size: '4000+' },
    { name: 'Shield AI', slug: 'shield-ai', tickerSymbol: null, isPublic: false,
      hqLocation: 'San Diego, CA', industry: 'Defense / Autonomy', size: '700+' },

    // --- Big 4 consulting / strategy ---
    { name: 'PwC', slug: 'pwc', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'Professional Services', size: '370000+' },
    { name: 'EY', slug: 'ey', tickerSymbol: null, isPublic: false,
      hqLocation: 'London, UK', industry: 'Professional Services', size: '395000+' },
    { name: 'KPMG', slug: 'kpmg', tickerSymbol: null, isPublic: false,
      hqLocation: 'Amstelveen, NL', industry: 'Professional Services', size: '270000+' },
    { name: 'Oliver Wyman', slug: 'oliver-wyman', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Management Consulting', size: '6000+' },
    { name: 'Kearney', slug: 'kearney', tickerSymbol: null, isPublic: false,
      hqLocation: 'Chicago, IL', industry: 'Management Consulting', size: '5300+' },

    // --- E-commerce / Retail (public) ---
    { name: 'Wayfair', slug: 'wayfair', tickerSymbol: 'W', isPublic: true,
      hqLocation: 'Boston, MA', industry: 'E-commerce / Home', size: '12000+' },
    { name: 'Etsy', slug: 'etsy', tickerSymbol: 'ETSY', isPublic: true,
      hqLocation: 'Brooklyn, NY', industry: 'E-commerce / Marketplace', size: '2400+' },
    { name: 'Chewy', slug: 'chewy', tickerSymbol: 'CHWY', isPublic: true,
      hqLocation: 'Plantation, FL', industry: 'Pet E-commerce', size: '21000+' },

    // --- Health tech ---
    { name: 'Athenahealth', slug: 'athenahealth', tickerSymbol: null, isPublic: false,
      hqLocation: 'Boston, MA', industry: 'Healthcare IT / EHR', size: '7000+' },
    { name: 'Epic Systems', slug: 'epic-systems', tickerSymbol: null, isPublic: false,
      hqLocation: 'Verona, WI', industry: 'Healthcare IT / EHR', size: '13000+' },
    { name: 'Veeva Systems', slug: 'veeva', tickerSymbol: 'VEEV', isPublic: true,
      hqLocation: 'Pleasanton, CA', industry: 'Life Sciences SaaS', size: '7400+' },
    { name: 'GE HealthCare', slug: 'ge-healthcare', tickerSymbol: 'GEHC', isPublic: true,
      hqLocation: 'Chicago, IL', industry: 'Medical Devices', size: '51000+' },
    { name: 'Teladoc Health', slug: 'teladoc', tickerSymbol: 'TDOC', isPublic: true,
      hqLocation: 'Purchase, NY', industry: 'Telehealth', size: '5500+' },

    // --- AdTech / marketing (public) ---
    { name: 'Zeta', slug: 'zeta', tickerSymbol: 'ZETA', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Marketing / AdTech', size: '2200+' },
    { name: 'The Trade Desk', slug: 'the-trade-desk', tickerSymbol: 'TTD', isPublic: true,
      hqLocation: 'Ventura, CA', industry: 'Programmatic AdTech', size: '3400+' },
    { name: 'AppLovin', slug: 'applovin', tickerSymbol: 'APP', isPublic: true,
      hqLocation: 'Palo Alto, CA', industry: 'Mobile AdTech', size: '1900+' },
    { name: 'Criteo', slug: 'criteo', tickerSymbol: 'CRTO', isPublic: true,
      hqLocation: 'Paris, FR', industry: 'Retargeting / AdTech', size: '3500+' },

    // --- More banking / fintech (public) ---
    { name: 'Capital One', slug: 'capital-one', tickerSymbol: 'COF', isPublic: true,
      hqLocation: 'McLean, VA', industry: 'Banking / FinTech', size: '55000+' },
    { name: 'Charles Schwab', slug: 'charles-schwab', tickerSymbol: 'SCHW', isPublic: true,
      hqLocation: 'Westlake, TX', industry: 'Brokerage', size: '35000+' },
    { name: 'Discover Financial', slug: 'discover', tickerSymbol: 'DFS', isPublic: true,
      hqLocation: 'Riverwoods, IL', industry: 'Payments / Banking', size: '21000+' },

    // --- Networking / data center / storage ---
    { name: 'Akamai', slug: 'akamai', tickerSymbol: 'AKAM', isPublic: true,
      hqLocation: 'Cambridge, MA', industry: 'CDN / Edge', size: '10500+' },
    { name: 'Fastly', slug: 'fastly', tickerSymbol: 'FSLY', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'CDN / Edge', size: '1200+' },
    { name: 'Equinix', slug: 'equinix', tickerSymbol: 'EQIX', isPublic: true,
      hqLocation: 'Redwood City, CA', industry: 'Data Centers', size: '13000+' },
    { name: 'Arista Networks', slug: 'arista', tickerSymbol: 'ANET', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Networking', size: '4000+' },
    { name: 'Nutanix', slug: 'nutanix', tickerSymbol: 'NTNX', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'Hybrid Cloud Infra', size: '7000+' },
    { name: 'Pure Storage', slug: 'pure-storage', tickerSymbol: 'PSTG', isPublic: true,
      hqLocation: 'Santa Clara, CA', industry: 'Flash Storage', size: '5800+' },
    { name: 'NetApp', slug: 'netapp', tickerSymbol: 'NTAP', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'Storage / Cloud Data', size: '12000+' },

    // --- More cybersecurity (public) ---
    { name: 'Fortinet', slug: 'fortinet', tickerSymbol: 'FTNT', isPublic: true,
      hqLocation: 'Sunnyvale, CA', industry: 'Network Security', size: '14000+' },
    { name: 'SentinelOne', slug: 'sentinelone', tickerSymbol: 'S', isPublic: true,
      hqLocation: 'Mountain View, CA', industry: 'Endpoint Security', size: '2400+' },

    // --- Observability / DevOps (public) ---
    { name: 'Dynatrace', slug: 'dynatrace', tickerSymbol: 'DT', isPublic: true,
      hqLocation: 'Waltham, MA', industry: 'Observability', size: '4500+' },
    { name: 'JFrog', slug: 'jfrog', tickerSymbol: 'FROG', isPublic: true,
      hqLocation: 'Sunnyvale, CA', industry: 'DevOps / Artifact Mgmt', size: '1700+' },

    // --- More enterprise SaaS (public) ---
    { name: 'Toast', slug: 'toast', tickerSymbol: 'TOST', isPublic: true,
      hqLocation: 'Boston, MA', industry: 'Restaurant SaaS', size: '5500+' },
    { name: 'Bill.com', slug: 'bill-com', tickerSymbol: 'BILL', isPublic: true,
      hqLocation: 'San Jose, CA', industry: 'SMB FinTech SaaS', size: '3200+' },
    { name: 'Procore', slug: 'procore', tickerSymbol: 'PCOR', isPublic: true,
      hqLocation: 'Carpinteria, CA', industry: 'Construction SaaS', size: '4000+' },
    { name: 'Pegasystems', slug: 'pegasystems', tickerSymbol: 'PEGA', isPublic: true,
      hqLocation: 'Cambridge, MA', industry: 'BPM / CRM SaaS', size: '5500+' },

    // --- More Indian IT services (public, NSE) ---
    { name: 'LTIMindtree', slug: 'ltimindtree', tickerSymbol: 'LTIM.NS', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'IT Services', size: '84000+' },
    { name: 'Mphasis', slug: 'mphasis', tickerSymbol: 'MPHASIS.NS', isPublic: true,
      hqLocation: 'Bangalore, IN', industry: 'IT Services', size: '31000+' },
    { name: 'Persistent Systems', slug: 'persistent-systems', tickerSymbol: 'PERSISTENT.NS', isPublic: true,
      hqLocation: 'Pune, IN', industry: 'IT Services', size: '23000+' },
    { name: 'Coforge', slug: 'coforge', tickerSymbol: 'COFORGE.NS', isPublic: true,
      hqLocation: 'Noida, IN', industry: 'IT Services', size: '25000+' },

    // --- Global / European banks (public) ---
    { name: 'HSBC', slug: 'hsbc', tickerSymbol: 'HSBC', isPublic: true,
      hqLocation: 'London, UK', industry: 'Universal Bank', size: '220000+' },
    { name: 'Standard Chartered', slug: 'standard-chartered', tickerSymbol: 'SCBFF', isPublic: true,
      hqLocation: 'London, UK', industry: 'Universal Bank', size: '85000+' },
    { name: 'Barclays', slug: 'barclays', tickerSymbol: 'BCS', isPublic: true,
      hqLocation: 'London, UK', industry: 'Investment Bank', size: '90000+' },
    { name: 'Deutsche Bank', slug: 'deutsche-bank', tickerSymbol: 'DB', isPublic: true,
      hqLocation: 'Frankfurt, DE', industry: 'Investment Bank', size: '90000+' },
    { name: 'UBS', slug: 'ubs', tickerSymbol: 'UBS', isPublic: true,
      hqLocation: 'Zurich, CH', industry: 'Investment Bank / WM', size: '110000+' },
    { name: 'BNP Paribas', slug: 'bnp-paribas', tickerSymbol: 'BNPQY', isPublic: true,
      hqLocation: 'Paris, FR', industry: 'Universal Bank', size: '180000+' },
    { name: 'Nomura', slug: 'nomura', tickerSymbol: 'NMR', isPublic: true,
      hqLocation: 'Tokyo, JP', industry: 'Investment Bank', size: '27000+' },

    // --- US money-center banks (public) ---
    { name: 'Citi', slug: 'citi', tickerSymbol: 'C', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Universal Bank', size: '230000+' },
    { name: 'Wells Fargo', slug: 'wells-fargo', tickerSymbol: 'WFC', isPublic: true,
      hqLocation: 'San Francisco, CA', industry: 'Universal Bank', size: '220000+' },
    { name: 'Bank of America', slug: 'bank-of-america', tickerSymbol: 'BAC', isPublic: true,
      hqLocation: 'Charlotte, NC', industry: 'Universal Bank', size: '213000+' },

    // --- Indian banks (public, NSE) ---
    { name: 'HDFC Bank', slug: 'hdfc-bank', tickerSymbol: 'HDB', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'Universal Bank', size: '195000+' },
    { name: 'ICICI Bank', slug: 'icici-bank', tickerSymbol: 'IBN', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'Universal Bank', size: '130000+' },
    { name: 'State Bank of India', slug: 'sbi', tickerSymbol: 'SBIN.NS', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'Universal Bank', size: '235000+' },
    { name: 'Axis Bank', slug: 'axis-bank', tickerSymbol: 'AXISBANK.NS', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'Universal Bank', size: '105000+' },
    { name: 'Kotak Mahindra Bank', slug: 'kotak-mahindra-bank', tickerSymbol: 'KOTAKBANK.NS', isPublic: true,
      hqLocation: 'Mumbai, IN', industry: 'Universal Bank', size: '105000+' },

    // --- Financial data / media / index providers ---
    { name: 'Bloomberg LP', slug: 'bloomberg', tickerSymbol: null, isPublic: false,
      hqLocation: 'New York, NY', industry: 'Financial Data / Media', size: '21000+' },
    { name: 'LSEG (Refinitiv)', slug: 'lseg', tickerSymbol: 'LSEG.L', isPublic: true,
      hqLocation: 'London, UK', industry: 'Financial Data / Exchange', size: '25000+' },
    { name: 'S&P Global', slug: 'sp-global', tickerSymbol: 'SPGI', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Ratings / Financial Data', size: '40000+' },
    { name: 'Moody\u2019s', slug: 'moodys', tickerSymbol: 'MCO', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Ratings / Financial Data', size: '15000+' },
    { name: 'MSCI', slug: 'msci', tickerSymbol: 'MSCI', isPublic: true,
      hqLocation: 'New York, NY', industry: 'Index / Analytics', size: '6000+' },
    { name: 'FactSet', slug: 'factset', tickerSymbol: 'FDS', isPublic: true,
      hqLocation: 'Norwalk, CT', industry: 'Financial Data', size: '12000+' },
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
  console.log('Ratings (Indeed) are NOT seeded. Run `npm run db:refresh-ratings`');
  console.log('after seeding to populate from live web search via Gemini.');

  // Resolve a few we'll attach demo offers to.
  const findCompany = (slug: string) =>
    prisma.company.findUnique({ where: { slug } });
  const msft = await findCompany('microsoft');
  const googl = await findCompany('alphabet');
  const stripe = await findCompany('stripe');
  const razorpay = await findCompany('razorpay');
  if (!msft || !googl || !stripe || !razorpay)
    throw new Error('seed: failed to resolve demo companies');

  await prisma.jobOffer.deleteMany({ where: { userId: user.id } });

  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: msft.id, title: 'Senior SWE', level: '63',
      location: 'Redmond, WA', isCurrent: true,
      compensation: { create: {
        // Current role, ~1 year into a $250K/4y grant. Vests roughly 62.5K/yr.
        baseSalary: 185000, targetBonusPct: 15, signOnBonus: 0, equityTotal: 62500,
        benefitsValueAnnual: 18000, ptoDays: 22,
        workMode: 'Hybrid', commuteCostMonthly: 200, qualitativeScore: 75,
      } },
    },
  });

  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: googl.id, title: 'L5 SWE', level: 'L5',
      location: 'Mountain View, CA',
      compensation: { create: {
        // New offer: $320K total grant / 4 years = $80K/yr (assuming flat schedule).
        baseSalary: 220000, targetBonusPct: 18, signOnBonus: 50000, equityTotal: 80000,
        benefitsValueAnnual: 22000, ptoDays: 20,
        workMode: 'Hybrid', commuteCostMonthly: 350, qualitativeScore: 80,
      } },
    },
  });

  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: stripe.id, title: 'Senior Engineer',
      location: 'Remote',
      compensation: { create: {
        // New offer: $400K total grant / 4 years = $100K/yr.
        baseSalary: 210000, targetBonusPct: 0, signOnBonus: 25000, equityTotal: 100000,
        benefitsValueAnnual: 16000, ptoDays: 28,
        workMode: 'Remote', commuteCostMonthly: 0, qualitativeScore: 70,
      } },
    },
  });

  // Indian-market example.
  await prisma.jobOffer.create({
    data: {
      userId: user.id, companyId: razorpay.id, title: 'Senior Engineer',
      location: 'Bangalore, IN',
      compensation: { create: {
        baseSalary: 4500000,
        // ₹6M total grant / 4 years = ₹1.5M/yr.
        targetBonusPct: 12, signOnBonus: 500000, equityTotal: 1500000,
        benefitsValueAnnual: 200000, ptoDays: 25,
        workMode: 'Hybrid', commuteCostMonthly: 5000, qualitativeScore: 72,
      } },
    },
  });

  console.log('Demo offers created. Sign in at /auth/signin with demo@example.com / demo12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
