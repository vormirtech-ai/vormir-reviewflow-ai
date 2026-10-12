import type { Language } from '../../types.ts';

const en = {
  privacy: 'No sign-up needed. We do not ask for your name, email or phone number. Your notes are used only to prepare suggestions and are not stored.',
  pick: (max: number) => `Choose up to ${max} that describe your visit`,
  notes: 'Anything else you would like to mention? (optional)',
  notesPlaceholder: 'In your own words…',
  generate: 'Generate review suggestions',
  generating: 'Preparing suggestions…',
  writeOwn: 'Write it myself',
  aiNote: 'Suggestions are AI-generated drafts based only on what you select. Read and edit them before using.',
  aiLabel: 'AI-generated drafts. Choose one, then edit it so it says what you mean.',
  regenerate: 'Regenerate suggestions',
  regenerateLeft: (n: number) => `${n} left`,
  templatesTitle: 'Simple templates',
  templatesLabel: 'These are fixed sentence templates, not AI-generated text.',
  useThis: 'Use this',
  yourDraft: 'Your review draft',
  draftPlaceholder: 'Write your honest review here…',
  copy: 'Copy draft',
  copied: 'Copied',
  copyManual: 'Copying is not available in this browser. Press and hold the text above to select and copy it.',
  beforeGoogle: 'On Google you can paste this draft, change it, or ignore it. Whether you post, and the rating you give, is entirely your choice.',
  continueGoogle: 'Continue to Google Reviews',
  back: 'Back',
  selectFirst: 'Select at least one option to get suggestions.',
  poweredBy: 'Feedback page by',
  language: 'Language',
};

const hi: typeof en = {
  privacy: 'साइन-अप की ज़रूरत नहीं। हम आपका नाम, ईमेल या फ़ोन नंबर नहीं माँगते। आपके नोट्स केवल सुझाव तैयार करने के लिए इस्तेमाल होते हैं और सहेजे नहीं जाते।',
  pick: (max) => `अपने अनुभव के अनुसार अधिकतम ${max} विकल्प चुनें`,
  notes: 'क्या आप कुछ और बताना चाहेंगे? (वैकल्पिक)',
  notesPlaceholder: 'अपने शब्दों में…',
  generate: 'समीक्षा के सुझाव बनाएँ',
  generating: 'सुझाव तैयार हो रहे हैं…',
  writeOwn: 'मैं खुद लिखूँगा/लिखूँगी',
  aiNote: 'सुझाव AI द्वारा बनाए गए ड्राफ़्ट हैं, जो केवल आपके चुने विकल्पों पर आधारित हैं। इस्तेमाल से पहले पढ़ें और बदलें।',
  aiLabel: 'AI द्वारा बनाए गए ड्राफ़्ट। एक चुनें और उसे अपने अनुसार बदलें।',
  regenerate: 'नए सुझाव बनाएँ',
  regenerateLeft: (n) => `${n} बाकी`,
  templatesTitle: 'सरल टेम्पलेट',
  templatesLabel: 'ये तय वाक्य-टेम्पलेट हैं, AI द्वारा बनाया गया टेक्स्ट नहीं।',
  useThis: 'यह चुनें',
  yourDraft: 'आपकी समीक्षा का ड्राफ़्ट',
  draftPlaceholder: 'अपनी ईमानदार समीक्षा यहाँ लिखें…',
  copy: 'ड्राफ़्ट कॉपी करें',
  copied: 'कॉपी हो गया',
  copyManual: 'इस ब्राउज़र में कॉपी उपलब्ध नहीं है। ऊपर के टेक्स्ट को दबाकर रखें, चुनें और कॉपी करें।',
  beforeGoogle: 'Google पर आप यह ड्राफ़्ट पेस्ट कर सकते हैं, बदल सकते हैं या छोड़ सकते हैं। पोस्ट करना है या नहीं, और कितनी रेटिंग देनी है, यह पूरी तरह आपका निर्णय है।',
  continueGoogle: 'Google समीक्षा पर जाएँ',
  back: 'वापस',
  selectFirst: 'सुझाव पाने के लिए कम से कम एक विकल्प चुनें।',
  poweredBy: 'फ़ीडबैक पेज:',
  language: 'भाषा',
};

export const STRINGS: Record<Language, typeof en> = { en, hi };
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', hi: 'हिन्दी' };

/** Fixed sentence templates built only from the customer's own selections. Shown as templates, never as AI. */
export function buildTemplates(business: string, labels: string[], language: Language): string[] {
  if (!labels.length) return [];
  const list = labels.join(', ');
  return language === 'hi'
    ? [`मैं ${business} गया/गई था/थी। मेरे अनुभव के बारे में: ${list}।`, `${business} के बारे में मेरी ईमानदार राय: ${list}।`, `${business} में मेरा अनुभव: ${list}।`]
    : [`I visited ${business}. My feedback covers: ${list}.`, `My honest take on ${business}: ${list}.`, `About my experience at ${business}: ${list}.`];
}
