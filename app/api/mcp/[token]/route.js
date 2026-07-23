import { NextResponse } from 'next/server';
import { resolveOwner, handleMcpRequest } from '@/lib/mcp-server';

//always run, never cache
export const dynamic = 'force-dynamic';
//maximum execution time
export const maxDuration = 60;

//token from the Authorization header wins over the one in the url
function tokenFrom(request, pathToken) {
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();

  return pathToken;
}

//mcp clients talk over POST with jsonrpc bodies
export async function POST(request, context) {
  //next 16: params is a promise
  const { token } = await context.params;

  const ownerEmail = resolveOwner(tokenFrom(request, token));
  //unknown token: no hints about which part was wrong
  if (!ownerEmail) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
      { status: 401 },
    );
  }

  //body must be json
  const message = await request.json().catch(() => null);
  if (!message) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 },
    );
  }

  try {
    const { status, body } = await handleMcpRequest(message, ownerEmail);

    //notifications get an empty reply
    if (!body) return new Response(null, { status });

    return NextResponse.json(body, { status });
  } catch (caught) {
    //error handling converting error to text
    const text = caught instanceof Error ? caught.message : String(caught);
    console.error('mcp failed:', text);

    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: text } },
      { status: 500 },
    );
  }
}

//sse streaming is not supported, POST is enough for this server
export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}
