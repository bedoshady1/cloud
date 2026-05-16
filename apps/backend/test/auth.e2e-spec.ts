import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'eu-central-1_KxmWvTWiA';
    process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '2po12vg2nhltnsrc41fftbsflj';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

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
