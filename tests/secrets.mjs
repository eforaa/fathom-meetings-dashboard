// Ключи Fathom в базе.
//
// Здесь хранится чужой ключ доступа: тот, кто им завладеет, прочитает все
// записи чужих встреч. Поэтому в базе он лежит зашифрованным, а мастер-ключ —
// только в переменных окружения, отдельно от данных.
//
// Проверять тут надо не «шифруется ли» — AES работает и без нас, — а три вещи,
// которые легко испортить своими руками: что значение возвращается тем же,
// что подделку в базе заметят, и что мастер-ключ проверяется на пригодность,
// а не принимается любой.
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { encryptSecret, decryptSecret, secretHint } = await import('../lib/secrets.js');
const { check, done } = await import('./_check.mjs');

const KEY = 'fathom_live_ABCD1234efgh';

//--- туда и обратно ---------------------------------------------------------
check('ключ возвращается в точности', decryptSecret(encryptSecret(KEY)), KEY);
check('кириллица переживает шифрование', decryptSecret(encryptSecret('ключ Ани')), 'ключ Ани');
//Пустая строка круг НЕ переживает: шифротекст пуст, и разбор «вектор:метка:
//данные» считает такую запись искажённой. Это не беда — пустой ключ до базы не
//доходит, verifyApiKey сначала спрашивает у Fathom, принимают ли его, — но
//поведение стоит знать: молчаливого пустого ключа в базе не появится, будет
//явный отказ.
check('пустой ключ не притворяется сохранённым', (() => {
    try { decryptSecret(encryptSecret('')); return 'вернулся пустым'; } catch { return 'отказ'; }
})(), 'отказ');

//--- вид хранимого ----------------------------------------------------------
const stored = encryptSecret(KEY);
const parts = stored.split(':');

check('в базу уходит три части: вектор, метка, шифротекст', parts.length, 3);
check('сам ключ в хранимом виде не встречается', stored.includes(KEY), false);
check('все части — шестнадцатеричные', parts.every((p) => /^[0-9a-f]+$/.test(p)), true);

//Одинаковые ключи не должны давать одинаковую строку. Иначе по базе видно,
//что двое подключили один и тот же ключ Fathom, — а это уже утечка, пусть и
//частичная, без всякого взлома шифра.
check('два шифрования одного ключа дают разные строки',
    encryptSecret(KEY) === encryptSecret(KEY), false);
check('но расшифровываются в одно и то же',
    decryptSecret(encryptSecret(KEY)), decryptSecret(encryptSecret(KEY)));

//--- подделка ---------------------------------------------------------------
//GCM выбран не за скорость, а за метку целостности: правка шифротекста прямо
//в базе должна кончиться ошибкой, а не тихо расшифроваться в другой ключ
const broken = (() => {
    const [iv, tag, data] = encryptSecret(KEY).split(':');
    const flipped = data.slice(0, -2) + (data.endsWith('00') ? '11' : '00');
    return [iv, tag, flipped].join(':');
})();

check('изменённый шифротекст не расшифровывается', (() => {
    try { decryptSecret(broken); return 'расшифровался'; } catch { return 'отказ'; }
})(), 'отказ');

check('чужая метка целостности тоже отвергается', (() => {
    const [iv, , data] = encryptSecret(KEY).split(':');
    const [, otherTag] = encryptSecret('другой ключ').split(':');
    try { decryptSecret([iv, otherTag, data].join(':')); return 'расшифровался'; } catch { return 'отказ'; }
})(), 'отказ');

for (const junk of ['', 'просто строка', 'aa:bb', ':::']) {
    check(`искажённая запись «${junk}» — понятная ошибка, а не пятисотая`, (() => {
        try { decryptSecret(junk); return 'расшифровался'; } catch { return 'отказ'; }
    })(), 'отказ');
}

//--- мастер-ключ ------------------------------------------------------------
//короткий или отсутствующий ключ должен останавливать работу сразу, а не
//шифровать чем попало
const withKey = (value, run) => {
    const was = process.env.ENCRYPTION_KEY;
    if (value === null) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = value;
    try { run(); return 'сработало'; } catch { return 'отказ'; } finally { process.env.ENCRYPTION_KEY = was; }
};

check('без мастер-ключа шифрование не начинается',
    withKey(null, () => encryptSecret(KEY)), 'отказ');
check('короткий мастер-ключ отвергается',
    withKey('abcd', () => encryptSecret(KEY)), 'отказ');
check('ключ не той длины в шестнадцатеричном виде — тоже',
    withKey('0123456789abcdef', () => encryptSecret(KEY)), 'отказ');
check('правильный ключ работает',
    withKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        () => encryptSecret(KEY)), 'сработало');

//--- подсказка в интерфейсе -------------------------------------------------
//четыре последних символа хранятся отдельно, чтобы страница настроек никогда
//не просила мастер-ключ ради строчки «••••1234»
check('подсказка — последние четыре символа', secretHint(KEY), 'efgh');
check('короткий ключ отдаёт себя целиком, а не падает', secretHint('ab'), 'ab');
check('подсказка не содержит начала ключа', secretHint(KEY).includes('fathom'), false);

done();
