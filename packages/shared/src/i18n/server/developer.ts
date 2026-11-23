// Server texts of the developer console (D28). French uses "tu". Errors say what happened and what
// to do. Only the developer reads these; no member ever sees them.
export const developerErrorTexts = {
  DEVELOPER_LOGIN_INVALID: {
    fr: 'Identifiants développeur incorrects. Vérifie-les puis réessaie.',
    en: 'Incorrect developer credentials. Check them and try again.',
  },
  DEVELOPER_LOCKED: {
    fr: 'Trop de tentatives de connexion. Réessaie dans {{minutes}} minutes.',
    en: 'Too many login attempts. Try again in {{minutes}} minutes.',
  },
  DEVELOPER_UNAUTHENTICATED: {
    fr: 'Ta session développeur a expiré. Reconnecte-toi.',
    en: 'Your developer session has expired. Log in again.',
  },
  USER_NOT_FOUND: {
    fr: 'Ce compte n’existe pas.',
    en: 'This account does not exist.',
  },
  USER_ALREADY_DELETED: {
    fr: 'Ce compte est déjà supprimé.',
    en: 'This account is already deleted.',
  },
  GROUP_MEMBERS_HOLD_MONEY: {
    fr: 'Des membres ont encore de l’argent, une dette ou un prêt en cours dans ce groupe. Attends que tout soit réglé, puis ferme le groupe.',
    en: 'Members still hold money, a debt or a live loan in this group. Wait until everything is settled, then close the group.',
  },
  DELETE_IS_ADMIN: {
    fr: 'Cette personne est admin d’un groupe. Ferme le groupe, ou fais passer le rôle d’admin à un autre membre, avant de supprimer le compte.',
    en: 'This person is the admin of a group. Close the group, or have the admin role handed to another member, before deleting the account.',
  },
  DELETE_IN_RUNNING_CYCLE: {
    fr: 'Cette personne fait partie d’un groupe dont le cycle est en cours. Ferme le groupe, ou attends la fin du cycle, avant de supprimer le compte.',
    en: 'This person belongs to a group whose cycle is running. Close the group, or wait for the cycle to end, before deleting the account.',
  },
  DELETE_HAS_OBLIGATIONS: {
    fr: 'Cette personne a encore des obligations ou de l’argent dans un groupe. Le compte ne peut pas être supprimé tant que ce n’est pas réglé.',
    en: 'This person still has obligations or money in a group. The account cannot be deleted until this is settled.',
  },
  DELETE_OPERATION_IN_PROGRESS: {
    fr: 'Un paiement, un retrait ou un prêt de cette personne est en cours. Attends qu’il soit terminé.',
    en: 'A payment, withdrawal or loan of this person is in progress. Wait until it is finished.',
  },
  GROUP_NOT_FOUND: {
    fr: 'Ce groupe n’existe pas.',
    en: 'This group does not exist.',
  },
  GROUP_ALREADY_CLOSED: {
    fr: 'Ce groupe est déjà fermé et masqué.',
    en: 'This group is already closed and hidden.',
  },
  GROUP_MONEY_IN_FLIGHT: {
    fr: 'Un paiement, un retrait, un prêt ou une remise de tour est en cours dans ce groupe. Attends qu’il soit terminé, puis ferme le groupe.',
    en: 'A payment, withdrawal, loan or payout is in progress in this group. Wait until it is finished, then close the group.',
  },
} as const;
