// Export of my personal data (spec Part 7, PRV-03): the server builds one JSON document with my own
// data only; this hook returns it as the text of a file the screen saves or shares.
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { dataExportResponseSchema } from '@njangi/shared/contracts/account';
import { api } from '@/api/client';

export interface DataExportFile {
  filename: string;
  mime: string;
  content: string;
}

/** `njangi-mes-donnees-YYYY-MM-DD.json`, the date being the day of the export in Cameroon (UTC+1). */
function filenameFor(generatedAt: string): string {
  const day = new Date(new Date(generatedAt).getTime() + 3_600_000).toISOString().slice(0, 10);
  return `njangi-mes-donnees-${day}.json`;
}

export function useDataExport(): UseMutationResult<DataExportFile, Error, void> {
  return useMutation({
    mutationFn: async () => {
      const { export: data } = await api.get('/v1/me/data-export', {
        schema: dataExportResponseSchema,
      });
      return {
        filename: filenameFor(data.generatedAt),
        mime: 'application/json',
        content: JSON.stringify(data, null, 2),
      };
    },
  });
}
