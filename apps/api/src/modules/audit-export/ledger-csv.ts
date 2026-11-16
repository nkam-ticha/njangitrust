// The audit export as CSV (spec 2.14, FSD LED-04), for a spreadsheet: UTF-8 with a byte order mark,
// RFC 4180 quoting, CRLF line ends. The first data row (`context`) carries everything but the
// transactions as JSON; then one `posting` row per posting with its transaction's columns repeated,
// and one `transaction` row for an entry without postings (an EVENT). Nothing is rewritten: every
// value is exactly the one in the JSON export, so the file can be turned back into it and verified.
import type { LedgerExport, LedgerTransaction } from '@njangi/rules';

export const LEDGER_CSV_COLUMNS = [
  'recordType',
  'context',
  'seq',
  'id',
  'groupId',
  'type',
  'occurredAt',
  'roundId',
  'membershipId',
  'refType',
  'refId',
  'descriptionFr',
  'descriptionEn',
  'metadata',
  'account',
  'amount',
  'prevHash',
  'hash',
] as const;

/** Tells a spreadsheet the file is UTF-8. */
export const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

type Column = (typeof LEDGER_CSV_COLUMNS)[number];
type Row = Partial<Record<Column, string>>;

const quote = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const csvLine = (row: Row): string => LEDGER_CSV_COLUMNS.map((c) => quote(row[c] ?? '')).join(',');

function transactionColumns(tx: LedgerTransaction): Row {
  return {
    seq: String(tx.seq),
    id: tx.id,
    groupId: tx.groupId,
    type: tx.type,
    occurredAt: tx.occurredAt,
    roundId: tx.roundId ?? '',
    membershipId: tx.membershipId ?? '',
    refType: tx.refType ?? '',
    refId: tx.refId ?? '',
    descriptionFr: tx.descriptionFr,
    descriptionEn: tx.descriptionEn,
    metadata: JSON.stringify(tx.metadata),
    prevHash: tx.prevHash,
    hash: tx.hash,
  };
}

export function ledgerExportToCsv(file: LedgerExport): string {
  const { transactions, ...context } = file;
  const lines = [LEDGER_CSV_COLUMNS.join(',')];
  lines.push(csvLine({ recordType: 'context', context: JSON.stringify(context) }));
  for (const tx of transactions) {
    const columns = transactionColumns(tx);
    if (tx.postings.length === 0) lines.push(csvLine({ recordType: 'transaction', ...columns }));
    for (const posting of tx.postings) {
      lines.push(
        csvLine({
          recordType: 'posting',
          ...columns,
          account: posting.account,
          amount: String(posting.amount),
        }),
      );
    }
  }
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}
