import { describe, expect, it } from 'vitest';
import { APP_GUIDE, findGuideEntry, guideIndex, howToTopic } from './app-guide';

describe('the app guide', () => {
  it('has every entry in French and English, with a title, keywords and some text', () => {
    expect(APP_GUIDE.length).toBeGreaterThanOrEqual(12);
    const ids = new Set<string>();
    for (const entry of APP_GUIDE) {
      expect(ids.has(entry.id), entry.id).toBe(false);
      ids.add(entry.id);
      for (const lang of ['fr', 'en'] as const) {
        expect(entry.title[lang].length, `${entry.id} title ${lang}`).toBeGreaterThan(3);
        expect(entry.text[lang].length, `${entry.id} text ${lang}`).toBeGreaterThan(120);
      }
      expect(entry.keywords.length, entry.id).toBeGreaterThan(3);
    }
  });

  it('states no amount, no phone number and no date (they come from tools)', () => {
    for (const entry of APP_GUIDE) {
      for (const lang of ['fr', 'en'] as const) {
        const text = entry.text[lang];
        expect(text, `${entry.id} ${lang}`).not.toMatch(/\d[\d\s.,]*\s?(FCFA|XAF|F CFA)/i);
        expect(text, `${entry.id} ${lang}`).not.toMatch(/\b6\d{8}\b|\+237/);
        // Durations and rates are rule values: the tools give them, the guide never does.
        expect(text, `${entry.id} ${lang}`).not.toMatch(
          /\d+\s?(minutes?|min\b|heures?|hours?|jours?|days?|%)/i,
        );
      }
    }
  });

  it('writes French with "tu" and never "vous"', () => {
    for (const entry of APP_GUIDE) {
      expect(entry.text.fr, entry.id).not.toMatch(/\b(vous|votre|vos)\b/i);
    }
  });

  it('mentions only screens that exist in the app', () => {
    const real = ['Njangi', 'Groupe', 'Caisse', 'Votes', 'Moi'];
    const all = APP_GUIDE.map((e) => e.text.fr + e.text.en).join(' ');
    for (const tab of real) expect(all).toContain(tab);
    expect(all).not.toMatch(/Wallet|Portefeuille|Dashboard|Tableau de bord/);
  });

  it('lists its topics in the member’s language', () => {
    expect(guideIndex('fr')).toHaveLength(APP_GUIDE.length);
    expect(guideIndex('en')[0]).toEqual({ id: 'overview', title: 'A tour of the app' });
  });
});

describe('findGuideEntry', () => {
  it.each([
    ['overview', 'overview'],
    ['payer', 'pay'],
    ['Comment je paie ma cotisation', 'pay'],
    ['withdraw my money', 'withdraw'],
    ['où voir mes prêts', 'loans'],
    ['loans', 'loans'],
    ['enchère', 'bids'],
    ['vote secret', 'votes'],
    ['caisse de secours', 'funds'],
    ['why do I have a fine', 'fines'],
    ['réunion', 'meetings'],
    ['@njangi dans le chat', 'chat'],
    ['relevé pdf', 'statements'],
    ['changer mon numéro', 'account'],
    ['qui voit mon numéro', 'privacy'],
  ])('"%s" points to %s', (topic, id) => {
    expect(findGuideEntry(topic)?.id).toBe(id);
  });

  it('gives nothing for a topic it does not know', () => {
    expect(findGuideEntry('')).toBeNull();
    expect(findGuideEntry('la météo de demain')).toBeNull();
  });

  it('does not match a short keyword inside another word', () => {
    // "tour" must not match "retour", "pin" must not match "pinceau", "ai" is not a keyword.
    expect(findGuideEntry('retour de pinceau')).toBeNull();
    expect(findGuideEntry('je vais bien')).toBeNull();
  });
});

describe('howToTopic: a question about the app, never an order', () => {
  it.each([
    ['Comment je paie ma cotisation ?', 'pay'],
    ['Comment retirer mon argent ?', 'withdraw'],
    ['Où voir mes prêts ?', 'loans'],
    ['Where can I see my loans?', 'loans'],
    ['How do I vote?', 'votes'],
    ['C’est quoi la caisse de secours ?', 'funds'],
    ["C'est quoi un vote secret ?", 'votes'],
    ['What is the solidarity fund?', 'funds'],
    ['Explique-moi les enchères', 'bids'],
    ['How does the group chat work?', 'chat'],
    ['À quoi sert le registre ?', 'funds'],
    ["Aide-moi à comprendre l'application", 'overview'],
  ])('%s -> %s', (text, id) => {
    expect(howToTopic(text)?.id).toBe(id);
  });

  it.each([
    'Paie ma cotisation',
    'Pay my dues',
    'Retire 20 000',
    'Je veux emprunter 50 000 sur 3 mois',
    'Vote oui',
    'Bonjour',
    'Merci beaucoup',
    'Qui n’a pas encore payé ?',
    'Je dois combien ?',
  ])('"%s" is not a how-to question', (text) => {
    expect(howToTopic(text)).toBeNull();
  });

  it('is not a how-to question when no topic fits', () => {
    expect(howToTopic('Comment va la météo ?')).toBeNull();
  });
});
