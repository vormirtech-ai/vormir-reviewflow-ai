// The customer feedback journey. Pure UI + local state: the page and the builder preview both render it.
import { useRef, useState, type CSSProperties } from 'react';
import type { ClientEventType } from '../../../supabase/functions/_shared/validate.ts';
import type { GenerateOutcome } from '../../lib/publicApi.ts';
import type { Language, PublicFunnel } from '../../types.ts';
import { buildTemplates, LANGUAGE_NAMES, STRINGS } from './i18n.ts';

export interface FunnelViewProps {
  funnel: PublicFunnel;
  aiAvailable: boolean;
  maxNoteChars: number;
  onTrack: (type: ClientEventType, attributeId?: string) => void;
  generate: (input: { attributeIds: string[]; notes: string; language: Language }) => Promise<GenerateOutcome>;
}

/** Black or white, whichever reads better on the given background. */
export function readableOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.55 ? '#111111' : '#ffffff';
}

const primaryButton = 'w-full rounded-lg border border-current/20 bg-[var(--fb-primary)] px-4 py-3 text-base font-semibold text-[var(--fb-on-primary)] disabled:opacity-50';
const quietButton = 'w-full rounded-lg border border-current/30 px-4 py-3 text-base font-medium disabled:opacity-50';

export function FunnelView({ funnel, aiAvailable, maxNoteChars, onTrack, generate }: FunnelViewProps) {
  const [step, setStep] = useState<'welcome' | 'feedback' | 'draft'>('welcome');
  const [language, setLanguage] = useState<Language>(funnel.defaultLanguage);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [drafts, setDrafts] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [aiOff, setAiOff] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const editor = useRef<HTMLTextAreaElement>(null);
  const notesTracked = useRef(false);

  const t = STRINGS[language];
  const label = (a: PublicFunnel['attributes'][number]) => (language === 'hi' && a.labelHi) || a.label;
  const selectedLabels = funnel.attributes.filter((a) => selected.includes(a.id)).map(label);
  const canUseAi = aiAvailable && !aiOff;
  const templates = buildTemplates(funnel.businessName, selectedLabels, language);

  function toggle(id: string) {
    if (selected.includes(id)) return setSelected(selected.filter((x) => x !== id));
    if (selected.length >= funnel.maxSelections) return;
    setSelected([...selected, id]);
    onTrack('attribute_select', id);
  }

  async function runGenerate() {
    if (busy) return; // no duplicate submissions
    setBusy(true);
    setNotice('');
    const out = await generate({ attributeIds: selected, notes, language });
    setBusy(false);
    if (out.ok) {
      setDrafts(out.drafts);
      setRemaining(out.remaining);
    } else {
      // Everything the customer entered is kept. Limit/quota/config errors are not retried automatically.
      setNotice(out.message);
      if (out.code !== 'provider_timeout' && out.code !== 'network') setAiOff(true);
    }
    setStep('draft');
  }

  async function copy() {
    onTrack('copy');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      editor.current?.select();
      setCopyState('manual');
    }
  }

  const style = {
    '--fb-bg': funnel.backgroundColor,
    '--fb-fg': readableOn(funnel.backgroundColor),
    '--fb-primary': funnel.primaryColor,
    '--fb-on-primary': readableOn(funnel.primaryColor),
    colorScheme: readableOn(funnel.backgroundColor) === '#ffffff' ? 'dark' : 'light',
  } as CSSProperties;

  return (
    <div style={style} lang={language} className="flex min-h-full flex-col bg-[var(--fb-bg)] text-[var(--fb-fg)]">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
        <header className="flex flex-col items-center gap-3 text-center">
          {funnel.logoUrl
            ? <img src={funnel.logoUrl} alt={`${funnel.businessName} logo`} className="h-16 max-w-[60%] object-contain" />
            : <div aria-hidden className="flex size-14 items-center justify-center rounded-full border border-current/30 text-xl font-semibold">{funnel.businessName.slice(0, 1).toUpperCase()}</div>}
          <p className="text-lg font-semibold">{funnel.businessName}</p>
        </header>

        {funnel.languages.length > 1 && (
          <div role="group" aria-label={t.language} className="flex justify-center gap-2">
            {funnel.languages.map((l) => (
              <button key={l} type="button" aria-pressed={l === language} onClick={() => setLanguage(l)}
                className={`rounded-full border px-3 py-1 text-sm ${l === language ? 'border-current font-semibold' : 'border-current/30 opacity-70'}`}>
                {LANGUAGE_NAMES[l]}
              </button>
            ))}
          </div>
        )}

        {step === 'welcome' && (
          <section className="flex flex-col gap-4 text-center">
            <h1 className="text-2xl font-semibold leading-snug">{funnel.heading || funnel.businessName}</h1>
            {funnel.description && <p className="opacity-80">{funnel.description}</p>}
            <button type="button" className={primaryButton} onClick={() => setStep('feedback')}>{funnel.ctaText}</button>
            <p className="text-xs opacity-70">{t.privacy}</p>
          </section>
        )}

        {step === 'feedback' && (
          <section className="flex flex-col gap-4">
            {funnel.instructions && <p className="opacity-80">{funnel.instructions}</p>}
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t.pick(funnel.maxSelections)}</legend>
              <div className="flex flex-wrap gap-2">
                {funnel.attributes.map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button key={a.id} type="button" aria-pressed={on} onClick={() => toggle(a.id)} disabled={!on && selected.length >= funnel.maxSelections}
                      className={`rounded-full border px-3.5 py-2 text-sm disabled:opacity-40 ${on ? 'border-transparent bg-[var(--fb-primary)] font-medium text-[var(--fb-on-primary)]' : 'border-current/30'}`}>
                      {label(a)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {funnel.allowNotes && (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">{t.notes}</span>
                <textarea value={notes} maxLength={maxNoteChars} rows={3} placeholder={t.notesPlaceholder}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => { if (notes.trim() && !notesTracked.current) { notesTracked.current = true; onTrack('notes_added'); } }}
                  className="w-full rounded-lg border border-current/30 bg-transparent px-3 py-2 text-base" />
                <span className="mt-1 block text-right text-xs opacity-60">{notes.length}/{maxNoteChars}</span>
              </label>
            )}
            {canUseAi && (
              <>
                <button type="button" className={primaryButton} disabled={busy || selected.length === 0} aria-busy={busy} onClick={runGenerate}>
                  {busy ? t.generating : t.generate}
                </button>
                <p className="text-xs opacity-70">{selected.length === 0 ? t.selectFirst : t.aiNote}</p>
              </>
            )}
            <button type="button" className={canUseAi ? quietButton : primaryButton} disabled={busy} onClick={() => { onTrack('manual_write'); setStep('draft'); }}>
              {t.writeOwn}
            </button>
          </section>
        )}

        {step === 'draft' && (
          <section className="flex flex-col gap-4">
            {notice && <p role="status" className="rounded-lg border border-current/30 px-3 py-2 text-sm">{notice}</p>}

            {drafts.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">{t.aiLabel}</p>
                <ul className="flex flex-col gap-2">
                  {drafts.map((d, i) => (
                    <li key={i}>
                      <button type="button" aria-pressed={text === d} onClick={() => { setText(d); setCopyState('idle'); onTrack('draft_select'); }}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm ${text === d ? 'border-current' : 'border-current/25'}`}>
                        {d}
                      </button>
                    </li>
                  ))}
                </ul>
                {canUseAi && remaining !== null && remaining > 0 && (
                  <button type="button" className={`${quietButton} mt-2 !py-2 text-sm`} disabled={busy} aria-busy={busy} onClick={runGenerate}>
                    {busy ? t.generating : `${t.regenerate} (${t.regenerateLeft(remaining)})`}
                  </button>
                )}
              </div>
            )}

            {drafts.length === 0 && templates.length > 0 && (
              <div>
                <p className="text-sm font-medium">{t.templatesTitle}</p>
                <p className="mb-2 text-xs opacity-70">{t.templatesLabel}</p>
                <ul className="flex flex-col gap-2">
                  {templates.map((tpl) => (
                    <li key={tpl}>
                      <button type="button" onClick={() => { setText(tpl); setCopyState('idle'); onTrack('template_used'); }}
                        className="w-full rounded-lg border border-current/25 px-3 py-2.5 text-left text-sm">
                        {tpl}
                      </button>
                    </li>
                  ))}
                </ul>
                {canUseAi && selected.length > 0 && (
                  <button type="button" className={`${quietButton} mt-2 !py-2 text-sm`} disabled={busy} aria-busy={busy} onClick={runGenerate}>
                    {busy ? t.generating : t.generate}
                  </button>
                )}
              </div>
            )}

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">{t.yourDraft}</span>
              <textarea ref={editor} value={text} rows={6} maxLength={2000} placeholder={t.draftPlaceholder}
                onChange={(e) => { setText(e.target.value); setCopyState('idle'); }}
                className="w-full rounded-lg border border-current/30 bg-transparent px-3 py-2 text-base" />
            </label>
            <button type="button" className={quietButton} disabled={!text.trim()} onClick={copy}>
              {copyState === 'copied' ? t.copied : t.copy}
            </button>
            <p aria-live="polite" className="text-xs opacity-80">{copyState === 'manual' ? t.copyManual : ''}</p>

            <p className="text-sm opacity-80">{t.beforeGoogle}</p>
            {/* A real link, so no pop-up blocker can interfere. Clicking it proves nothing about a published review. */}
            <a href={funnel.reviewUrl} target="_blank" rel="noopener noreferrer" onClick={() => onTrack('google_click')} className={`${primaryButton} block text-center no-underline`}>
              {t.continueGoogle}
            </a>
            <button type="button" className="text-sm underline opacity-70" onClick={() => setStep('feedback')}>{t.back}</button>
          </section>
        )}

        <footer className="mt-auto pt-6 text-center text-xs opacity-60">
          {t.poweredBy} Vormir ReviewFlow AI · <a className="underline" href="/privacy">Privacy</a>
        </footer>
      </main>
    </div>
  );
}
