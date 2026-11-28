// Gives the member a file made in the app, with no extra package (D4).
//   Web: the browser downloads it (a Blob and a link).
//   Phone: React Native's built-in Share sheet receives the file's TEXT (save to Files, mail, a
//   notes app, WhatsApp). That is not a real file attachment, and the system limits how much text a
//   share can carry, so a very large file is refused with `FileTooLargeError` instead of failing
//   inside the system sheet. The member is then pointed to the web version.
import { Platform, Share } from 'react-native';
import { FileTooLargeError, exceedsShareLimit, type DeliverableFile } from './fileRules';

const BOM = String.fromCharCode(0xfeff);

/** Returns 'saved' when the file was handed over, 'dismissed' when the member closed the share sheet. */
export async function deliverFile(file: DeliverableFile): Promise<'saved' | 'dismissed'> {
  if (Platform.OS === 'web') {
    // A UTF-8 byte-order mark lets a spreadsheet open a CSV with its accents right.
    const body = file.mime.startsWith('text/csv') ? BOM + file.content : file.content;
    const blob = new Blob([body], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The download has started by the next turn; the address can go.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'saved';
  }
  if (exceedsShareLimit(Platform.OS, file.content.length)) throw new FileTooLargeError();
  const result = await Share.share({ title: file.filename, message: file.content });
  return result.action === Share.dismissedAction ? 'dismissed' : 'saved';
}
