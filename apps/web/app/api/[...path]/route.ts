import { NextRequest, NextResponse } from 'next/server';

const base = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '');
const secure = process.env.NODE_ENV === 'production';
const cookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
const allowedRoots = new Set(['auth', 'accounts', 'categories', 'transactions', 'dashboard', 'budgets', 'recurring', 'goals', 'imports', 'settings', 'ai']);

async function proxy(request: NextRequest, context: {params: Promise<{path: string[]}>}) {
  const {path} = await context.params;
  if (!allowedRoots.has(path[0]) || path.some(x => !/^[a-zA-Z0-9_-]+$/.test(x))) return NextResponse.json({detail: 'Not found'}, {status: 404});
  const mutation = !['GET', 'HEAD'].includes(request.method);
  if (mutation) {
    const expected = (process.env.APP_ORIGIN || request.nextUrl.origin).trim().replace(/\/+$/, '');
    if (request.headers.get('origin') !== expected) return NextResponse.json({detail: 'Invalid request origin'}, {status: 403});
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 600000) return NextResponse.json({detail: 'Request too large'}, {status: 413});
  let raw = mutation ? await request.text() : undefined;
  if (raw && Buffer.byteLength(raw) > 600000) return NextResponse.json({detail: 'Request too large'}, {status: 413});
  const route = path.join('/');
  // Refresh tokens are used only by this server route and never returned to browser JS.
  if (route === 'auth/refresh') {
    const refresh = request.cookies.get('ps_refresh')?.value;
    if (!refresh || request.method !== 'POST') return NextResponse.json({detail: 'Session expired'}, {status: 401});
    raw = JSON.stringify({refresh_token: refresh});
  }
  const access = request.cookies.get('ps_access')?.value;
  const send = (token?: string) => fetch(`${base}/api/v1/${route}${request.nextUrl.search}`, {
    method: request.method,
    headers: { 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(request.headers.get('idempotency-key') ? {'Idempotency-Key': request.headers.get('idempotency-key')!} : {}) },
    body: raw, cache: 'no-store', signal: AbortSignal.timeout(70000),
  });
  try {
    const upstream = await send(access);
    const payload = await upstream.json().catch(() => ({detail: 'The service is waking up. Please try again shortly.'}));
    let tokenData: {access_token: string; refresh_token: string; expires_in: number} | null = null;
    if (upstream.ok && ['auth/login', 'auth/register', 'auth/refresh', 'auth/email/verify'].includes(route) && typeof payload.access_token === 'string' && typeof payload.refresh_token === 'string') tokenData = {...payload};
    if (tokenData) { delete payload.access_token; delete payload.refresh_token; delete payload.token_type; }
    const response = NextResponse.json(payload, {status: upstream.status, headers: {'Cache-Control': 'no-store'}});
    if (tokenData) {
      response.cookies.set('ps_access', tokenData.access_token, {...cookieOptions, maxAge: tokenData.expires_in});
      response.cookies.set('ps_refresh', tokenData.refresh_token, {...cookieOptions, maxAge: 60 * 60 * 24 * 14});
    }
    if ((route === 'auth/logout' && upstream.ok) || (route === 'auth/password/reset' && upstream.ok) || (route === 'settings/account' && request.method === 'DELETE' && upstream.ok) || (route === 'auth/refresh' && [401, 403].includes(upstream.status))) {
      response.cookies.set('ps_access', '', {...cookieOptions, maxAge: 0});
      response.cookies.set('ps_refresh', '', {...cookieOptions, maxAge: 0});
    }
    return response;
  } catch { return NextResponse.json({detail: 'The backend may be waking up or temporarily unavailable. Please retry in a moment.'}, {status: 503}); }
}
export {proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE};
