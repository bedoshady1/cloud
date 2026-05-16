import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [AuthModule, TasksModule],
  controllers: [HealthController],
})
export class AppModule {}
