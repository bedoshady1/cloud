import type { CognitoUser } from '@mini-jira/shared';

export function Header({ user }: { user: CognitoUser }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="text-sm">
          <p className="font-medium">{user.displayName}</p>
          <p className="text-xs text-gray-500">{user.role}</p>
        </div>
      </div>
    </header>
  );
}
