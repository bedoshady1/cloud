import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CognitoUser } from '@mini-jira/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CognitoUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
