import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoJwtVerifierSingleUserPool } from 'aws-jwt-verify/cognito-verifier';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtStrategy } from './jwt.strategy';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private verifier: CognitoJwtVerifierSingleUserPool<{
    userPoolId: string;
    tokenUse: 'id';
    clientId: string;
  }>;

  constructor(
    private reflector: Reflector,
    private jwtStrategy: JwtStrategy,
  ) {
    const poolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;
    if (!poolId || !clientId) {
      throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set');
    }
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: poolId,
      tokenUse: 'id',
      clientId,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.slice(7);
    try {
      const payload = await this.verifier.verify(token);
      request.user = this.jwtStrategy.validate(payload as Record<string, string>);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
