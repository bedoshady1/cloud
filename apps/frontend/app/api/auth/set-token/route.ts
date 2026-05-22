import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { accessToken, idToken } = await req.json();
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 });
  }
  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 3600,
  };
  cookieStore.set('access_token', accessToken, cookieOpts);
  if (idToken && typeof idToken === 'string') {
    cookieStore.set('id_token', idToken, cookieOpts);
  }
  return NextResponse.json({ ok: true });
}
