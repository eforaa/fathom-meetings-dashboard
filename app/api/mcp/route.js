import { NextResponse } from 'next/server';

//always run, never cache
export const dynamic = 'force-dynamic';

//Адрес коннектора без токена.
//
//Настоящий адрес — `/api/mcp/<личный токен>`; токен и есть вся авторизация,
//никакого OAuth у этого сервера нет. Но человек легко обрывает ссылку на
//`/api/mcp`, и до этого маршрута запрос просто не доходил: совпадения не было,
//и приложение отдавало HTML своей страницы с кодом 200.
//
//Для MCP-клиента это худший из ответов. Он видит успех, не может разобрать
//тело, решает, что сервер требует входа, идёт искать OAuth-адреса — их нет,
//404 — и показывает человеку «Couldn't register with sign-in service, add an
//OAuth Client ID». Сообщение уводит ровно в ту сторону, где чинить нечего.
//
//Поэтому эндпоинт отвечает за себя сам: json, код 400 (запрос неполон, а не
//«не авторизован» — иначе клиент снова пойдёт в вход) и текст, который
//называет настоящую причину и показывает, как выглядит правильная ссылка.
const MISSING_TOKEN = {
  jsonrpc: '2.0',
  id: null,
  error: {
    code: -32001,
    message:
      'Connector token missing from the URL. This server authenticates by a personal token in the path: use https://<host>/api/mcp/<your token>. The full link is on the "Подключение" page of the dashboard.',
  },
};

const reply = () => NextResponse.json(MISSING_TOKEN, { status: 400 });

export async function POST() {
  return reply();
}

//браузером сюда тоже заходят, проверяя «работает ли ссылка» — отвечаем тем же
export async function GET() {
  return reply();
}
