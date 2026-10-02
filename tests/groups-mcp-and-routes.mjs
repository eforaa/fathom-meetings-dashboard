// Две двери в папки: коннектор и маршруты браузера.
//
// Правила у них обязаны быть одни. Если через мышку нельзя перенести папку
// внутрь себя, а словами через Claude — можно, то правила нет, есть привычка
// интерфейса. Поэтому оба входа проверяются одним файлом и одними и теми же
// случаями: чужая папка, цикл, пустое имя, битый id.
//
// Run: node tests/groups-mcp-and-routes.mjs
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';
process.env.MCP_TOKENS = 'tok:me@x.io';

const { register } = await import('node:module');
const { pathToFileURL } = await import('node:url');
register('./tests/_route-loader.mjs', pathToFileURL('./').href);

const { handleMcpRequest } = await import('../lib/mcp-server.js');
const { mock, callsTo, didStep, ownerFilterValues } = await import('./_route-mocks.mjs');
const { _reset } = await import('../lib/rate-limit.js');
const { check, isTrue, done } = await import('./_check.mjs');

const groupsPost = (await import('../app/api/groups/route.js')).POST;
const groupPatch = (await import('../app/api/groups/[id]/route.js')).PATCH;
const groupDelete = (await import('../app/api/groups/[id]/route.js')).DELETE;
const membersPost = (await import('../app/api/groups/[id]/meetings/route.js')).POST;

const ME = 'me@x.io';
const G = {
    clients: '11111111-1111-4111-8111-111111111111',
    acme: '22222222-2222-4222-8222-222222222222',
    rollout: '33333333-3333-4333-8333-333333333333',
    alien: '99999999-9999-4999-8999-999999999999',
};
const M1 = 'aaaaaaaa-0000-4000-8000-000000000001';

const TREE = [
    { id: G.clients, name: 'Clients', parent_id: null, position: 0 },
    { id: G.acme, name: 'Acme', parent_id: G.clients, position: 0 },
    { id: G.rollout, name: 'Rollout', parent_id: G.acme, position: 0 },
];

function withTree(extra = {}) {
    mock.reset();
    _reset();
    mock.byTable = {
        meeting_groups: { list: TREE, maybeSingle: null, single: TREE[0] },
        meeting_group_members: { list: [] },
        meetings: { list: [] },
        ...extra,
    };
}

const call = (name, args = {}) =>
    handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ME);

//коннектор отдаёт результат инструмента текстом — вот его разбор
const payloadOf = (answer) => JSON.parse(answer.body.result.content[0].text);
const isError = (answer) => answer.body.result?.isError === true;
const messageOf = (answer) => answer.body.result.content[0].text;

const req = (body, method = 'POST') =>
    new Request('http://test/api', { method, body, headers: { 'Content-Type': 'application/json' } });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// === инструменты объявлены и доступны =======================================
const listed = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ME);
const names = listed.body.result.tools.map((tool) => tool.name);

const EXPECTED = [
    'list_groups',
    'create_group',
    'rename_group',
    'move_group',
    'delete_group',
    'list_group_meetings',
    'assign_meetings_to_group',
    'remove_meetings_from_group',
];
check('все восемь инструментов для папок объявлены',
    EXPECTED.filter((name) => !names.includes(name)), []);
check('прежние инструменты никуда не делись',
    ['list_meetings', 'get_meeting', 'import_meetings', 'get_stats', 'set_meeting_types']
        .filter((name) => !names.includes(name)), []);
check('у каждого нового инструмента есть схема входа',
    listed.body.result.tools
        .filter((tool) => EXPECTED.includes(tool.name))
        .filter((tool) => tool.inputSchema?.type !== 'object')
        .map((tool) => tool.name), []);
isTrue('инструкции коннектора говорят, что удаление папки не удаляет встречи',
    /ВСТРЕЧИ НЕ УДАЛЯЮТ/.test(
        (await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'initialize' }, ME)).body.result.instructions,
    ));
isTrue('и что встреча может лежать в нескольких папках',
    /НЕСКОЛЬКИХ папках/.test(
        (await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'initialize' }, ME)).body.result.instructions,
    ));

// === list_groups ============================================================
withTree({
    meeting_group_members: {
        list: [
            { group_id: G.acme, meeting_id: M1 },
            { group_id: G.rollout, meeting_id: M1 },
        ],
    },
});
const tree = payloadOf(await call('list_groups'));
check('дерево отдаётся в порядке показа, с глубиной',
    tree.groups.map((row) => `${row.depth}:${row.name}`), ['0:Clients', '1:Acme', '2:Rollout']);
check('у строки есть путь — по одному имени подпапку не узнать',
    tree.groups.find((row) => row.id === G.rollout).path, 'Clients / Acme / Rollout');
check('своё и общее различаются, и встреча из двух папок посчитана один раз',
    [
        tree.groups.find((row) => row.id === G.acme).meetings_here,
        tree.groups.find((row) => row.id === G.acme).meetings_total,
    ],
    [1, 1]);
isTrue('и всё это прочитано только своим владельцем', ownerFilterValues().every((v) => v === ME));

// === владелец берётся из токена, а не из аргументов ==========================
withTree();
await call('list_groups', { owner_email: 'someone@else.io' });
check('подсунутый адрес в фильтр не попадает',
    ownerFilterValues().includes('someone@else.io'), false);

// === создание ===============================================================
withTree({ meeting_groups: { list: TREE, single: { id: 'new', name: 'Hiring', parent_id: null, position: 1 } } });
check('create_group заводит папку', payloadOf(await call('create_group', { name: 'Hiring' })).ok, true);

withTree();
const emptyName = await call('create_group', { name: '  ' });
check('пустое имя возвращается ошибкой инструмента, а не успехом', isError(emptyName), true);
check('и вставки в базу не было', didStep('meeting_groups', 'insert'), false);

withTree();
const alienParent = await call('create_group', { name: 'X', parent_id: G.alien });
check('подпапку чужой папки коннектор не заведёт', messageOf(alienParent), 'Parent group not found');

// === перенос: цикл отбивается и здесь тоже ==================================
withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[0] } });
const loop = await call('move_group', { group_id: G.clients, parent_id: G.rollout });
isTrue('коннектору тоже нельзя утопить папку в собственной ветке',
    isError(loop) && messageOf(loop).includes('loop'));
check('и обновления не было', didStep('meeting_groups', 'update'), false);

withTree({ meeting_groups: { list: TREE, maybeSingle: null } });
const alienMove = await call('move_group', { group_id: G.alien, parent_id: null });
check('чужую папку коннектор не двигает', messageOf(alienMove), 'Group not found');

// === удаление ===============================================================
withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] } });
const deleted = payloadOf(await call('delete_group', { group_id: G.acme }));
check('ответ прямо говорит, сколько встреч удалено', deleted.meetings_deleted, 0);
check('и таблица meetings не тронута', callsTo('meetings').length, 0);

// === содержимое папки ========================================================
withTree({
    meeting_group_members: { list: [{ meeting_id: M1 }] },
    meetings: { list: [{ id: M1, title: 'Call' }] },
});
const contents = payloadOf(await call('list_group_meetings', { group_id: G.acme }));
check('список встреч папки приходит с общим числом', [contents.total, contents.meetings.length], [1, 1]);
isTrue('и сам список тоже отфильтрован владельцем',
    callsTo('meetings')[0].chain.some((s) => s.name === 'eq' && s.args[1] === ME));

withTree();
const alienContents = payloadOf(await call('list_group_meetings', { group_id: G.alien }));
check('чужая папка не отдаёт ничего', [alienContents.total, alienContents.meetings], [0, []]);

// === раскладка встреч ========================================================
withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] }, meetings: { list: [{ id: M1 }] } });
const filed = payloadOf(await call('assign_meetings_to_group', { group_id: G.acme, meeting_ids: [M1] }));
check('встреча кладётся в папку', filed.added, [M1]);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] } });
const pulled = payloadOf(await call('remove_meetings_from_group', { group_id: G.acme, meeting_ids: [M1] }));
check('вынуть из папки — это не удалить встречу', pulled.meetings_deleted, 0);

// === маршруты браузера ======================================================
withTree();
mock.user = null;
let response = await groupsPost(req('{"name":"X"}'));
check('СТОРОЖ ДЕРЖИТ: создание папки без входа — 401, база не тронута',
    [response.status, mock.calls.length], [401, 0]);

withTree();
mock.user = null;
response = await groupDelete(new Request('http://test/api', { method: 'DELETE' }), ctx(G.acme));
check('СТОРОЖ ДЕРЖИТ: удаление без входа — 401, база не тронута',
    [response.status, mock.calls.length], [401, 0]);

withTree();
mock.user = { email: ME };
response = await groupPatch(req('{"name":"X"}', 'PATCH'), ctx('../../etc/passwd'));
check('СТОРОЖ ДЕРЖИТ: битый id папки — 400 до всякой базы',
    [response.status, mock.calls.length], [400, 0]);

withTree();
mock.user = { email: ME };
response = await groupsPost(req(JSON.stringify({ name: 'X', parentId: 'DROP TABLE' })));
check('СТОРОЖ ДЕРЖИТ: битый id родителя — 400 до всякой базы',
    [response.status, mock.calls.length], [400, 0]);

withTree();
mock.user = { email: ME };
response = await groupPatch(req('{"nothing":1}', 'PATCH'), ctx(G.acme));
check('СТОРОЖ ДЕРЖИТ: правка ни о чём — 400, база не тронута',
    [response.status, mock.calls.length], [400, 0]);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[0] } });
mock.user = { email: ME };
response = await groupPatch(req(JSON.stringify({ parentId: G.rollout }), 'PATCH'), ctx(G.clients));
check('СТОРОЖ ДЕРЖИТ: цикл через маршрут — 400', response.status, 400);
check('и записи не было', didStep('meeting_groups', 'update'), false);

withTree();
mock.user = { email: ME };
response = await membersPost(req('{"ids":[]}'), ctx(G.acme));
check('СТОРОЖ ДЕРЖИТ: пачка без встреч — 400, база не тронута',
    [response.status, mock.calls.length], [400, 0]);

withTree();
mock.user = { email: ME };
response = await membersPost(req('{"ids":["not-a-uuid"],"action":"add"}'), ctx(G.acme));
check('СТОРОЖ ДЕРЖИТ: мусор вместо id отсеивается до базы',
    [response.status, mock.calls.length], [400, 0]);

//направление обязано быть названо явно: «положить» и «вынуть» — это не
//умолчание, а два разных действия над одной пачкой
withTree();
mock.user = { email: ME };
response = await membersPost(req(JSON.stringify({ ids: [M1] })), ctx(G.acme));
check('СТОРОЖ ДЕРЖИТ: пачка без направления — 400, база не тронута',
    [response.status, mock.calls.length], [400, 0]);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] }, meetings: { list: [{ id: M1 }] } });
mock.user = { email: ME };
response = await membersPost(
    req(JSON.stringify({ ids: [M1], action: 'add', owner_email: 'victim@x.io' })),
    ctx(G.acme),
);
check('раскладка через маршрут проходит', response.status, 200);
isTrue('и владелец во всех запросах — из сессии, а не из тела',
    ownerFilterValues().every((v) => v === ME));

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] } });
mock.user = { email: ME };
response = await membersPost(req(JSON.stringify({ ids: [M1], action: 'remove' })), ctx(G.acme));
check('и «вынуть» тоже — встречи при этом не трогаются',
    [response.status, callsTo('meetings').length], [200, 0]);

done();
