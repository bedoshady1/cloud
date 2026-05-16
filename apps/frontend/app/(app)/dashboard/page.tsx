import { cookies } from 'next/headers';
import { getTokenFromCookie, parseJwtPayload } from '../../../lib/auth';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = getTokenFromCookie(cookieStore.toString());
  const user = token ? parseJwtPayload(token) : null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {user && <p className="mt-2 text-gray-600">Welcome, {user.displayName} ({user.role})</p>}
    </div>
  );
}
