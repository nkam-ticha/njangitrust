// Spec 4.4: in the group chat the agent never discusses one member's own situation and never acts.
// This deterministic check catches the obvious cases before any model call; the model catches the
// rest with reply_privately. Either way the group only sees "Je t'ai répondu en privé".
const MENTION = /@njangi\b/giu;

const FIRST_PERSON_FR = /(^|[^\p{L}])((je|moi|mon|ma|mes)(?=[^\p{L}]|$)|[jm]['’])/iu;
const FIRST_PERSON_EN = /(^|[^\p{L}])((i|me|my|mine)(?=[^\p{L}]|$)|i['’])/iu;
const PERSONAL_TOPIC =
  /(dois|doit|dette|amende|pr[eê]t|tour|argent|solde|cotisation|pay[ée]|paie|retir|num[ée]ro|relev[ée]|vote|owe|debt|fine|loan|turn|money|balance|paid|pay|withdraw|number|statement)/iu;
const ACTION_VERB =
  /^(paie|payer|paye|retire|retirer|vote|votez|emprunte|emprunter|change|changer|ajoute|ajouter|propose|proposer|supprime|annule|mise|miser|envoie|demande|pay|withdraw|vote|borrow|change|add|propose|delete|cancel|bid|send|request)(?=[^\p{L}]|$)/iu;

export function looksPersonal(text: string): boolean {
  const cleaned = text.replace(MENTION, ' ').trim();
  if (ACTION_VERB.test(cleaned)) return true;
  const firstPerson = FIRST_PERSON_FR.test(cleaned) || FIRST_PERSON_EN.test(cleaned);
  return firstPerson && PERSONAL_TOPIC.test(cleaned);
}
