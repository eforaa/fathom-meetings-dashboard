// Папки: владение и то, что удаление ничего лишнего не уносит.
//
// Правила дерева проверяет tests/group-tree.mjs — там нет базы вовсе. Здесь
// другое: доезжает ли до запроса чужой id, стоит ли фильтр по владельцу на
// КАЖДОМ запросе, и — главное — не трогает ли удаление папки таблицу meetings.
// Последнее нельзя доказать рассуждением: это надо увидеть в списке запросов,
// которые функция собрала.
//
// База подменена тем же шпионом, что и в остальных adversarial-тестах: он
// записывает собранный запрос и отвечает заготовкой, никуда не ходя.
//
// Run: node tests/groups-db.mjs
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';

const { register } = await import('node:module');
const { pathToFileURL } = await import('node:url');
register('./tests/_route-loader.mjs', pathToFileURL('./').href);

const groups = await import('../lib/groups.js');
const { mock, callsTo, didStep, ownerFilterValues } = await import('./_route-mocks.mjs');
const { check, isTrue, done } = await import('./_check.mjs');

const ME = 'me@x.io';
const OTHER = 'someone@else.io';

const G = {
    clients: '11111111-1111-4111-8111-111111111111',
    acme: '22222222-2222-4222-8222-222222222222',
    rollout: '33333333-3333-4333-8333-333333333333',
    alien: '99999999-9999-4999-8999-999999999999',
};
const M1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const M2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const FOREIGN = 'bbbbbbbb-0000-4000-8000-000000000009';

const TREE = [
    { id: G.clients, name: 'Clients', parent_id: null, position: 0 },
    { id: G.acme, name: 'Acme', parent_id: G.clients, position: 0 },
    { id: G.rollout, name: 'Rollout', parent_id: G.acme, position: 0 },
];

//моё дерево читается из meeting_groups, всё остальное настраивается по месту
function withTree(extra = {}) {
    mock.reset();
    mock.byTable = {
        meeting_groups: { list: TREE, maybeSingle: null, single: TREE[0] },
        meeting_group_members: { list: [] },
        meetings: { list: [] },
        ...extra,
    };
}

const errorOf = async (run) => {
    try {
        await run();
        return null;
    } catch (caught) {
        return caught.message;
    }
};

// === чтение: фильтр по владельцу стоит везде ================================
withTree();
await groups.listGroups(ME);
check('список папок читается только своим владельцем', ownerFilterValues(), [ME]);

mock.reset();
check('без владельца список пуст и в базу не ходит',
    [await groups.listGroups(null), mock.calls.length], [[], 0]);

withTree();
await groups.listMemberships(ME);
check('членство тоже отфильтровано владельцем', ownerFilterValues(), [ME]);

// === выбранная папка ========================================================
withTree();
const inside = await groups.meetingIdsInGroup(ME, G.alien);
check('чужой id папки даёт пустоту, а не «покажи всё»', inside, []);
check('и запроса к членству по нему не было', callsTo('meeting_group_members').length, 0);

withTree({ meeting_group_members: { list: [{ meeting_id: M1 }, { meeting_id: M1 }, { meeting_id: M2 }] } });
check('встреча, лежащая и в папке, и в подпапке, в списке одна',
    (await groups.meetingIdsInGroup(ME, G.clients)).sort(), [M1, M2].sort());

withTree({ meeting_group_members: { list: [] } });
await groups.meetingIdsInGroup(ME, G.clients);
const asked = callsTo('meeting_group_members')[0].chain.find((s) => s.name === 'in');
check('по умолчанию спрашиваются папка и все её подпапки',
    [...asked.args[1]].sort(), [G.acme, G.clients, G.rollout].sort());

withTree({ meeting_group_members: { list: [] } });
await groups.meetingIdsInGroup(ME, G.clients, { includeDescendants: false });
check('include_descendants:false спрашивает ровно одну папку',
    callsTo('meeting_group_members')[0].chain.find((s) => s.name === 'in').args[1], [G.clients]);

check('id папки из ссылки: своё берётся', groups.pickGroupId(TREE, G.acme), G.acme);
check('чужое — нет', groups.pickGroupId(TREE, G.alien), null);
check('мусор — тоже нет', groups.pickGroupId(TREE, '../../etc/passwd'), null);
check('пусто остаётся пустым', groups.pickGroupId(TREE, undefined), null);

// === создание ===============================================================
withTree({ meeting_groups: { list: TREE, single: { id: 'new', name: 'Hiring', parent_id: null, position: 1 } } });
const made = await groups.createGroup(ME, { name: '  Hiring  ' });
check('имя подчищается перед записью', made.name, 'Hiring');
const insert = callsTo('meeting_groups').flatMap((c) => c.chain).find((s) => s.name === 'insert');
check('владельцем записывается тот, кто вызвал', insert.args[0].owner_email, ME);

withTree();
check('пустое имя — отказ', await errorOf(() => groups.createGroup(ME, { name: '   ' })), 'Group name is empty');
check('и в базу такой запрос не уходит', didStep('meeting_groups', 'insert'), false);

withTree();
check('подпапка чужой папки не создаётся',
    await errorOf(() => groups.createGroup(ME, { name: 'X', parentId: G.alien })),
    'Parent group not found');
check('вставки не было', didStep('meeting_groups', 'insert'), false);

// === перенос ================================================================
withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[0] } });
check('папка не переносится внутрь самой себя',
    await errorOf(() => groups.moveGroup(ME, G.clients, G.clients)),
    'A group cannot be its own parent');
check('обновления не было', didStep('meeting_groups', 'update'), false);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[0] } });
isTrue('папка не уезжает под собственную подпапку',
    (await errorOf(() => groups.moveGroup(ME, G.clients, G.rollout)))?.includes('loop'));
check('и здесь обновления не было', didStep('meeting_groups', 'update'), false);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] } });
check('перенос под чужую папку — отказ',
    await errorOf(() => groups.moveGroup(ME, G.acme, G.alien)),
    'Parent group not found');

withTree({ meeting_groups: { list: TREE, maybeSingle: null } });
check('чужую папку не перенести: её для меня не существует',
    await errorOf(() => groups.moveGroup(ME, G.alien, null)),
    'Group not found');

withTree({
    meeting_groups: {
        list: TREE,
        maybeSingle: TREE[2],
        single: { id: G.rollout, name: 'Rollout', parent_id: null, position: 1 },
    },
});
const moved = await groups.moveGroup(ME, G.rollout, null);
check('в корень перенести можно', moved.parent_id, null);
isTrue('и запись отфильтрована владельцем', ownerFilterValues().every((v) => v === ME));

// === удаление: встречи остаются =============================================
withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] } });
const gone = await groups.deleteGroup(ME, G.acme);

check('удаляется ровно одна папка', gone.deleted, [G.acme]);
check('ТАБЛИЦА meetings НЕ ТРОНУТА — встречи переживают удаление папки',
    callsTo('meetings').length, 0);
isTrue('снято членство именно в удаляемой папке',
    callsTo('meeting_group_members').some((c) =>
        c.chain.some((s) => s.name === 'delete')
        && c.chain.some((s) => s.name === 'in' && s.args[1].includes(G.acme))));
isTrue('подпапки подняты на место удалённой',
    callsTo('meeting_groups').some((c) =>
        c.chain.some((s) => s.name === 'update' && s.args[0].parent_id === G.clients)
        && c.chain.some((s) => s.name === 'eq' && s.args[0] === 'parent_id' && s.args[1] === G.acme)));
isTrue('каждый запрос удаления отфильтрован владельцем',
    ownerFilterValues().every((v) => v === ME));

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[0] } });
const branch = await groups.deleteGroup(ME, G.clients, { cascade: true });
check('cascade уносит всю ветку', [...branch.deleted].sort(), [G.acme, G.clients, G.rollout].sort());
check('и встречи всё равно целы', callsTo('meetings').length, 0);
check('детей при этом не поднимают — их уже нет',
    callsTo('meeting_groups').some((c) => c.chain.some((s) => s.name === 'update')), false);

withTree({ meeting_groups: { list: TREE, maybeSingle: null } });
check('чужую папку не удалить', await errorOf(() => groups.deleteGroup(ME, G.alien)), 'Group not found');
check('и ничего не удалено', didStep('meeting_groups', 'delete'), false);

// === встречи в папке ========================================================
withTree({
    meeting_groups: { list: TREE, maybeSingle: TREE[1] },
    //база вернула только СВОИ встречи: чужой id в неё не попал
    meetings: { list: [{ id: M1 }, { id: M2 }] },
});
const added = await groups.assignMeetings(ME, G.acme, [M1, M2, FOREIGN, M1]);
check('в папку кладутся только свои встречи', added.added.sort(), [M1, M2].sort());
check('чужая названа отдельно, а не роняет всю пачку', added.rejected, [FOREIGN]);

const upsert = callsTo('meeting_group_members').flatMap((c) => c.chain).find((s) => s.name === 'upsert');
check('в членство пишется ровно две строки', upsert.args[0].length, 2);
isTrue('и у каждой владелец из сессии', upsert.args[0].every((row) => row.owner_email === ME));
isTrue('повтор не считается ошибкой', upsert.args[1].ignoreDuplicates === true);

withTree({ meeting_groups: { list: TREE, maybeSingle: null } });
check('в чужую папку положить нельзя',
    await errorOf(() => groups.assignMeetings(ME, G.alien, [M1])), 'Group not found');
check('и членство не тронуто', callsTo('meeting_group_members').length, 0);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] }, meetings: { list: [] } });
const nothingMine = await groups.assignMeetings(ME, G.acme, [FOREIGN]);
check('пачка из одних чужих id ничего не пишет',
    [nothingMine.added, nothingMine.rejected], [[], [FOREIGN]]);
check('записи не было', callsTo('meeting_group_members').length, 0);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] } });
check('пустая пачка — отказ, а не тихое ничего',
    await errorOf(() => groups.assignMeetings(ME, G.acme, [])), 'No meetings chosen');

//Пачка сверх предела ОТКЛОНЯЕТСЯ целиком, а не обрезается.
//
//Обрезать — значит выполнить половину просьбы и отчитаться успехом: человек
//просил разложить 500 встреч, получил 200 и слово «готово». Про остальные 300
//не узнает никто.
withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] }, meetings: { list: [{ id: M1 }] } });
const flood = Array.from({ length: groups.MAX_ASSIGN + 1 }, () => crypto.randomUUID());
isTrue(`пачка больше ${groups.MAX_ASSIGN} отклоняется целиком`,
    (await errorOf(() => groups.assignMeetings(ME, G.acme, flood)))?.includes(String(groups.MAX_ASSIGN)));
check('и ни одной строки при этом не записано', callsTo('meeting_group_members').length, 0);

withTree({ meeting_groups: { list: TREE, maybeSingle: TREE[1] } });
check('не-uuid в пачке отбивается до всякой записи',
    await errorOf(() => groups.assignMeetings(ME, G.acme, [M1, '../../etc/passwd'])),
    'Every meeting id must be a UUID');
check('в meetings такой запрос не уходит', callsTo('meetings').length, 0);

// === вынуть из папки ========================================================
withTree({
    meeting_groups: { list: TREE, maybeSingle: TREE[1] },
    //база вернула снятую строку членства — это и есть «была в папке»
    meeting_group_members: { list: [{ meeting_id: M1 }] },
});
const taken = await groups.removeMeetings(ME, G.acme, [M1, M2]);
check('снятым считается только то, что в папке лежало', taken.removed, [M1]);
check('остальное названо отдельно, а не выдано за успех', taken.unchanged, [M2]);
check('таблица meetings и здесь не тронута', callsTo('meetings').length, 0);
isTrue('удаление членства ограничено папкой и владельцем',
    callsTo('meeting_group_members').some((c) => {
        const eqs = c.chain.filter((s) => s.name === 'eq').map((s) => s.args.join('='));
        return c.chain.some((s) => s.name === 'delete')
            && eqs.includes(`owner_email=${ME}`)
            && eqs.includes(`group_id=${G.acme}`);
    }));

withTree({ meeting_groups: { list: TREE, maybeSingle: null } });
check('из чужой папки вынимать нечего',
    await errorOf(() => groups.removeMeetings(OTHER, G.acme, [M1])), 'Group not found');

// === членство наизнанку =====================================================
const ROWS = [
    { group_id: G.acme, meeting_id: M1 },
    { group_id: G.acme, meeting_id: M2 },
    { group_id: G.rollout, meeting_id: M1 },
];
check('по папкам', [...groups.membershipByGroup(ROWS).get(G.acme)], [M1, M2]);
check('и по встречам', [...groups.membershipByMeeting(ROWS).get(M1)], [G.acme, G.rollout]);

done();
