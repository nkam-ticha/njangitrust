// Turns the CSV audit export back into the JSON export, so a test can run the verifier on it.
// The inverse of src/modules/audit-export/ledger-csv.ts (RFC 4180, byte order mark, CRLF).
import type { JsonObject, LedgerExport, LedgerTransaction } from '@njangi/rules';

function parseRows(csv: string): string[][] {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += char;
  }
  if (quoted) throw new SyntaxError('unclosed quoted field');
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

const orNull = (value: string): string | null => (value === '' ? null : value);

function whole(value: string, label: string): number {
  if (!/^-?\d+$/.test(value)) throw new SyntaxError(`${label} is not a whole number`);
  return Number(value);
}

export function ledgerExportFromCsv(csv: string): LedgerExport {
  const [columns, ...rows] = parseRows(csv);
  if (!columns) throw new SyntaxError('empty file');
  const records = rows.map(
    (cells) =>
      Object.fromEntries(columns.map((name, i) => [name, cells[i] ?? ''])) as Record<
        string,
        string
      >,
  );
  const context = records.find((r) => r.recordType === 'context');
  if (!context) throw new SyntaxError('no context row');
  const byId = new Map<string, LedgerTransaction>();
  for (const r of records) {
    if (r.recordType !== 'posting' && r.recordType !== 'transaction') continue;
    let tx = byId.get(r.id!);
    if (!tx) {
      tx = {
        id: r.id!,
        groupId: r.groupId!,
        seq: whole(r.seq!, 'seq'),
        type: r.type as LedgerTransaction['type'],
        occurredAt: r.occurredAt!,
        roundId: orNull(r.roundId!),
        membershipId: orNull(r.membershipId!),
        refType: orNull(r.refType!),
        refId: orNull(r.refId!),
        descriptionFr: r.descriptionFr!,
        descriptionEn: r.descriptionEn!,
        metadata: JSON.parse(r.metadata!) as JsonObject,
        postings: [],
        prevHash: r.prevHash!,
        hash: r.hash!,
      };
      byId.set(tx.id, tx);
    }
    if (r.recordType === 'posting') {
      tx.postings.push({ account: r.account!, amount: whole(r.amount!, 'amount') });
    }
  }
  return {
    ...(JSON.parse(context.context!) as Omit<LedgerExport, 'transactions'>),
    transactions: [...byId.values()].sort((a, b) => a.seq - b.seq),
  };
}
