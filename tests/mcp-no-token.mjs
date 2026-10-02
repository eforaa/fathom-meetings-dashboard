// Адрес коннектора без токена.
//
// Повод настоящий. Человек вставляет в Claude ссылку, оборвав её на
// `/api/mcp` — без личного токена. Маршрут есть только у `/api/mcp/<токен>`,
// поэтому запрос проваливался мимо него и возвращал HTML: страницу приложения
// с кодом 200. Для MCP-клиента это худший из ответов — он видит успех, не
// может разобрать тело, решает, что сервер требует входа, идёт искать
// OAuth-адреса (их у нас нет, 404) и показывает человеку
// «Couldn't register with sign-in service… add an OAuth Client ID».
//
// То есть сообщение про OAuth — последствие, а причина в оборванной ссылке.
// Эндпоинт обязан отвечать сам за себя: JSON, понятный код и текст, который
// называет настоящую причину.
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';
process.env.MCP_TOKENS = 'tok:owner@example.com';

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./tests/_route-loader.mjs', pathToFileURL('./').href);

import { check, isTrue, done } from './_check.mjs';

const route = await import('../app/api/mcp/route.js');

const post = () => route.POST(new Request('http://test/api/mcp', {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    headers: { 'content-type': 'application/json' },
}));

// --- POST: отвечает сам, а не отдаёт страницу --------------------------------

{
    const res = await post();
    const body = await res.clone().json();
    const text = JSON.stringify(body);

    check('код 400: запрос неполон, а не «не авторизован»', res.status, 400);
    isTrue('ответ — JSON, а не HTML', (res.headers.get('content-type') ?? '').includes('json'));
    check('это валидный jsonrpc-ответ', body.jsonrpc, '2.0');
    isTrue('в тексте сказано про токен', /token/i.test(text));
    isTrue(
        'и назван вид правильной ссылки, чтобы человек починил сам',
        text.includes('/api/mcp/'),
    );
    isTrue(
        'про OAuth не говорится ничего — его здесь нет',
        !/oauth/i.test(text),
    );
}

// --- GET: тот же ответ, браузером тоже заходят -------------------------------

{
    const res = await route.GET(new Request('http://test/api/mcp'));
    const body = await res.clone().json();

    check('GET отвечает тем же кодом', res.status, 400);
    isTrue('и тоже json', (res.headers.get('content-type') ?? '').includes('json'));
    isTrue('и тоже называет токен', /token/i.test(JSON.stringify(body)));
}

// --- чего быть не должно -----------------------------------------------------

{
    const res = await post();
    const text = await res.text();

    //ищем именно разметку, а не любые угловые скобки: в тексте есть
    //плейсхолдер `<your token>`, и он там полезен
    isTrue(
        'в ответе нет html-разметки',
        !/<!doctype|<html|<head|<body|<div/i.test(text),
    );
    isTrue(
        'и нет ни слова про вход в аккаунт — это сбивает с настоящей причины',
        !/sign.?in|login|войти/i.test(text),
    );
}

done();
