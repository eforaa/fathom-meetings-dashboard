// MCP-коннектор против недоброжелательного ввода.
//
// Коннектор — единственная дверь, у которой ключ живёт не в браузере, а в
// чужой настройке Claude. Значит, приходить в неё может что угодно, и «такого
// инструмента нет» обязано означать именно это.
//
// Поводом стала настоящая поломка: имена, унаследованные от Object.prototype
// — constructor, toString, valueOf, hasOwnProperty, __proto__ — проходили
// проверку «нет такого инструмента», потому что поиск по обычному объекту их
// находит. Вызов уходил дальше и возвращал клиенту УСПЕХ несуществующего
// инструмента: `{}` или `[object Undefined]` в поле content, без признака
// ошибки. К базе это не приводило, но ответ врал.
//
//База подменена тем же шпионом, что и в остальных adversarial-тестах: он
//записывает, какой запрос хендлер СОБРАЛ, и ничего никуда не отправляет.
//Так проверяется то, что иначе требует живой базы: подставился ли чужой
//владелец и во что превратились присланные числа.
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';
process.env.MCP_TOKENS = 'tok:owner@example.com';

const { register } = await import('node:module');
const { pathToFileURL } = await import('node:url');
register('./tests/_route-loader.mjs', pathToFileURL('./').href);

const { handleMcpRequest, resolveOwner } = await import('../lib/mcp-server.js');
const { mock, ownerFilterValues } = await import('./_route-mocks.mjs');
const { check, done } = await import('./_check.mjs');

const call = (name, args = {}) =>
    handleMcpRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
        'owner@example.com',
    );

//--- унаследованные имена ---------------------------------------------------
const INHERITED = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'];

for (const name of INHERITED) {
    const answer = await call(name);

    check(`«${name}» — это неизвестный инструмент`,
        answer.body.error?.code, -32602);
    //главное: ответ не должен выглядеть удачным
    check(`«${name}» не возвращает результат`, answer.body.result, undefined);
}

//--- обычные случаи ---------------------------------------------------------
const unknown = await call('nonexistent_tool');
check('выдуманное имя — тот же ответ', unknown.body.error?.code, -32602);
check('и текст называет само имя',
    unknown.body.error?.message.includes('nonexistent_tool'), true);

for (const name of [null, undefined, 42, {}, ['list_meetings']]) {
    const answer = await call(name);
    check(`имя ${JSON.stringify(name) ?? 'undefined'} вместо строки — неизвестный инструмент`,
        answer.body.error?.code, -32602);
}

//настоящий инструмент по-прежнему находится: проверка не должна была
//закрыть дверь совсем
const real = await handleMcpRequest(
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'owner@example.com');
check('список инструментов отдаётся', Array.isArray(real.body.result?.tools), true);
check('в нём есть list_meetings',
    real.body.result.tools.some((tool) => tool.name === 'list_meetings'), true);
check('и ни одного унаследованного имени',
    real.body.result.tools.filter((tool) => INHERITED.includes(tool.name)), []);

//--- токен и владелец -------------------------------------------------------
//токен резолвится точным совпадением: префикс чужого токена не должен
//открывать чужую базу
check('свой токен даёт своего владельца', resolveOwner('tok'), 'owner@example.com');
check('токен-префикс чужим не становится', resolveOwner('to'), null);
check('токен с приписанным хвостом — не тот же токен', resolveOwner('tokA'), null);
check('пустой токен никого не открывает', resolveOwner(''), null);
check('отсутствующий токен — тоже', resolveOwner(undefined), null);


//--- владелец не подменяется аргументами -------------------------------------
//Владелец берётся из токена, а не из того, что прислали. Попытка передать
//чужой адрес в аргументах инструмента не должна доехать до фильтра.
mock.reset();
await call('list_meetings', { owner_email: 'someone@else.io', ownerEmail: 'someone@else.io' });

check('фильтр по владельцу — из токена', ownerFilterValues(), ['owner@example.com']);
check('чужой адрес в фильтр не попал',
    ownerFilterValues().includes('someone@else.io'), false);

//--- числа из аргументов зажимаются ------------------------------------------
const chainOf = (name) => mock.calls.flatMap((c) => c.chain).filter((s) => s.name === name);

mock.reset();
await call('list_meetings', { limit: 100000, offset: -50 });
check('запрошенная тысяча строк режется до сотни', chainOf('range')[0].args, [0, 99]);

mock.reset();
await call('list_meetings', { limit: 'сколько-нибудь' });
check('нечисло не превращается в NaN-диапазон',
    chainOf('range')[0].args.every(Number.isFinite), true);

//неизвестный тип не должен превращаться в отсутствие фильтра — иначе запрос
//«покажи встречи типа „вечеринка“» вернул бы все встречи подряд
mock.reset();
const party = await call('list_meetings', { type: 'вечеринка' });
check('неизвестный тип возвращает пусто, а не всё',
    JSON.parse(party.body.result.content[0].text).total, 0);
//запрос при этом успевает собраться — проверка типа стоит после сборки, — но
//НЕ отправляется: у записи нет терминальной операции
check('и в базу такой запрос не уходит',
    mock.calls.every((c) => c.terminal === undefined), true);

mock.reset();
mock.rows.maybeSingle = { id: '00000000-1111-4222-8333-444444444444' };
await call('set_meeting_importance', { id: '00000000-1111-4222-8333-444444444444', importance: 99 });
const update = mock.calls.flatMap((c) => c.chain).find((s) => s.name === 'update');
check('важность 99 зажимается до 5', update.args[0].importance, 5);

mock.reset();
mock.rows.maybeSingle = { id: '00000000-1111-4222-8333-444444444444' };
await call('set_meeting_importance', { id: '00000000-1111-4222-8333-444444444444', importance: -3 });
const negative = mock.calls.flatMap((c) => c.chain).find((s) => s.name === 'update');
check('отрицательная важность становится нулём', negative.args[0].importance, 0);

done();
