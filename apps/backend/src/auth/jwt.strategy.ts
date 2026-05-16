import { Injectable } from '@nestjs/common';
import { CognitoUser, UserRole } from '@mini-jira/shared';

@Injectable()
export class JwtStrategy {
  validate(payload: Record<string, string>): CognitoUser {
    return {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.name,
      role: payload['custom:role'] as UserRole,
      teamId: payload['custom:teamId'],
    };
  }
}
