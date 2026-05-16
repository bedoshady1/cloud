import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoUser, UserRole } from '@mini-jira/shared';

export const MANAGER_ONLY_KEY = 'managerOnly';
export const ManagerOnly = () => SetMetadata(MANAGER_ONLY_KEY, true);

@Injectable()
export class TeamGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: CognitoUser }>();
    const user = request.user;

    if (user?.role === UserRole.Manager) return true;

    const managerOnly = this.reflector.getAllAndOverride<boolean>(MANAGER_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (managerOnly) throw new ForbiddenException('Manager only');

    return true;
  }
}
