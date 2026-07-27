//grouping meeting participants into real PEOPLE.
//Fathom records the same person under several identities — a work email, a
//personal email, a name with no email, latin vs cyrillic. Searching by one
//email misses meetings (Alexander's "9 instead of 49"). Here we merge those
//identities so a person shows all of their meetings at once.

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

//a stable key for one person, used in the /people/<key> URL
function personKey(emails, label) {
  if (emails.length) return [...emails].map((e) => e.toLowerCase()).sort()[0];
  return 'name:' + norm(label);
}

//union-find so identities that share an email OR a name collapse into one person
function makeUF() {
  const parent = new Map();
  const find = (x) => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const union = (a, b) => { add(a); add(b); parent.set(find(a), find(b)); };
  return { find, add, union };
}

function tokensOf(p) {
  const t = [];
  if (p.email) t.push('e:' + norm(p.email));
  if (p.name) t.push('n:' + norm(p.name));
  return t;
}

//many identities carry EITHER a name OR an email, never both, so nothing links
//"Тетяна Гуль" to "t.gul@…". We bridge them by transliterating the name and
//comparing it to the email's local part (surname + first initial).
const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ie', ж: 'zh',
  з: 'z', и: 'i', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia',
};
const translit = (s) => norm(s).split('').map((c) => (c in CYR ? CYR[c] : c)).join('');
const nameTokens = (name) => translit(name).split(/[^a-z]+/).filter((t) => t.length >= 2);
const emailTokens = (email) => norm(email).split('@')[0].split(/[^a-z]+/).filter(Boolean);

//true when a name and an email almost certainly belong to the same person
function sameIdentity(name, email) {
  const nt = nameTokens(name);
  const et = new Set(emailTokens(email));
  if (!nt.length || !et.size) return false;
  //full name tokens (>=3 chars) that appear whole in the email local part
  const strong = nt.filter((t) => t.length >= 3 && et.has(t));
  if (strong.length >= 2) return true; //e.g. sergey.glova
  if (!strong.length) return false;
  //one strong token + another name token present as itself or as an initial
  const rest = nt.filter((t) => !strong.includes(t));
  return rest.some((t) => et.has(t) || et.has(t[0])) || et.size === 1;
}

//pure: build the people list from meetings already loaded for the owner
export function groupPeople(meetings, participantsByMeeting) {
  const uf = makeUF();
  const nameNorms = new Map(); //normName -> original
  const emailNorms = new Map();

  //link every identity's email-token and name-token together
  for (const meeting of meetings) {
    for (const p of participantsByMeeting.get(meeting.id) ?? []) {
      const t = tokensOf(p);
      t.forEach(uf.add);
      for (let i = 1; i < t.length; i += 1) uf.union(t[0], t[i]);
      if (p.name) nameNorms.set(norm(p.name), p.name);
      if (p.email) emailNorms.set(norm(p.email), p.email);
    }
  }

  //bridge name-only and email-only identities via transliteration
  for (const [en, email] of emailNorms) {
    for (const [nn, name] of nameNorms) {
      if (sameIdentity(name, email)) uf.union('e:' + en, 'n:' + nn);
    }
  }

  //aggregate everything under each person's root token
  const groups = new Map();
  for (const meeting of meetings) {
    for (const p of participantsByMeeting.get(meeting.id) ?? []) {
      const t = tokensOf(p);
      if (!t.length) continue;
      const root = uf.find(t[0]);
      const g = groups.get(root) ?? { names: new Map(), emails: new Set(), meetingIds: new Set() };
      if (p.name) g.names.set(p.name, (g.names.get(p.name) ?? 0) + 1);
      if (p.email) g.emails.add(p.email);
      g.meetingIds.add(meeting.id);
      groups.set(root, g);
    }
  }

  return [...groups.values()]
    .map((g) => {
      const label =
        [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
        [...g.emails][0] ||
        'Без имени';
      const emails = [...g.emails];
      //some records stuff the email into the name field too — drop those from
      //the alias list, emails are shown separately
      const aliases = [...g.names.keys()].filter((n) => !n.includes('@'));
      return {
        key: personKey(emails, label),
        label,
        emails,
        aliases,
        count: g.meetingIds.size,
        meetingIds: [...g.meetingIds],
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

//find one person by their URL key within the grouped list
export function findPerson(people, key) {
  return people.find((p) => p.key === key) ?? null;
}
