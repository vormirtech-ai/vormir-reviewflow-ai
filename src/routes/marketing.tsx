// Public website. Static content only: no data fetching, no SDKs.
import { BarChart3, FileDown, Languages, MessageSquareText, QrCode, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Wordmark } from '../components/brand.tsx';
import { buttonClass, Card, cx } from '../components/ui.tsx';
import { CONTACT_EMAIL } from '../lib/env.ts';

const LINKS = [['/features', 'Features'], ['/how-it-works', 'How it works'], ['/pricing', 'Pricing'], ['/contact', 'Contact']] as const;

export function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Wordmark />
          <nav aria-label="Main" className="order-3 flex w-full gap-5 overflow-x-auto text-sm sm:order-none sm:w-auto">
            {LINKS.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => cx('whitespace-nowrap py-1', isActive ? 'text-paper' : 'text-muted hover:text-paper')}>{label}</NavLink>
            ))}
          </nav>
          <div className="flex gap-2">
            <Link to="/login" className={buttonClass('ghost', 'sm')}>Log in</Link>
            <Link to="/signup" className={buttonClass('primary', 'sm')}>Get started</Link>
          </div>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted">
          <p>© {new Date().getFullYear()} Vormir Tech Solutions. Vormir ReviewFlow AI.</p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link className="hover:text-paper" to="/privacy">Privacy</Link>
            <Link className="hover:text-paper" to="/terms">Terms</Link>
            <Link className="hover:text-paper" to="/contact">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const Section = ({ children, className }: { children: ReactNode; className?: string }) => <section className={cx('mx-auto max-w-6xl px-4 py-14', className)}>{children}</section>;

function PageIntro({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <Section className="!pb-4">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-silver">{lead}</p>
    </Section>
  );
}

const FEATURES: [LucideIcon, string, string][] = [
  [QrCode, 'QR codes that stay valid', 'Every published funnel gets a permanent link. Download PNG or SVG codes with your colours and logo.'],
  [MessageSquareText, 'Editable AI drafts', 'Customers pick what describes their visit and get five draft suggestions they can edit, replace or ignore.'],
  [ShieldCheck, 'Honest by design', 'No review gating, no preset ratings, no fake reviews. Every customer gets the same path to your Google page.'],
  [FileDown, 'Print-ready flyers', 'Tabletop cards, posters, receipt cards and business cards as PDF, generated in your browser.'],
  [BarChart3, 'Clear funnel analytics', 'Visits, selections, draft generation and outbound clicks, with CSV export. Clicks are never reported as reviews.'],
  [Languages, 'English and Hindi', 'Customer pages and AI drafts in both languages, switchable by the customer.'],
];

function FeatureGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map(([Icon, title, body]) => (
        <Card key={title}>
          <Icon className="mb-3 size-5 text-silver" aria-hidden />
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted">{body}</p>
        </Card>
      ))}
    </div>
  );
}

const STEPS = [
  ['Create a funnel', 'Add your business, paste your official Google review link, and choose the feedback attributes customers can pick from.'],
  ['Share the QR code', 'Print the code or flyer and place it where customers finish their visit. The link never changes.'],
  ['Customers describe their visit', 'No sign-up and no personal details. They select what applied to them and can add a note in their own words.'],
  ['They review a draft', 'Five AI-generated drafts reflect only what the customer said, including criticism. They can edit, regenerate or write their own.'],
  ['They decide on Google', 'One button opens your official review page. Posting, and the rating, is entirely the customer’s choice.'],
  ['You see the funnel', 'Track visits through to outbound clicks, by business, funnel and source.'],
];

function Steps() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map(([title, body], i) => (
        <li key={title} className="rounded-card border border-line p-5">
          <p className="eyebrow">Step {i + 1}</p>
          <h3 className="mt-2 font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted">{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function HomePage() {
  return (
    <>
      <Section className="!py-20 text-center">
        <p className="eyebrow">Vormir Tech Solutions</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Authentic customer feedback, one scan away.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-silver">
          Vormir ReviewFlow AI helps customers put their real experience into words and takes them to your official Google review page. They stay in control of every word and every rating.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/signup" className={buttonClass()}>Start free</Link>
          <Link to="/how-it-works" className={buttonClass('secondary')}>See how it works</Link>
        </div>
      </Section>
      <Section className="!pt-0"><FeatureGrid /></Section>
      <Section className="border-t border-line">
        <h2 className="mb-6 text-2xl font-semibold">From scan to honest review</h2>
        <Steps />
      </Section>
    </>
  );
}

export function FeaturesPage() {
  return (
    <>
      <PageIntro eyebrow="Features" title="Everything a local business needs to ask for feedback properly" lead="Built for cafes, restaurants, hotels, retail, salons, clinics, real estate, local services and the agencies that support them." />
      <Section><FeatureGrid /></Section>
      <Section className="!pt-0">
        <Card>
          <h2 className="font-semibold">Teams and agencies</h2>
          <p className="mt-1 text-sm text-muted">One organization can hold many businesses and funnels. Owner, Admin, Editor and Analyst roles are enforced in the database, not just in the interface.</p>
        </Card>
      </Section>
    </>
  );
}

export function HowItWorksPage() {
  return (
    <>
      <PageIntro eyebrow="How it works" title="A feedback journey that respects the customer" lead="The product is designed around Google's rules for user-generated content: real experiences, no incentives, no filtering of unhappy customers." />
      <Section><Steps /></Section>
      <Section className="!pt-0">
        <Card>
          <h2 className="font-semibold">What we do not do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>We never post a review for anyone, and we never see whether one was posted.</li>
            <li>We never send unhappy customers somewhere else. Everyone gets the same Google button.</li>
            <li>We never pre-select a star rating or write about things the customer did not mention.</li>
          </ul>
        </Card>
      </Section>
    </>
  );
}

export function PricingPage() {
  return (
    <>
      <PageIntro eyebrow="Pricing" title="Free during the initial release" lead="There is no paid plan and no checkout in this version. We do not ask for payment details." />
      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="eyebrow">Current plan</p>
            <p className="mt-2 text-3xl font-semibold">Free</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-silver">
              <li>Multiple businesses and funnels</li>
              <li>QR codes and print-ready flyers</li>
              <li>AI draft suggestions within fair-use limits</li>
              <li>Analytics with CSV export</li>
              <li>Team roles</li>
            </ul>
            <Link to="/signup" className={cx(buttonClass(), 'mt-6')}>Create an account</Link>
          </Card>
          <Card>
            <h2 className="font-semibold">Fair-use limits</h2>
            <p className="mt-2 text-sm text-muted">
              The service runs on free tiers of its cloud providers, which have quotas that can change. AI suggestions are limited per visitor and per funnel. When a limit is reached, customers can still use templates or write their own review, and the rest of the product keeps working.
            </p>
            <p className="mt-3 text-sm text-muted">We do not promise unlimited traffic, AI requests, storage or uptime. If paid options are introduced later, nothing will be charged without your explicit choice.</p>
          </Card>
        </div>
      </Section>
    </>
  );
}

function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section className="max-w-3xl">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-xs text-warning">Template text. Have it reviewed for your jurisdiction and add your legal entity details before launch.</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-silver [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-paper [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
    </Section>
  );
}

export function PrivacyPage() {
  return (
    <Legal title="Privacy notice">
      <p>Vormir ReviewFlow AI is operated by Vormir Tech Solutions. This notice covers customers who open a feedback page and businesses who use the dashboard.</p>
      <h2>Customers using a feedback page</h2>
      <ul>
        <li>No account is needed and we do not ask for your name, email address or phone number.</li>
        <li>The options you select and any note you write are sent to our server and to Google's Gemini API only to prepare draft suggestions. Notes and draft text are not stored in our database and are not added to analytics.</li>
        <li>We record anonymous events (page opened, option selected, draft requested, copy pressed, Google button pressed) against a random identifier that lasts for one browser tab. A salted hash of your IP address is kept to prevent abuse; the address itself is not stored.</li>
        <li>Your browser keeps a copy of the page settings so it still opens on a poor connection. It contains no personal data.</li>
        <li>We never see your Google account, and we do not know whether you posted a review or what you wrote there.</li>
      </ul>
      <h2>Business users</h2>
      <ul>
        <li>We store your name, email address, organization, businesses, funnels and uploaded logos to provide the service.</li>
        <li>Significant administrative changes are written to an audit log visible to your organization's owners and admins.</li>
      </ul>
      <h2>Retention</h2>
      <p>Each organization sets how long anonymous analytics events are kept (30 to 1095 days, 365 by default). Older events are deleted by a scheduled clean-up.</p>
      <h2>Processors</h2>
      <p>Supabase (database, authentication, server functions), Cloudflare (website hosting) and Google (Gemini API for draft suggestions).</p>
      <h2>Contact</h2>
      <p>For privacy questions or deletion requests, use the details on the <Link className="underline" to="/contact">contact page</Link>.</p>
    </Legal>
  );
}

export function TermsPage() {
  return (
    <Legal title="Terms of use">
      <h2>The service</h2>
      <p>Vormir ReviewFlow AI helps businesses collect authentic customer feedback and direct customers to the business's official Google review page. It is provided as is, on free-tier infrastructure, without a guarantee of availability.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use the service to create, request or post fake reviews, or reviews by people who were not customers.</li>
        <li>Do not offer discounts, gifts or other incentives in exchange for reviews or for positive ratings.</li>
        <li>Do not discourage or filter out negative feedback, and do not send dissatisfied customers to a different destination.</li>
        <li>Only enter a review link for a business you are authorised to represent.</li>
        <li>You are responsible for following Google's Maps user-generated content policy and the consumer protection law that applies to you.</li>
      </ul>
      <h2>AI-generated drafts</h2>
      <p>Suggestions are produced by an AI model from what the customer selected. They are drafts for the customer to review and edit; they can be inaccurate. The customer alone decides what, if anything, to publish.</p>
      <h2>Analytics</h2>
      <p>Counts are estimates of activity on feedback pages. An outbound click is not confirmation that a review was published.</p>
      <h2>Changes</h2>
      <p>Features and limits may change. If paid plans are introduced, they will be optional and clearly presented before any charge.</p>
    </Legal>
  );
}

export function ContactPage() {
  return (
    <>
      <PageIntro eyebrow="Contact" title="Talk to Vormir Tech Solutions" lead="Questions about setup, your data, or using ReviewFlow for several client businesses? We are glad to help." />
      <Section>
        <Card className="max-w-xl">
          {CONTACT_EMAIL
            ? <p className="text-sm text-silver">Email us at <a className="text-paper underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We aim to reply within two business days.</p>
            : <p className="text-sm text-muted">A contact address has not been configured for this deployment yet. Set <code>VITE_CONTACT_EMAIL</code> to show it here.</p>}
        </Card>
      </Section>
    </>
  );
}
