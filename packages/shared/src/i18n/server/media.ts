// Server texts for chat media (spec 2.12, D9). The size and length limits are those of the spec.
import type { Bilingual } from '../../lang';

export const mediaErrorTexts = {
  UNSUPPORTED_FILE_TYPE: {
    fr: 'Ce type de fichier n’est pas accepté ici : photos, vidéos, notes vocales ou PDF.',
    en: 'This file type is not accepted here: photos, videos, voice notes or PDF.',
  },
  IMAGE_TOO_LARGE: {
    fr: 'Image trop lourde : 10 Mo au plus.',
    en: 'Image too large: 10 MB at most.',
  },
  VIDEO_TOO_LARGE: {
    fr: 'Vidéo trop lourde : 50 Mo au plus.',
    en: 'Video too large: 50 MB at most.',
  },
  VOICE_TOO_LARGE: {
    fr: 'Note vocale trop lourde : 10 Mo au plus.',
    en: 'Voice note too large: 10 MB at most.',
  },
  DOCUMENT_TOO_LARGE: {
    fr: 'Document trop lourd : 20 Mo au plus.',
    en: 'Document too large: 20 MB at most.',
  },
  VIDEO_TOO_LONG: {
    fr: 'Vidéo trop longue : 2 minutes au plus.',
    en: 'Video too long: 2 minutes at most.',
  },
  VOICE_TOO_LONG: {
    fr: 'Note vocale limitée à 3 minutes.',
    en: 'Voice notes are limited to 3 minutes.',
  },
  DURATION_REQUIRED: {
    fr: 'La durée de la vidéo ou de la note vocale est nécessaire.',
    en: 'The length of the video or voice note is required.',
  },
  THUMBNAIL_ONLY_FOR_IMAGES: {
    fr: 'Seules les photos ont un aperçu.',
    en: 'Only photos have a preview.',
  },
  UPLOAD_TICKET_NOT_FOUND: {
    fr: 'Cet envoi est introuvable. Recommence l’envoi du fichier.',
    en: 'This upload was not found. Start the upload again.',
  },
  UPLOAD_TICKET_EXPIRED: {
    fr: 'Le délai pour envoyer ce fichier est dépassé. Recommence l’envoi.',
    en: 'The time to upload this file has passed. Start the upload again.',
  },
  FILE_NOT_UPLOADED: {
    fr: 'Le fichier n’est pas arrivé. Vérifie ta connexion et recommence.',
    en: 'The file did not arrive. Check your connection and try again.',
  },
  FILE_TYPE_MISMATCH: {
    fr: 'Le fichier reçu n’est pas du type annoncé. Il a été refusé.',
    en: 'The file received is not of the announced type. It was refused.',
  },
  FILE_TOO_LARGE_RECEIVED: {
    fr: 'Le fichier reçu dépasse la taille autorisée. Il a été supprimé.',
    en: 'The file received is larger than allowed. It was deleted.',
  },
  THUMBNAIL_INVALID: {
    fr: 'L’aperçu de la photo est invalide. Il a été refusé.',
    en: 'The photo preview is invalid. It was refused.',
  },
  ATTACHMENT_NOT_FOUND: {
    fr: 'Ce fichier est introuvable.',
    en: 'This file was not found.',
  },
  UPLOAD_LIMIT_REACHED: {
    fr: 'Trop d’envois en peu de temps. Réessaie plus tard.',
    en: 'Too many uploads in a short time. Try again later.',
  },
} as const satisfies Record<string, Bilingual>;
