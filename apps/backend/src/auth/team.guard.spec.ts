import { TeamGuard } from './team.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@mini-jira/shared';

function makeCtx(user: object, params: object = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('TeamGuard', () => {
  const reflector = new Reflector();
  const guard = new TeamGuard(reflector);

  it('allows Manager through regardless of teamId', () => {
    const ctx = makeCtx({ role: UserRole.Manager, teamId: '' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows Employee when teamId matches resource teamId in request body', () => {
    const req = { user: { role: UserRole.Employee, teamId: 'team-a' }, body: { teamId: 'team-a' }, params: {} };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => ({}), getClass: () => ({}) } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks Employee when route is marked manager-only', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeCtx({ role: UserRole.Employee, teamId: 'team-a' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
