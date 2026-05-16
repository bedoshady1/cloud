import { CognitoUser } from '@mini-jira/shared';

export function getTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

export function parseJwtPayload(token: string): CognitoUser | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64));
    return {
      userId: decoded.sub,
      email: decoded.email,
      displayName: decoded.name,
      role: decoded['custom:role'],
      teamId: decoded['custom:teamId'],
    };
  } catch {
    return null;
  }
}
