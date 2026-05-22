'use client';

export default function LoginPage() {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
  const redirectUri = encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`);
  const loginUrl = `${cognitoDomain}/oauth2/authorize?client_id=${clientId}&response_type=token&scope=openid+email+profile&redirect_uri=${redirectUri}&prompt=login`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Mini-Jira</h1>
        <a
          href={loginUrl}
          className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
        >
          Sign in with your company account
        </a>
      </div>
    </div>
  );
}
