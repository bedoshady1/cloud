'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');
    if (accessToken) {
      fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, idToken }),
      }).then((res) => {
        if (res.ok) router.replace('/dashboard');
        else router.replace('/login');
      }).catch(() => router.replace('/login'));
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-gray-500">Signing you in...</p>
    </div>
  );
}
