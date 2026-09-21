// Импорт встреч через коннектор.
//
// Повод настоящий, а не выдуманный. Архив «Авокадо» в базе начинается 3
// апреля 2026, и это не ошибка загрузки: ключ этого аккаунта по API не отдаёт
// ничего раньше — проверено запросами с created_before. Всё, что старше,
// записано другим аккаунтом Fathom, и он к базе как источник не подключён.
// Читать его встречи Claude умеет (у него свой коннектор Fathom), а положить
// их в базу было НЕЧЕМ: у коннектора были только чтение и правка уже
// загруженных строк. Этот тест держит появившуюся дверь — import_meetings.
//
// База подменена тем же шпионом, что и в остальных adversarial-тестах: он
// записывает, какой запрос хендлер СОБРАЛ, и никуда ничего не отправляет.
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';
process.env.MCP_TOKENS = 'tok:owner@example.com';

const { register } = await import('node:module');
const { pathToFileURL } = await import('node:url');
register('./tests/_route-loader.mjs', pathToFileURL('./').href);

const { handleMcpRequest } = await import('../lib/mcp-server.js');
const { mock } = await import('./_route-mocks.mjs');
const { check, isTrue, done } = await import('./_check.mjs');

const OWNER = 'owner@example.com';

const call = (name, args = {}) =>
    handleMcpRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
        OWNER,
    );

//текст ответа инструмента: сервер кладёт результат строкой в content
const textOf = (reply) => reply.body?.result?.content?.[0]?.text ?? '';
const isError = (reply) => reply.body?.result?.isError === true;

//минимальная встреча в том виде, в каком её отдаёт Fathom
const fathomItem = (id, extra = {}) => ({
    recording_id: id,
    title: 'Privilege. Ai автоматизации',
    url: `https://fathom.video/calls/${id}`,
    recording_start_time: '2025-12-04T11:30:00Z',
    recording_end_time: '2025-12-04T12:30:00Z',
    transcript_language: 'ru',
    ...extra,
});

// --- инструмент вообще существует -----------------------------------------

{
    const reply = await handleMcpRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        OWNER,
    );
    const names = (reply.body?.result?.tools ?? []).map((t) => t.name);

    isTrue(
        'коннектор объявляет import_meetings — иначе архив нечем наполнить',
        names.includes('import_meetings'),
    );
}

// --- что должно отвергаться ДО базы ---------------------------------------

{
    mock.reset();
    const reply = await call('import_meetings', {});

    isTrue('без meetings — ошибка, а не молчаливый успех', isError(reply));
    isTrue('и база при этом не тронута', mock.calls.length === 0);
}

{
    mock.reset();
    const reply = await call('import_meetings', { meetings: [] });

    isTrue('пустой список — ошибка: импортировать нечего', isError(reply));
    isTrue('пустой список до базы не доходит', mock.calls.length === 0);
}

{
    mock.reset();
    const reply = await call('import_meetings', { meetings: fathomItem(1) });

    isTrue('один объект вместо списка — ошибка', isError(reply));
    isTrue('объект вместо списка до базы не доходит', mock.calls.length === 0);
}

{
    mock.reset();
    const many = Array.from({ length: 11 }, (_, i) => fathomItem(1000 + i));
    const reply = await call('import_meetings', { meetings: many });

    isTrue('пачка больше десяти — ошибка: тело запроса ограничено', isError(reply));
    isTrue('длина ответа называет предел', /10/.test(textOf(reply)));
    isTrue('переполненная пачка до базы не доходит', mock.calls.length === 0);
}

{
    mock.reset();
    const reply = await call('import_meetings', { meetings: [{ title: 'без записи' }] });

    isTrue('встреча без recording_id — ошибка', isError(reply));
    isTrue('она называет, какая именно строка виновата', /recording_id/.test(textOf(reply)));
    isTrue('встреча без recording_id до базы не доходит', mock.calls.length === 0);
}

// --- владелец берётся из токена, а не из присланного --------------------------

{
    mock.reset();
    mock.rows.maybeSingle = null;
    mock.rows.single = { id: 'new-row' };

    await call('import_meetings', {
        meetings: [fathomItem(2001, { owner_email: 'stranger@evil.io' })],
    });

    //запись идёт upsert-ом: строка узнаётся по паре владелец+запись, поэтому
    //повторный импорт той же встречи не создаёт вторую
    const wrote = mock.calls.find((c) => c.table === 'meetings'
        && c.chain.some((s) => s.name === 'upsert'));
    const row = wrote?.chain.find((s) => s.name === 'upsert')?.args?.[0] ?? {};

    isTrue('встреча уходит в базу upsert-ом, а не слепой вставкой', Boolean(wrote));

    isTrue('владелец строки — владелец токена', row.owner_email === OWNER);
    isTrue(
        'присланный owner_email игнорируется, а не подставляется',
        row.owner_email !== 'stranger@evil.io',
    );
}

done();
