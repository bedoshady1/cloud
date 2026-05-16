import { JwtStrategy } from './jwt.strategy';
import { UserRole } from '@mini-jira/shared';

describe('JwtStrategy', () => {
  it('maps Cognito payload to CognitoUser', () => {
    const strategy = new JwtStrategy();
    const payload = {
      sub: 'user-123',
      email: 'sara@example.com',
      name: 'Sara',
      'custom:role': 'Employee',
      'custom:teamId': 'team-frontend',
    };
    const result = strategy.validate(payload);
    expect(result).toEqual({
      userId: 'user-123',
      email: 'sara@example.com',
      displayName: 'Sara',
      role: UserRole.Employee,
      teamId: 'team-frontend',
    });
  });
});
