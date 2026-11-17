// Server texts for the member's own account (spec R13 payment number, PRV-03 deletion). French
// uses "tu". The group is told that a number changed, never which one (R13.4).
export const accountErrorTexts = {
  NUMBER_NOT_VALID: {
    fr: 'Ce numéro n’est pas un numéro de paiement MTN ou Orange du Cameroun (9 chiffres, il commence par 6).',
    en: 'This is not a Cameroon MTN or Orange payment number (9 digits starting with 6).',
  },
  OPERATOR_REQUIRED: {
    fr: 'Dis-moi si ce numéro est MTN ou Orange.',
    en: 'Tell me whether this number is MTN or Orange.',
  },
  NUMBER_UNCHANGED: {
    fr: 'C’est déjà ton numéro de paiement.',
    en: 'This is already your payment number.',
  },
  ACCOUNT_DELETED: {
    fr: 'Ce compte est supprimé.',
    en: 'This account is deleted.',
  },
  DELETE_IS_ADMIN: {
    fr: 'Tu es admin d’un groupe. Passe d’abord le rôle d’admin à un autre membre.',
    en: 'You are the admin of a group. Hand the admin role to another member first.',
  },
  DELETE_IN_RUNNING_CYCLE: {
    fr: 'Tu fais partie d’un groupe dont le cycle est en cours. Tu peux annoncer ton départ à la fin du cycle, puis supprimer ton compte.',
    en: 'You belong to a group whose cycle is running. You can announce that you will leave at the end of the cycle, then delete your account.',
  },
  DELETE_HAS_OBLIGATIONS: {
    fr: 'Il te reste des obligations ou de l’argent dans un groupe : paie ce que tu dois et retire ton argent avant de supprimer ton compte.',
    en: 'You still have obligations or money in a group: pay what you owe and withdraw your money before deleting your account.',
  },
  DELETE_OPERATION_IN_PROGRESS: {
    fr: 'Un paiement, un retrait ou un prêt est en cours. Attends qu’il soit terminé.',
    en: 'A payment, withdrawal or loan is in progress. Wait until it is finished.',
  },
} as const;

export const accountTexts = {
  numberChangedTitle: {
    fr: 'Numéro de paiement mis à jour',
    en: 'Payment number updated',
  },
  numberChangedBody: {
    fr: 'Ton numéro de paiement a changé. Les retraits vers le nouveau numéro sont retenus quelques heures (48 h par défaut). Tes paiements ne sont pas touchés.',
    en: 'Your payment number changed. Withdrawals to the new number are held for a few hours (48 h by default). Your payments are not affected.',
  },
  numberChangedAdminTitle: {
    fr: 'Numéro de paiement mis à jour',
    en: 'Payment number updated',
  },
  numberChangedAdminBody: {
    fr: '{{name}} a mis à jour son numéro de paiement.',
    en: '{{name}} updated their payment number.',
  },
  numberChangedGroup: {
    fr: '{{name}} a mis à jour son numéro de paiement.',
    en: '{{name}} updated their payment number.',
  },
  numberHoldNote: {
    fr: 'Les retraits vers le nouveau numéro seront retenus quelques heures (48 h par défaut).',
    en: 'Withdrawals to the new number will be held for a few hours (48 h by default).',
  },
  numberCardLine: {
    fr: 'Nouveau numéro',
    en: 'New number',
  },
  deleteNote: {
    fr: 'Ton nom et ton numéro seront effacés. Les écritures financières des groupes restent, sans ton nom.',
    en: 'Your name and number will be erased. The groups’ financial records stay, without your name.',
  },
  deleteNoteIrreversible: {
    fr: 'Cette action est définitive.',
    en: 'This cannot be undone.',
  },
  deletedName: {
    fr: 'Ancien membre',
    en: 'Former member',
  },
  deleteGroupMessage: {
    fr: 'Un membre a supprimé son compte.',
    en: 'A member deleted their account.',
  },
} as const;
