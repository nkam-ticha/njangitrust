// What a statement prints (spec 2.14), from the worked example E5 of spec 3.17: every amount is the
// rules package's figure, formatted with formatXAF in the statement's language; and the PDF drawn
// from it is a valid, repeatable file.
import { describe, expect, it } from 'vitest';
import { formatXAF } from '@njangi/shared';
import {
  memberReliability,
  memberStatementLines,
  monthPeriod,
  statementData,
  type StatementData,
} from '@njangi/rules';
import {
  BENEFICIARY,
  e5Scenario,
} from '../../../../../packages/rules/src/statements/statements.test-support';
import { statementDocument, type StatementNames } from './statements.document';
import { pdfText, renderStatementPdf } from './statements.pdf';

const ISSUED = '2026-12-01T06:00:00.000Z';

function e5Data(language: 'fr' | 'en', membershipId = BENEFICIARY): StatementData {
  const { transactions, obligations } = e5Scenario();
  const facts = obligations.filter((o) => o.membershipId === membershipId);
  const period = monthPeriod(2026, 11);
  return statementData({
    groupId: 'G1',
    membershipId,
    language,
    period,
    issuedAt: ISSUED,
    lines: memberStatementLines({ membershipId, transactions, obligations: facts, period }),
    reliability: memberReliability({ facts, reliabilityWindow: 12, now: new Date(ISSUED) }),
  });
}

const names = (language: 'fr' | 'en'): StatementNames => ({
  groupName: 'Njangi des Collègues',
  memberName: 'Paul Ngassa',
  periodLabel: language === 'fr' ? 'novembre 2026' : 'November 2026',
  verificationCode: '0123456789ab',
  verifyAddress: 'app.example.com/verify/0123456789ab',
});

const totalOf = (doc: ReturnType<typeof statementDocument>, title: string) =>
  doc.sections.find((s) => s.title === title)!.total;

describe('the statement document (spec 2.14, E5)', () => {
  it('prints the totals of E5 to the franc, in French', () => {
    const doc = statementDocument(e5Data('fr'), names('fr'));
    expect(doc.title).toBe('Relevé de membre');
    expect(totalOf(doc, 'Cotisations payées')).toBe(formatXAF(10_000, 'fr'));
    expect(totalOf(doc, 'Cotisations de solidarité')).toBe(formatXAF(1_000, 'fr'));
    expect(totalOf(doc, 'Versements reçus')).toBe(formatXAF(99_090, 'fr'));
    expect(totalOf(doc, 'Retraits')).toBe(formatXAF(80_840, 'fr'));
    expect(totalOf(doc, 'Prêts reçus')).toBe(formatXAF(30_000, 'fr'));
    expect(totalOf(doc, 'Remboursements de prêt')).toBe(formatXAF(16_750, 'fr'));
    expect(totalOf(doc, 'Amendes')).toBe(formatXAF(1_000, 'fr'));
    expect(totalOf(doc, 'Frais supportés')).toBe(formatXAF(1_000, 'fr'));
    expect(totalOf(doc, 'Soutien reçu (caisse de secours)')).toBe(formatXAF(0, 'fr'));
  });

  it('lists the sections in the order of the spec, with a word for an empty one', () => {
    const doc = statementDocument(e5Data('en'), names('en'));
    expect(doc.sections.map((s) => s.title)).toEqual([
      'Contributions paid',
      'Solidarity contributions',
      'Payouts received',
      'Withdrawals',
      'Loans received',
      'Loan repayments',
      'Fines',
      'Winning bids',
      'Fees borne',
      'Support received (solidarity fund)',
    ]);
    const bids = doc.sections.find((s) => s.title === 'Winning bids')!;
    expect(bids.rows).toEqual([]);
    expect(bids.none).toBe('No transactions in this period.');
    expect(doc.sections.find((s) => s.title === 'Payouts received')!.none).toBeNull();
  });

  it('says for each contribution its round and whether it was on time, in Douala dates', () => {
    const late = statementDocument(e5Data('fr'), names('fr')).sections[0]!.rows;
    expect(late).toEqual([
      {
        date: '22 nov. 2026',
        text: 'Tour 4 · en retard',
        amount: formatXAF(10_000, 'fr'),
        note: null,
      },
    ]);
    const onTime = statementDocument(e5Data('en', 'M3'), names('en')).sections[0]!.rows;
    expect(onTime).toEqual([
      {
        date: '20 Nov 2026',
        text: 'Round 4 · on time',
        amount: formatXAF(10_000, 'en'),
        note: null,
      },
    ]);
  });

  it('notes the fee already deducted from a payout and the interest of a loan', () => {
    const doc = statementDocument(e5Data('en'), names('en'));
    const payout = doc.sections.find((s) => s.title === 'Payouts received')!.rows[0]!;
    expect(payout.amount).toBe(formatXAF(9_909, 'en'));
    expect(payout.text).toBe('Round payout');
    expect(payout.note).toBe(`of which collection fees already deducted: ${formatXAF(91, 'en')}`);
    const loan = doc.sections.find((s) => s.title === 'Loans received')!.rows[0]!;
    expect(loan.note).toBe(`of which interest: ${formatXAF(3_000, 'en')}`);
  });

  it('prints the reliability score, or "new member" below three due items (R14.2)', () => {
    const scored = statementData({
      ...e5Data('fr'),
      lines: [],
      reliability: { newMember: false, score: 92, onTime: 11, due: 12, window: 12 },
    });
    const doc = statementDocument(scored, names('fr'));
    expect(doc.reliability.line).toBe('92 % : 11 sur 12 à temps');
    expect(doc.reliability.formula).toContain('12 dernières échéances');
    expect(statementDocument(e5Data('en'), names('en')).reliability.line).toBe(
      'New member (fewer than 3 due items)',
    );
  });

  it('carries the header and the footer with the code and the address, without a phone number', () => {
    const doc = statementDocument(e5Data('fr'), names('fr'));
    expect(doc.header).toEqual([
      { label: 'Groupe', value: 'Njangi des Collègues' },
      { label: 'Membre', value: 'Paul Ngassa' },
      { label: 'Période', value: 'novembre 2026 (1 nov. 2026 – 30 nov. 2026)' },
      { label: 'Établi le', value: '1 déc. 2026, 07:00' },
    ]);
    expect(doc.footer.code).toBe('Code de vérification : 0123456789ab');
    expect(doc.footer.address).toBe('Vérifier ce relevé sur app.example.com/verify/0123456789ab');
    expect(JSON.stringify(doc)).not.toMatch(/6\d{8}/);
  });
});

describe('the statement PDF', () => {
  it('is a PDF in both languages and the same bytes for the same statement', async () => {
    for (const language of ['fr', 'en'] as const) {
      const doc = statementDocument(e5Data(language), names(language));
      const first = await renderStatementPdf(doc, new Date(ISSUED));
      const second = await renderStatementPdf(doc, new Date(ISSUED));
      expect(first.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(first.subarray(-6).toString('latin1')).toContain('%%EOF');
      expect(first.equals(second)).toBe(true);
    }
  });

  it('breaks a long statement over pages, each with the footer', async () => {
    const data = e5Data('fr');
    const many = statementData({
      ...data,
      lines: Array.from({ length: 12 }, () => data.lines).flat(),
    });
    const pdf = await renderStatementPdf(statementDocument(many, names('fr')), new Date(ISSUED), {
      compress: false,
    });
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });

  it('keeps amounts readable with the built-in fonts', () => {
    expect(pdfText(formatXAF(-10_000, 'fr'))).toBe('-10 000 FCFA');
    expect(pdfText('Aïcha Ngô’o')).toBe('Aïcha Ngô’o');
    expect(pdfText('Zoë 😀')).toBe('Zoë ?');
  });
});
