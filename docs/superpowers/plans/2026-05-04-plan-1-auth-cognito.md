# Auth & Cognito Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the monorepo, set up AWS Cognito, and implement JWT authentication guards in NestJS so every subsequent plan can build on a working auth layer.

**Architecture:** Monorepo with npm workspaces + Turborepo. NestJS backend on port 3001, Next.js frontend on port 3000. Cognito User Pool holds users with `custom:role` and `custom:teamId` attributes. The NestJS `JwtAuthGuard` validates every incoming request using `aws-jwt-verify`.

**Tech Stack:** Node.js 20, NestJS, Next.js 14 (App Router), TypeScript, AWS Cognito, `aws-jwt-verify`, Turborepo, npm workspaces, Jest, Supertest

---

## File Map

```
mini-jira/
├── package.json                          # workspace root
├── turbo.json                            # turborepo config
├── apps/
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── auth/
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── jwt.strategy.ts        # verifies Cognito JWT
│   │   │   │   ├── jwt-auth.guard.ts      # global guard
│   │   │   │   ├── roles.guard.ts         # checks custom:role claim
│   │   │   │   ├── roles.decorator.ts     # @Roles() decorator
│   │   │   │   └── current-user.decorator.ts
│   │   │   └── health/
│   │   │       └── health.controller.ts   # GET /api/health
│   │   └── test/
│   │       └── auth.e2e-spec.ts
│   └── frontend/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── middleware.ts              # protects all (app) routes
│       │   ├── (auth)/
│       │   │   └── login/
│       │   │       └── page.tsx          # Cognito Hosted UI redirect
│       │   └── (app)/
│       │       └── dashboard/
│       │           └── page.tsx          # placeholder, auth-protected
│       └── lib/
│           └── auth.ts                   # token helpers (get/clear cookie)
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            └── index.ts                  # UserRole enum + User type
```

---

### Task 1: Scaffold the Monorepo

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the workspace root `package.json`**

```json
{
  "name": "mini-jira",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 3: Create `packages/shared/package.json`**

```json
{
  "name": "@mini-jira/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: Create `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `packages/shared/src/index.ts`**

```typescript
export enum UserRole {
  Manager = 'Manager',
  Employee = 'Employee',
}

export enum TaskStatus {
  ToDo = 'ToDo',
  InProgress = 'InProgress',
  InReview = 'InReview',
  Done = 'Done',
}

export enum TaskPriority {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
}

export interface User {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  teamId: string;
  createdAt: string;
}

export interface Team {
  teamId: string;
  name: string;
  createdAt: string;
}

export interface Project {
  projectId: string;
  title: string;
  description: string;
  managerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
  teamId: string;
  projectId: string;
  imageKey?: string;
  resizedImageKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  taskId: string;
  commentId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface AuditLogEntry {
  taskId: string;
  timestamp: string;
  event: string;
  actorId: string;
  targetId?: string;
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  teamId: string;
}

export interface CognitoUser {
  userId: string;
  email: string;
  role: UserRole;
  teamId: string;
  displayName: string;
}
```

- [ ] **Step 6: Install dependencies and build shared package**

```bash
npm install
cd packages/shared && npm run build
```

Expected: `packages/shared/dist/index.js` and `packages/shared/dist/index.d.ts` created.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold monorepo with shared types package"
```

---

### Task 2: Scaffold the NestJS Backend

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/nest-cli.json`
- Create: `apps/backend/src/main.ts`
- Create: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Create `apps/backend/package.json`**

```json
{
  "name": "@mini-jira/backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config jest-e2e.json"
  },
  "dependencies": {
    "@mini-jira/shared": "*",
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "aws-jwt-verify": "^4.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/testing": "^10.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^20.0.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.0.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.4.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "moduleNameMapper": { "^@mini-jira/shared$": "<rootDir>/../../packages/shared/src/index.ts" }
  }
}
```

- [ ] **Step 2: Create `apps/backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@mini-jira/shared": ["../../packages/shared/src/index.ts"]
    }
  }
}
```

- [ ] **Step 3: Create `apps/backend/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 4: Create `apps/backend/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true });
  await app.listen(3001);
}
bootstrap();
```

- [ ] **Step 5: Create `apps/backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 6: Install backend dependencies**

```bash
cd apps/backend && npm install
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend
git commit -m "feat: scaffold NestJS backend app"
```

---

### Task 3: Health Endpoint

**Files:**
- Create: `apps/backend/src/health/health.controller.ts`
- Create: `apps/backend/src/health/health.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/health/health.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok status', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest health.controller.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './health.controller'`

- [ ] **Step 3: Create `apps/backend/src/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && npx jest health.controller.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/health
git commit -m "feat: add health check endpoint GET /api/health"
```

---

### Task 4: Cognito User Pool Setup (AWS Console)

**Files:** None (AWS Console configuration)

- [ ] **Step 1: Create Cognito User Pool**

In AWS Console → Cognito → Create User Pool:
- Pool name: `mini-jira-pool`
- Sign-in: Email only
- Password policy: default
- MFA: Off (free tier)
- Self-registration: Disabled
- Required attributes: `email`, `name`

- [ ] **Step 2: Add custom attributes**

In User Pool → Attributes → Add custom attribute:
- Name: `role`, type: String, mutable: true
- Name: `teamId`, type: String, mutable: true

- [ ] **Step 3: Create server-side app client (backend)**

App clients → Add client:
- Name: `mini-jira-backend`
- Client secret: No (not needed for JWT verification)
- Auth flows: `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`
- Note the **Client ID** — you'll need it

- [ ] **Step 4: Create public app client (frontend)**

App clients → Add client:
- Name: `mini-jira-frontend`
- Client secret: No
- Auth flows: `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`
- Callback URL: `http://localhost:3000/auth/callback` (add CloudFront URL later)
- Note the **Client ID**

- [ ] **Step 5: Enable Hosted UI**

App integration → Domain → Create: `mini-jira-auth` (or any available name)

- [ ] **Step 6: Create a `.env` file in `apps/backend/`**

```bash
# apps/backend/.env
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=<backend-client-id>
FRONTEND_URL=http://localhost:3000
AWS_REGION=us-east-1
```

Add `.env` to `.gitignore` at repo root:

```
.env
*.env
node_modules/
dist/
```

- [ ] **Step 7: Commit `.gitignore`**

```bash
git add .gitignore
git commit -m "chore: add gitignore"
```

---

### Task 5: JWT Auth Guard (NestJS)

**Files:**
- Create: `apps/backend/src/auth/auth.module.ts`
- Create: `apps/backend/src/auth/jwt.strategy.ts`
- Create: `apps/backend/src/auth/jwt-auth.guard.ts`
- Create: `apps/backend/src/auth/current-user.decorator.ts`
- Create: `apps/backend/src/auth/jwt.strategy.spec.ts`

- [ ] **Step 1: Write the failing test for JWT strategy**

Create `apps/backend/src/auth/jwt.strategy.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest jwt.strategy.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './jwt.strategy'`

- [ ] **Step 3: Create `apps/backend/src/auth/jwt.strategy.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && npx jest jwt.strategy.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Create `apps/backend/src/auth/jwt-auth.guard.ts`**

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { JwtStrategy } from './jwt.strategy';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    tokenUse: 'access',
    clientId: process.env.COGNITO_CLIENT_ID!,
  });

  constructor(private jwtStrategy: JwtStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.slice(7);
    try {
      const payload = await this.verifier.verify(token);
      request.user = this.jwtStrategy.validate(payload as Record<string, string>);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
```

- [ ] **Step 6: Create `apps/backend/src/auth/roles.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@mini-jira/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 7: Create `apps/backend/src/auth/roles.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@mini-jira/shared';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.includes(user?.role)) throw new ForbiddenException();
    return true;
  }
}
```

- [ ] **Step 8: Create `apps/backend/src/auth/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CognitoUser } from '@mini-jira/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CognitoUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
```

- [ ] **Step 9: Create `apps/backend/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 10: Run all backend tests**

```bash
cd apps/backend && npx jest --no-coverage
```

Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/auth
git commit -m "feat: implement Cognito JWT auth guard and roles guard"
```

---

### Task 6: Scaffold the Next.js Frontend

**Files:**
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/next.config.ts`
- Create: `apps/frontend/tailwind.config.ts`
- Create: `apps/frontend/app/layout.tsx`
- Create: `apps/frontend/app/middleware.ts`
- Create: `apps/frontend/app/(auth)/login/page.tsx`
- Create: `apps/frontend/app/(app)/dashboard/page.tsx`
- Create: `apps/frontend/lib/auth.ts`

- [ ] **Step 1: Create `apps/frontend/package.json`**

```json
{
  "name": "@mini-jira/frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "@mini-jira/shared": "*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "amazon-cognito-identity-js": "^6.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./*"],
      "@mini-jira/shared": ["../../packages/shared/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/frontend/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create `apps/frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create `apps/frontend/lib/auth.ts`**

```typescript
import { CognitoUser } from '@mini-jira/shared';

export function getTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

export function parseJwtPayload(token: string): CognitoUser | null {
  try {
    const base64 = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
    return {
      userId: decoded.sub,
      email: decoded.email,
      displayName: decoded.name,
      role: decoded['custom:role'],
      teamId: decoded['custom:teamId'],
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Create `apps/frontend/app/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromCookie, parseJwtPayload } from '../lib/auth';

export function middleware(request: NextRequest) {
  const token = getTokenFromCookie(request.headers.get('cookie'));
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');

  if (!token || !parseJwtPayload(token)) {
    if (!isAuthRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
};
```

- [ ] **Step 7: Create `apps/frontend/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mini-Jira',
  description: 'Team task management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create `apps/frontend/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Create `apps/frontend/app/(auth)/login/page.tsx`**

```typescript
'use client';

export default function LoginPage() {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
  const redirectUri = encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`);
  const loginUrl = `${cognitoDomain}/login?client_id=${clientId}&response_type=token&scope=openid+email+profile&redirect_uri=${redirectUri}`;

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
```

- [ ] **Step 10: Create `apps/frontend/app/(app)/dashboard/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { getTokenFromCookie, parseJwtPayload } from '../../../lib/auth';

export default function DashboardPage() {
  const cookieStore = cookies();
  const token = getTokenFromCookie(cookieStore.toString());
  const user = token ? parseJwtPayload(token) : null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {user && <p className="mt-2 text-gray-600">Welcome, {user.displayName} ({user.role})</p>}
    </div>
  );
}
```

- [ ] **Step 11: Create `apps/frontend/.env.local`**

```bash
NEXT_PUBLIC_COGNITO_DOMAIN=https://mini-jira-auth.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_COGNITO_CLIENT_ID=<frontend-client-id>
NEXT_PUBLIC_APP_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

- [ ] **Step 12: Install frontend dependencies**

```bash
cd apps/frontend && npm install
```

- [ ] **Step 13: Commit**

```bash
git add apps/frontend
git commit -m "feat: scaffold Next.js frontend with Cognito login redirect and auth middleware"
```

---

### Task 7: Create Initial Cognito Users (AWS Console)

**Files:** None (AWS Console)

- [ ] **Step 1: Create Manager user (Ali)**

Cognito → User Pool → Users → Create user:
- Username: `ali@example.com`
- Temporary password: set one
- Custom attributes: `custom:role = Manager`, `custom:teamId = (leave empty)`

- [ ] **Step 2: Create Frontend team**

(Will be stored in DynamoDB in Plan 2, but create the teamId value now: `team-frontend`)

- [ ] **Step 3: Create Employee user (Sara)**

Cognito → Create user:
- Username: `sara@example.com`
- Custom attributes: `custom:role = Employee`, `custom:teamId = team-frontend`

- [ ] **Step 4: Create Backend team employee (Omar)**

Cognito → Create user:
- Username: `omar@example.com`
- Custom attributes: `custom:role = Employee`, `custom:teamId = team-backend`

- [ ] **Step 5: Test login via Hosted UI**

Open the Hosted UI URL from Cognito App Integration → confirm Ali can log in and receives an access token.

---

### Task 8: Smoke Test Auth End-to-End

**Files:**
- Create: `apps/backend/test/auth.e2e-spec.ts`
- Create: `apps/backend/jest-e2e.json`

- [ ] **Step 1: Create `apps/backend/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": { "^@mini-jira/shared$": "<rootDir>/../../packages/shared/src/index.ts" }
}
```

- [ ] **Step 2: Create `apps/backend/test/auth.e2e-spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/health returns 200 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /api/tasks returns 401 without token', () => {
    return request(app.getHttpServer())
      .get('/api/tasks')
      .expect(401);
  });
});
```

- [ ] **Step 3: Run e2e tests**

```bash
cd apps/backend && npx jest --config jest-e2e.json --no-coverage
```

Expected: PASS (health 200, tasks 401 — tasks route doesn't exist yet but guard fires first)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test apps/backend/jest-e2e.json
git commit -m "test: add auth e2e smoke tests"
```

---

### Task 9: Verify Both Apps Run Together

**Files:** None

- [ ] **Step 1: Start backend in one terminal**

```bash
cd apps/backend && npm run dev
```

Expected: `Application is running on: http://localhost:3001`

- [ ] **Step 2: Verify health endpoint**

```bash
curl http://localhost:3001/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Start frontend in another terminal**

```bash
cd apps/frontend && npm run dev
```

Expected: `ready - started server on 0.0.0.0:3000`

- [ ] **Step 4: Open browser at `http://localhost:3000`**

Expected: Redirected to `/login` page. Login button visible.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: verify auth plan complete — both apps running"
```
