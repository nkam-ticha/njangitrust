// The ledger export (spec 2.14, FSD LED-04): any member can download the group's whole ledger, as
// JSON (verifiable with tools/verify-ledger) or CSV. The server builds it; this fetches it with the
// member's token and hands it over as a download (web) or a share (phone), see lib/deliverFile.
import { useMutation } from '@tanstack/react-query';
import { downloadText } from '@/api/download';
import { deliverFile } from '@/lib/deliverFile';
import { ledgerFilename } from '@/lib/fileRules';

export type LedgerExportFormat = 'json' | 'csv';

const MIME: Record<LedgerExportFormat, string> = {
  json: 'application/json',
  csv: 'text/csv;charset=utf-8',
};

export function useLedgerExport(groupId: string) {
  return useMutation({
    mutationFn: async (format: LedgerExportFormat) => {
      const content = await downloadText(`/v1/groups/${groupId}/ledger/export?format=${format}`);
      return deliverFile({ filename: ledgerFilename(format), mime: MIME[format], content });
    },
  });
}
