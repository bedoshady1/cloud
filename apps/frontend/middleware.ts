import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromCookie, parseJwtPayload } from './lib/auth';

export function middleware(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie');
  const idToken = cookieHeader?.match(/id_token=([^;]+)/)?.[1] ?? null;
  const isAuthenticated = idToken !== null && parseJwtPayload(idToken) !== null;
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');

  if (isAuthenticated && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (!isAuthenticated && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|auth/callback|api/auth/set-token).*)'],
};
