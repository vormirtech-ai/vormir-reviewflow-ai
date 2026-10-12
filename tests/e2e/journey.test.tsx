// End-to-end journey through the real React app (all routes and pages) in jsdom, running against
// the in-browser demo backend with a SIMULATED AI provider. No cloud service is contacted and no
// Google review is ever posted. Canvas-based exports (PNG/PDF) cannot run in jsdom; SVG export is covered.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../src/app/App.tsx';
import { ToastProvider } from '../../src/components/toast.tsx';
import { emptyBusiness, toInput } from '../../src/features/businesses/schema.ts';
import { defaultFunnel } from '../../src/features/funnels/defaults.ts';
import { DEMO_AI_KEY } from '../../src/lib/env.ts';
import { mockApi } from '../../src/lib/mock.ts';

const REVIEW_URL = 'https://g.page/r/test-bakery/review';
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><ToastProvider><AppRoutes /></ToastProvider></MemoryRouter>);
const find = { timeout: 15_000 };

/** Seeds a published funnel through the API (the UI path is covered by the first test). */
async function seedPublishedFunnel() {
  await mockApi.signUp({ email: 'seed@example.com', password: 'password1', fullName: 'Seed', organizationName: 'Seed org' });
  const [org] = await mockApi.listOrgs();
  const business = await mockApi.saveBusiness(org.id, { ...toInput({ ...emptyBusiness, name: 'Test Bakery' }, null), google_review_url: REVIEW_URL });
  const funnel = await mockApi.saveFunnel(defaultFunnel(business));
  await mockApi.setFunnelStatus(funnel.id, 'published');
  await mockApi.signOut();
  return funnel.slug;
}

describe('business owner and customer journey', () => {
  it('signs up, creates a business and funnel, collects feedback, and reads analytics', async () => {
    const user = userEvent.setup();

    // --- create an account
    let view = open('/signup');
    await user.type(await screen.findByLabelText('Your name', undefined, find), 'Asha Rao');
    await user.type(screen.getByLabelText('Organization name'), 'Rao Hospitality');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse-1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' }, find)).toBeTruthy();
    expect(screen.getByText(/Demo mode: no Supabase project is configured/)).toBeTruthy();

    // --- create a business with its official review URL
    await user.click(screen.getByRole('link', { name: 'Businesses' }));
    await user.click((await screen.findAllByRole('link', { name: 'New business' }, find))[0]);
    await user.type(await screen.findByLabelText('Business name', undefined, find), 'Test Bakery');
    await user.type(screen.getByLabelText(/Official Google review URL/), 'http://insecure.example');
    await user.click(screen.getByRole('button', { name: 'Save business' }));
    expect(await screen.findByText(/starting with https:\/\//)).toBeTruthy(); // HTTPS is required
    await user.clear(screen.getByLabelText(/Official Google review URL/));
    await user.type(screen.getByLabelText(/Official Google review URL/), REVIEW_URL);
    await user.click(screen.getByRole('button', { name: 'Save business' }));
    expect(await screen.findByRole('heading', { name: 'Test Bakery' }, find)).toBeTruthy();
    expect(screen.getByText(REVIEW_URL)).toBeTruthy();

    // --- create and publish a funnel
    await user.click(screen.getByRole('link', { name: 'New funnel' }));
    const nameInput = (await screen.findByLabelText(/Funnel name/, undefined, find)) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe('In-store feedback'));
    const slug = (screen.getByLabelText(/Public link/) as HTMLInputElement).value;
    expect(slug).toMatch(/^test-bakery-[a-z0-9]{4}$/);
    await user.click(screen.getByRole('button', { name: 'Save and publish' }));
    expect(await screen.findByText('Funnel published', undefined, find)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText(/Public link/) as HTMLInputElement).readOnly).toBe(true)); // permanent once published
    view.unmount();

    // --- a customer opens the QR link: no login
    view = open(`/f/${slug}?src=qr`);
    await user.click(await screen.findByRole('button', { name: 'Share your feedback' }, find));
    expect(screen.getByRole('button', { name: 'Generate review suggestions' })).toHaveProperty('disabled', true); // nothing selected yet
    await user.click(screen.getByRole('button', { name: 'Friendly staff' }));
    await user.click(screen.getByRole('button', { name: 'Areas for improvement' }));
    await user.type(screen.getByLabelText(/Anything else/), 'Queue was long');
    await user.click(screen.getByRole('button', { name: 'Generate review suggestions' }));

    // --- five editable AI drafts
    expect(await screen.findByText(/AI-generated drafts/, undefined, find)).toBeTruthy();
    const drafts = within(screen.getAllByRole('list')[0]).getAllByRole('button');
    expect(drafts).toHaveLength(5);
    expect(new Set(drafts.map((d) => d.textContent)).size).toBe(5);
    await user.click(drafts[1]);
    const editor = screen.getByLabelText('Your review draft') as HTMLTextAreaElement;
    expect(editor.value).toBe(drafts[1].textContent);
    await user.type(editor, ' The queue was long.');
    await user.click(screen.getByRole('button', { name: 'Copy draft' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(await navigator.clipboard.readText()).toBe(`${drafts[1].textContent} The queue was long.`);

    // --- the Google destination is the configured URL; the customer decides what happens there
    expect(screen.getByText(/Whether you post, and the rating you give, is entirely your choice/)).toBeTruthy();
    const google = screen.getByRole('link', { name: 'Continue to Google Reviews' }) as HTMLAnchorElement;
    expect(google.href).toBe(REVIEW_URL);
    expect(google.target).toBe('_blank');
    expect(google.rel).toContain('noopener');
    google.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot navigate
    await user.click(google);
    view.unmount();

    // --- analytics: real counts from the visit above, clicks labelled as clicks
    view = open('/app/analytics');
    const visits = (await screen.findByText('Total funnel visits', undefined, find)).parentElement!;
    expect(within(visits).getByText('1')).toBeTruthy();
    const clicks = screen.getByText('Outbound Google clicks').parentElement!;
    expect(within(clicks).getByText('1')).toBeTruthy();
    expect(within(clicks).getByText('Clicks, not published reviews')).toBeTruthy();
    expect(screen.getByText(/1 of 1 requests/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'qr' })).toBeTruthy(); // QR attribution
    expect(document.body.textContent).not.toMatch(/reviews? (posted|published|received)\b/i);

    // --- download a QR code
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    await user.click(screen.getByRole('link', { name: 'QR assets' }));
    expect(((await screen.findByLabelText('Encoded link', undefined, find)) as HTMLInputElement).value).toBe(`http://localhost:3000/f/${slug}?src=qr`);
    await user.click(screen.getByRole('button', { name: 'Download SVG' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const svg = await (createObjectURL.mock.calls[0][0] as Blob).text();
    expect(svg).toContain('<svg');
    expect(await screen.findByText('Recent downloads', undefined, find)).toBeTruthy();
    view.unmount();
  }, 120_000);
});

describe('fallbacks when AI is unavailable', () => {
  it('quota exhausted: keeps the selections, offers labelled templates and manual writing, and still reaches Google', async () => {
    const slug = await seedPublishedFunnel();
    localStorage.setItem(DEMO_AI_KEY, 'quota');
    const user = userEvent.setup();
    open(`/f/${slug}`);
    await user.click(await screen.findByRole('button', { name: 'Share your feedback' }, find));
    await user.click(screen.getByRole('button', { name: 'Fast service' }));
    await user.click(screen.getByRole('button', { name: 'Generate review suggestions' }));

    expect(await screen.findByText(/AI suggestions are not available right now/, undefined, find)).toBeTruthy();
    expect(screen.queryByText(/AI-generated drafts/)).toBeNull(); // nothing fabricated
    expect(screen.getByText(/fixed sentence templates, not AI-generated/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Generate review suggestions/ })).toBeNull(); // no automatic or repeated retry

    const template = within(screen.getAllByRole('list')[0]).getAllByRole('button')[0];
    expect(template.textContent).toContain('Fast service');
    await user.click(template);
    const editor = screen.getByLabelText('Your review draft') as HTMLTextAreaElement;
    expect(editor.value).toBe(template.textContent);
    await user.clear(editor);
    await user.type(editor, 'Written entirely by me.');
    expect((screen.getByRole('link', { name: 'Continue to Google Reviews' }) as HTMLAnchorElement).href).toBe(REVIEW_URL);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Fast service' }).getAttribute('aria-pressed')).toBe('true'); // selection preserved
  }, 60_000);

  it('AI disabled: the journey works with manual writing only', async () => {
    const slug = await seedPublishedFunnel();
    localStorage.setItem(DEMO_AI_KEY, 'off');
    const user = userEvent.setup();
    open(`/f/${slug}`);
    await user.click(await screen.findByRole('button', { name: 'Share your feedback' }, find));
    expect(screen.queryByRole('button', { name: 'Generate review suggestions' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Write it myself' }));
    await user.type(screen.getByLabelText('Your review draft'), 'Honest words.');
    expect(screen.getByRole('button', { name: 'Copy draft' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('link', { name: 'Continue to Google Reviews' })).toBeTruthy();
  }, 60_000);

  it('offers Hindi when the funnel supports it', async () => {
    await mockApi.signIn('demo@example.com', 'any'); // seeds the fictional bilingual demo funnel
    await mockApi.signOut();
    const user = userEvent.setup();
    open('/f/blue-lantern-cafe');
    await user.click(await screen.findByRole('button', { name: 'हिन्दी' }, find));
    await user.click(screen.getByRole('button', { name: 'Share your feedback' }));
    expect(screen.getByRole('button', { name: 'तेज़ सेवा' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'समीक्षा के सुझाव बनाएँ' })).toBeTruthy();
  }, 60_000);
});

describe('access control in the app shell', () => {
  it('redirects signed-out visitors from the dashboard to the login page', async () => {
    open('/app/businesses');
    expect(await screen.findByRole('heading', { name: 'Log in' }, find)).toBeTruthy();
  });
  it('shows an unavailable page for unpublished or unknown funnel links', async () => {
    open('/f/does-not-exist');
    expect(await screen.findByText('This feedback page is not available', undefined, find)).toBeTruthy();
  });
  it('serves a branded 404 and the public pages', async () => {
    const view = open('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' }, find)).toBeTruthy();
    view.unmount();
    open('/pricing');
    expect(await screen.findByRole('heading', { name: 'Free during the initial release' }, find)).toBeTruthy();
    expect(document.body.textContent).toContain('Vormir Tech Solutions');
    expect(document.body.textContent).not.toMatch(/Vermer|Vormer/);
  });
});
