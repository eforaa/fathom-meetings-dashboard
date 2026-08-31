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

//Fathom often puts the address itself in the display name (52 of our entries
//look like "t.gul@aivocado.ai"). It is an address wherever it arrived, so it
//becomes an email token — otherwise the bridge below has nothing to compare
//against and the person stays split from their own name.
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const emailInName = (name) => LOOKS_LIKE_EMAIL.test(String(name ?? '').trim());

function tokensOf(p) {
  const t = [];
  if (p.email) t.push('e:' + norm(p.email));
  if (emailInName(p.name)) t.push('e:' + norm(p.name));
  else if (p.name) t.push('n:' + norm(p.name));
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

//Пары, которые машина свести не может, и человек назвал руками.
//
//Транслитерация связывает имя с адресом, когда в адресе видно то же имя. Но
//бывает, что общего нет вообще: «Nastya» против «a.pogorelaya» — разные части
//имени; «Soloviov» против «Solovyov» — разное написание фамилии, и ни одна
//буква не подсказывает, что это один человек. Угадывать тут нельзя: ошибка
//склеит двух разных людей и спрячет чужие встречи в чужой карточке.
//
//Поэтому — список, подтверждённый человеком. Каждая строка соединяет две
//записи так же, как это сделала бы машина, найди она совпадение сама.
//Слева и справа — либо адрес, либо имя, ровно как они встречаются в базе.
export const MANUAL_ALIASES = [
    //подтверждено Sofiia, 20.08.2026
    ['nastya pogorelaya', 'a.pogorelaya@aivocado.ai'],
    ['daniil soloviov', 'danila solovyov'],
    ['daniil soloviov', 'd.soloviov@aivocado.ai'],
    ['daniil soloviov', 'd.solovyov@privilegija.ua'],
];

//строка списка превращается в тот же токен, каким пользуется индекс
const aliasToken = (value) =>
    (LOOKS_LIKE_EMAIL.test(String(value).trim()) ? 'e:' : 'n:') + norm(value);

//the union-find, built once over every identity in the loaded meetings.
//shared by the people directory and by the meetings table, so both agree on
//who is who.
function buildIndex(meetings, participantsByMeeting) {
  const uf = makeUF();
  const nameNorms = new Map(); //normName -> original
  const emailNorms = new Map();

  //link every identity's email-token and name-token together
  for (const meeting of meetings) {
    for (const p of participantsByMeeting.get(meeting.id) ?? []) {
      const t = tokensOf(p);
      t.forEach(uf.add);
      for (let i = 1; i < t.length; i += 1) uf.union(t[0], t[i]);
      if (emailInName(p.name)) emailNorms.set(norm(p.name), p.name);
      else if (p.name) nameNorms.set(norm(p.name), p.name);
      if (p.email) emailNorms.set(norm(p.email), p.email);
    }
  }

  //bridge name-only and email-only identities via transliteration
  for (const [en, email] of emailNorms) {
    for (const [nn, name] of nameNorms) {
      if (sameIdentity(name, email)) uf.union('e:' + en, 'n:' + nn);
    }
  }

  //и то, что машина связать не смогла, а человек подтвердил
  for (const [left, right] of MANUAL_ALIASES) {
    const a = aliasToken(left);
    const b = aliasToken(right);
    uf.add(a);
    uf.add(b);
    uf.union(a, b);
  }

  return uf;
}

//which person a single participant row belongs to, or null for an empty row
function rootOf(uf, participant) {
  const t = tokensOf(participant);
  return t.length ? uf.find(t[0]) : null;
}

//the name to show for a person. a record whose name field holds an address is
//still a name as far as the database is concerned, so a real name wins over it.
function bestLabel(names, emails) {
  const ranked = [...names.entries()].sort((a, b) => b[1] - a[1]);
  const human = ranked.find(([n]) => !n.includes('@'));
  return human?.[0] ?? ranked[0]?.[0] ?? [...emails][0] ?? 'Без имени';
}

//pure: build the people list from meetings already loaded for the owner
export function groupPeople(meetings, participantsByMeeting) {
  const uf = buildIndex(meetings, participantsByMeeting);

  //aggregate everything under each person's root token
  const groups = new Map();
  for (const meeting of meetings) {
    for (const p of participantsByMeeting.get(meeting.id) ?? []) {
      const root = rootOf(uf, p);
      if (!root) continue;
      const g = groups.get(root) ?? { names: new Map(), emails: new Set(), meetingIds: new Set() };
      if (p.name) g.names.set(p.name, (g.names.get(p.name) ?? 0) + 1);
      if (p.email) g.emails.add(p.email);
      g.meetingIds.add(meeting.id);
      groups.set(root, g);
    }
  }

  return [...groups.values()]
    .map((g) => {
      const label = bestLabel(g.names, g.emails);
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

//the participant list of every meeting, collapsed to one entry per human.
//
//The table used to show the raw rows, and Fathom writes the same person twice
//whenever the calendar knows their address while the transcript knows only
//their name — 370 of 1088 meetings carried such a pair. The People filter then
//counted those meetings twice as well ("760 meetings" for someone who has 567).
//
//Same identity resolution as the people directory, so the two agree: a person
//is one row here, one card there, and the counts match.
//
//Returns Map(meetingId -> [{ id, name, email }]) — the same shape the table
//already expects from a participant, with `id` stable across meetings.
export function peopleByMeeting(meetings, participantsByMeeting) {
  const uf = buildIndex(meetings, participantsByMeeting);

  //everything known about each person, gathered across all their meetings, so
  //someone recorded by name in one call and by address in another still gets
  //their name everywhere
  const info = new Map();
  for (const meeting of meetings) {
    for (const p of participantsByMeeting.get(meeting.id) ?? []) {
      const root = rootOf(uf, p);
      if (!root) continue;
      const g = info.get(root) ?? { names: new Map(), emails: new Set() };
      if (p.name) g.names.set(p.name, (g.names.get(p.name) ?? 0) + 1);
      if (p.email) g.emails.add(p.email);
      info.set(root, g);
    }
  }

  const person = new Map();
  for (const [root, g] of info) {
    const label = bestLabel(g.names, g.emails);
    const emails = [...g.emails];
    person.set(root, { id: personKey(emails, label), name: label, email: emails[0] ?? null });
  }

  const byMeeting = new Map();
  for (const meeting of meetings) {
    const seen = new Set();
    const list = [];
    for (const p of participantsByMeeting.get(meeting.id) ?? []) {
      const root = rootOf(uf, p);
      //a row with neither a name nor an address has nothing to show
      if (!root || seen.has(root)) continue;
      seen.add(root);
      list.push(person.get(root));
    }
    byMeeting.set(meeting.id, list);
  }

  return byMeeting;
}

//Кем оказалась КАЖДАЯ строка участника: id строки → человек.
//
//peopleByMeeting отвечает на вопрос «кто был на встрече» и схлопывает
//повторы. Здесь нужен обратный ответ — «эта строка чья», и угадывать его
//сравнением имён и адресов нельзя: у склеенного человека адресов несколько, а
//показывается один, и строки со вторым адресом теряются. Первая попытка
//перенести склейку в базу так и сделала: 394 строки из 5609 остались без
//человека, при том что строк без имени И без адреса в базе нет вовсе.
//
//Правильный ответ даёт тот же union-find, что и всё остальное: у строки берём
//её корень, а человека — по корню.
export function peopleByRow(meetings, participantsByMeeting) {
  const uf = buildIndex(meetings, participantsByMeeting);

  //человек по корню — ровно тот же, что показывается в списке встречи
  const byRoot = new Map();
  for (const [meetingId, list] of peopleByMeeting(meetings, participantsByMeeting)) {
    const seen = new Set();
    let at = 0;

    for (const p of participantsByMeeting.get(meetingId) ?? []) {
      const root = rootOf(uf, p);
      //список встречи собран в том же порядке, в каком впервые встретились
      //корни: первый новый корень — первый человек в списке
      if (!root || seen.has(root)) continue;
      seen.add(root);
      if (!byRoot.has(root) && list[at]) byRoot.set(root, list[at]);
      at += 1;
    }
  }

  const byRow = new Map();
  for (const meeting of meetings) {
    for (const p of participantsByMeeting.get(meeting.id) ?? []) {
      const person = byRoot.get(rootOf(uf, p));
      if (person) byRow.set(p.id, person);
    }
  }

  return byRow;
}
