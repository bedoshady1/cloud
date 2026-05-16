import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { accessToken } = await req.json();
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 });
  }
  const cookieStore = await cookies();
  cookieStore.set('access_token', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });
  return NextResponse.json({ ok: true });
}
