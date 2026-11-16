// Draws a statement (statements.document.ts) as a black-and-white A4 PDF (spec 2.14). No amount is
// computed or formatted here. The verification code and the address are printed at the foot of every
// page. The file is deterministic: its creation date is the statement's issue time.
import PDFDocument from 'pdfkit';
import type { DocumentRow, DocumentSection, StatementDocument } from './statements.document';

const LEFT = 50;
const RIGHT = 545;
const DATE_WIDTH = 72;
const AMOUNT_WIDTH = 120;
const TEXT_LEFT = LEFT + DATE_WIDTH + 6;
const AMOUNT_LEFT = RIGHT - AMOUNT_WIDTH;
const TEXT_WIDTH = AMOUNT_LEFT - TEXT_LEFT - 8;
const BODY_BOTTOM = 742;
const FOOTER_TOP = 762;
const GREY = '#555555';
const BLACK = '#000000';

/** Characters the built-in fonts can draw besides Latin-1 (the Windows-1252 additions). */
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/**
 * The built-in PDF fonts know Windows-1252 only: the narrow no-break space of French amounts becomes
 * a no-break space, the minus sign a hyphen, and any other unknown character a question mark.
 */
export function pdfText(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    if (ch === ' ') out += ' ';
    else if (ch === '−') out += '-';
    else if (ch.codePointAt(0)! <= 0xff || EXTRA.has(ch)) out += ch;
    else out += '?';
  }
  return out;
}

type Doc = PDFKit.PDFDocument;

function room(doc: Doc, height: number): void {
  if (doc.y + height > BODY_BOTTOM) doc.addPage();
}

function amountRow(doc: Doc, row: Pick<DocumentRow, 'date' | 'text' | 'amount'>): void {
  const text = pdfText(row.text);
  const height = Math.max(
    doc.heightOfString(text || ' ', { width: TEXT_WIDTH }),
    doc.currentLineHeight(),
  );
  room(doc, height);
  const y = doc.y;
  doc.text(pdfText(row.date), LEFT, y, { width: DATE_WIDTH, lineBreak: false });
  if (text) doc.text(text, TEXT_LEFT, y, { width: TEXT_WIDTH });
  doc.text(pdfText(row.amount), AMOUNT_LEFT, y, {
    width: AMOUNT_WIDTH,
    align: 'right',
    lineBreak: false,
  });
  doc.y = y + height + 2;
}

function drawSection(doc: Doc, section: DocumentSection, totalLabel: string): void {
  room(doc, 48);
  doc.moveDown(0.7).font('Helvetica-Bold').fontSize(11).fillColor(BLACK);
  doc.text(pdfText(section.title), LEFT, doc.y, { width: RIGHT - LEFT });
  doc.moveDown(0.2).font('Helvetica').fontSize(9);
  if (section.none) {
    doc.fillColor(GREY).text(pdfText(section.none), LEFT, doc.y, { width: RIGHT - LEFT });
    doc.fillColor(BLACK);
    return;
  }
  for (const row of section.rows) {
    amountRow(doc, row);
    if (row.note) {
      room(doc, 10);
      doc.fontSize(8).fillColor(GREY);
      doc.text(pdfText(row.note), TEXT_LEFT, doc.y - 1, { width: RIGHT - TEXT_LEFT });
      doc.fontSize(9).fillColor(BLACK);
      doc.y += 2;
    }
  }
  doc.font('Helvetica-Bold');
  amountRow(doc, { date: totalLabel, text: '', amount: section.total });
  doc.font('Helvetica');
}

function drawFooters(doc: Doc, footer: StatementDocument['footer']): void {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    // The footer sits in the bottom margin; without this, writing there would add a page.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
    doc.text(pdfText(footer.code), LEFT, FOOTER_TOP, { width: RIGHT - LEFT, align: 'center' });
    doc.font('Helvetica');
    doc.text(pdfText(footer.address), LEFT, FOOTER_TOP + 11, {
      width: RIGHT - LEFT,
      align: 'center',
    });
    doc.fillColor(GREY).fontSize(7);
    doc.text(pdfText(footer.note), LEFT, FOOTER_TOP + 23, { width: RIGHT - LEFT, align: 'center' });
    doc.text(`${i + 1} / ${pages.count}`, LEFT, FOOTER_TOP + 34, {
      width: RIGHT - LEFT,
      align: 'center',
    });
  }
}

/** The PDF bytes of a statement. `issuedAt` dates the file, so the same statement gives the same file. */
export function renderStatementPdf(
  document: StatementDocument,
  issuedAt: Date,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 100, left: LEFT, right: 50 },
      bufferPages: true,
      compress: options.compress ?? true,
      lang: document.lang,
      info: {
        Title: pdfText(document.title),
        Creator: 'NjangiTrust',
        Producer: 'NjangiTrust',
        CreationDate: issuedAt,
        ModDate: issuedAt,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(BLACK)
      .text(pdfText(document.title), LEFT, 48);
    doc.moveDown(0.5).fontSize(10);
    for (const item of document.header) {
      const y = doc.y;
      doc
        .font('Helvetica-Bold')
        .text(pdfText(item.label), LEFT, y, { width: 90, lineBreak: false });
      doc.font('Helvetica').text(pdfText(item.value), LEFT + 96, y, { width: RIGHT - LEFT - 96 });
    }
    for (const section of document.sections) drawSection(doc, section, document.totalLabel);

    room(doc, 60);
    doc.moveDown(0.9).font('Helvetica-Bold').fontSize(11);
    doc.text(pdfText(document.reliability.title), LEFT, doc.y, { width: RIGHT - LEFT });
    doc.moveDown(0.2).font('Helvetica').fontSize(9);
    doc.text(pdfText(document.reliability.line), LEFT, doc.y, { width: RIGHT - LEFT });
    doc.fillColor(GREY).fontSize(8);
    doc.text(pdfText(document.reliability.formula), LEFT, doc.y + 2, { width: RIGHT - LEFT });

    drawFooters(doc, document.footer);
    doc.end();
  });
}
