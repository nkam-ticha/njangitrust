import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiEn, uiFr } from '@njangi/shared/i18n';
import { describe, expect, it } from 'vitest';
import { APP_GUIDE, findGuideEntry, guideIndex, howToTopic } from './app-guide';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '../../../../mobile');
const APP_DIR = path.join(MOBILE, 'app');
const SCREENS = path.join(MOBILE, 'src/screens');

const normal = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ').trim();

/** Every string of the UI copy: what a button, tab or title can read. */
function leaves(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(normal(value));
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) leaves(child, out);
  }
  return out;
}
const FR_LABELS = leaves(uiFr);
const EN_LABELS = leaves(uiEn);

const quoted = (text: string, open: string, close: string): string[] =>
  [...text.matchAll(new RegExp(`${open}([^${close}]+)${close}`, 'g'))].map((m) => normal(m[1]!));
const unquoted = (text: string, open: string, close: string): string =>
  text.replace(new RegExp(`${open}[^${close}]+${close}`, 'g'), '');

describe('the app guide', () => {
  it('has every entry in French and English, with a title, keywords, routes and some text', () => {
    expect(APP_GUIDE.length).toBeGreaterThanOrEqual(20);
    const ids = new Set<string>();
    for (const entry of APP_GUIDE) {
      expect(ids.has(entry.id), entry.id).toBe(false);
      ids.add(entry.id);
      for (const lang of ['fr', 'en'] as const) {
        expect(entry.title[lang].length, `${entry.id} title ${lang}`).toBeGreaterThan(3);
        expect(entry.text[lang].length, `${entry.id} text ${lang}`).toBeGreaterThan(120);
      }
      expect(entry.keywords.length, entry.id).toBeGreaterThan(3);
      expect(entry.routes.length, entry.id).toBeGreaterThan(0);
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
});

describe('the guide cannot drift from the app: every label is a real one', () => {
  it('quotes French labels with « » and English labels with “ ”, never the other way round', () => {
    for (const entry of APP_GUIDE) {
      expect(entry.text.fr, entry.id).not.toMatch(/[“”]/);
      expect(entry.text.en, entry.id).not.toMatch(/[«»]/);
    }
  });

  it('names only French labels that exist in ui.fr.ts', () => {
    const missing: string[] = [];
    for (const entry of APP_GUIDE) {
      for (const label of quoted(entry.text.fr, '«', '»')) {
        if (!FR_LABELS.has(label)) missing.push(`${entry.id}: «${label}»`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names only English labels that exist in ui.en.ts', () => {
    const missing: string[] = [];
    for (const entry of APP_GUIDE) {
      for (const label of quoted(entry.text.en, '“', '”')) {
        if (!EN_LABELS.has(label)) missing.push(`${entry.id}: “${label}”`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never names a tab or section outside quotes, so no wrong-language label slips in', () => {
    const TABS = /\b(Caisse|Groupe|Moi|Réglages|Funds|Settings)\b/;
    for (const entry of APP_GUIDE) {
      expect(unquoted(entry.text.fr, '«', '»'), `${entry.id} fr`).not.toMatch(TABS);
      expect(unquoted(entry.text.en, '“', '”'), `${entry.id} en`).not.toMatch(
        /\b(Caisse|Groupe|Moi|Réglages)\b/,
      );
    }
  });

  it('speaks of the five tabs by their real names in each language', () => {
    const overview = APP_GUIDE.find((e) => e.id === 'overview')!;
    for (const key of ['njangi', 'groupe', 'caisse', 'votes', 'moi'] as const) {
      expect(quoted(overview.text.fr, '«', '»')).toContain(uiFr.nav.tabs[key]);
      expect(quoted(overview.text.en, '“', '”')).toContain(uiEn.nav.tabs[key]);
    }
    // The English app is not the French one.
    expect(uiEn.nav.tabs.moi).toBe('Me');
    expect(overview.text.en).not.toContain('“Moi”');
  });

  it('knows the sections of the funds tab by their real names in each language', () => {
    const funds = APP_GUIDE.find((e) => e.id === 'funds')!;
    for (const key of ['tour', 'fund', 'solidarity', 'ledger'] as const) {
      expect(quoted(funds.text.fr, '«', '»')).toContain(uiFr.caisse.segments[key]);
      expect(quoted(funds.text.en, '“', '”')).toContain(uiEn.caisse.segments[key]);
    }
  });

  it('points only to route files that exist, and covers every screen of the app', () => {
    const cited = new Set(APP_GUIDE.flatMap((e) => e.routes));
    for (const route of cited) {
      expect(existsSync(path.join(APP_DIR, `${route}.tsx`)), route).toBe(true);
    }
    const real: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          // (dev): the design gallery. developer: the operator console, not a member's screen.
          if (name !== '(dev)' && name !== 'developer') walk(full, `${prefix}${name}/`);
        } else if (name.endsWith('.tsx') && name !== '_layout.tsx') {
          real.push(`${prefix}${name.replace(/\.tsx$/, '')}`);
        }
      }
    };
    walk(APP_DIR, '');
    expect(real.length).toBeGreaterThan(15);
    // A new screen must be described: add it to the guide (and its labels to the test above).
    expect(real.filter((route) => !cited.has(route))).toEqual([]);
  });

  it('describes the tabs the app really has', () => {
    const layout = readFileSync(path.join(APP_DIR, '(app)/(tabs)/_layout.tsx'), 'utf8');
    const tabs = [...layout.matchAll(/<Tabs\.Screen name="(\w+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual(['index', 'groupe', 'caisse', 'votes', 'moi']);
  });

  // The guide says where a button is. The screen's source must use that very label, or the guide
  // is describing a button that is not on that screen.
  const ANCHORS: [file: string, keys: string[]][] = [
    [
      'moi/MoiTab.tsx',
      [
        'moi.paymentNumber',
        'moi.language',
        'moi.groups',
        'moi.settingsTitle',
        'members.title',
        'loans.title',
        'meetings.title',
        'moi.statements',
        'moi.agentHistory',
        'groupSettings.pinResets',
        'groupSettings.rules',
        'security.logoutEverywhere',
        'moi.logout',
        'privacy.delete.title',
        'paymentNumber.title',
      ],
    ],
    ['caisse/CaisseTab.tsx', ['caisse.segments.']],
    [
      'caisse/MyMoney.tsx',
      ['agent.chips.pay', 'withdraw.titleGeneric', 'moi.debts', 'moi.available'],
    ],
    ['caisse/TourSection.tsx', ['caisse.tour.breakdown', 'invite.founding.add']],
    ['caisse/FundSection.tsx', ['caisse.fund.availableForLoans', 'caisse.fund.requestLoan']],
    ['caisse/SolidaritySection.tsx', ['caisse.solidarity.request', 'solidarityRequest.prepare']],
    ['caisse/WithdrawSheet.tsx', ['withdraw.all', 'withdraw.prepare']],
    [
      'votes/VotesTab.tsx',
      ['votes.propose', 'votes.open', 'votes.closed', 'invite.founding.title'],
    ],
    [
      'newProposal/NewProposalScreen.tsx',
      ['newProposal.title', 'newProposal.prepare', 'votes.types.'],
    ],
    [
      'loans/LoansScreen.tsx',
      [
        'loans.request.prepare',
        'loans.mine.title',
        'loans.mine.repayNow',
        'loans.queue.title',
        'loans.queue.approve',
        'loans.queue.reject',
      ],
    ],
    ['bids/BiddingPanel.tsx', ['bidding.place', 'bidding.raise']],
    ['meetings/MeetingsScreen.tsx', ['meetings.upcoming', 'meetings.past', 'meetings.schedule']],
    [
      'meetings/MeetingDetailScreen.tsx',
      [
        'meetings.agenda.add',
        'meetings.checkIn.button',
        'meetings.excuse.button',
        'meetings.attendance.title',
      ],
    ],
    ['meetings/MinutesPanel.tsx', ['meetings.minutes.generate', 'meetings.minutes.publish']],
    ['statements/StatementsScreen.tsx', ['statements.generate']],
    ['notifications/NotificationsScreen.tsx', ['notifications.markAllRead']],
    [
      'shell/GroupSwitcherSheet.tsx',
      [
        'groupSwitcher.title',
        'groupSwitcher.create',
        'groupSwitcher.join',
        'welcome.invitationHelp.paste',
      ],
    ],
    ['founding/FoundingScreen.tsx', ['invite.founding.add', 'startCycle.title']],
    ['founding/InviteSheet.tsx', ['invite.founding.create']],
    [
      'groupe/GroupeTab.tsx',
      [
        'chat.attachMenu.photo',
        'chat.attachMenu.camera',
        'chat.attachMenu.video',
        'chat.attachMenu.document',
        'chat.message.reply',
        'chat.message.copyText',
        'chat.message.tagAgent',
        'chat.message.delete',
        'chat.pinned.label',
      ],
    ],
    ['njangi/NjangiTab.tsx', ['agentHistory.title', 'welcome.create']],
    ['pinResets/PinResetReviewScreen.tsx', ['pinReset.admin.confirm', 'pinReset.admin.decline']],
  ];
  it.each(ANCHORS)('%s really uses the labels the guide names', (file, keys) => {
    const source = readFileSync(path.join(SCREENS, file), 'utf8');
    for (const key of keys) expect(source, `${file}: ${key}`).toContain(key);
  });

  it('sends the member to the real "Funds" sections that the screen builds', () => {
    const tab = readFileSync(path.join(SCREENS, 'caisse/CaisseTab.tsx'), 'utf8');
    expect(tab).toContain("['tour', 'fund', 'solidarity', 'ledger']");
  });
});

describe('the guide index', () => {
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
    ['caisse de secours', 'solidarity'],
    ['solidarity fund', 'solidarity'],
    ['why do I have a fine', 'fines'],
    ['réunion', 'meetings'],
    ['@njangi dans le chat', 'chat'],
    ['relevé pdf', 'statements'],
    ['changer mon numéro', 'account'],
    ['qui voit mon numéro', 'privacy'],
    ['code PIN oublié', 'pin_resets'],
    ['inviter un membre fondateur', 'founding'],
    ['créer une njangi', 'start'],
    ['changer de groupe', 'groups'],
    ['voir les règles', 'rules'],
    ['liste des membres', 'members'],
    ['nouvelle proposition', 'new_proposal'],
    ['heures calmes', 'notifications'],
    ['historique de l’assistant', 'history'],
    ['what can you do', 'assistant'],
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
    ['C’est quoi la caisse de secours ?', 'solidarity'],
    ["C'est quoi un vote secret ?", 'votes'],
    ['What is the solidarity fund?', 'solidarity'],
    ['Explique-moi les enchères', 'bids'],
    ['How does the group chat work?', 'chat'],
    ['À quoi sert le registre ?', 'funds'],
    ["Aide-moi à comprendre l'application", 'overview'],
    // Where-do-I-find questions in both languages.
    ['Où je trouve les membres du groupe ?', 'members'],
    ['Where do I find the rules?', 'rules'],
    ['Je ne trouve pas le bouton pour retirer mon argent', 'withdraw'],
    ['I can’t find where to change my language', 'account'],
    ['Quel onglet pour voir les réunions ?', 'meetings'],
    ['Which tab has the ledger?', 'funds'],
    ['Que peux-tu faire pour moi ?', 'assistant'],
    ['What can you do?', 'assistant'],
    ['Comment créer une njangi ?', 'start'],
    ['Comment changer de groupe ?', 'groups'],
    ['Comment faire une proposition ?', 'new_proposal'],
    ['Comment inviter un membre fondateur ?', 'founding'],
    ['Où voir mes notifications ?', 'notifications'],
    ['How do I send a photo in the chat?', 'chat'],
    ['J’ai oublié mon code PIN, comment faire ?', 'pin_resets'],
    ['Where is my statement?', 'statements'],
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
    'Ajoute Hervé Kamga par vote',
    'Propose Carine comme admin',
    'Add Hervé to the group',
  ])('"%s" is not a how-to question', (text) => {
    expect(howToTopic(text)).toBeNull();
  });

  it('is not a how-to question when no topic fits', () => {
    expect(howToTopic('Comment va la météo ?')).toBeNull();
  });
});
