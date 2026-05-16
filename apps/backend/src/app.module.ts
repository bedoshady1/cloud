import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { TasksController } from './tasks/tasks.controller';

@Module({
  imports: [AuthModule],
  controllers: [HealthController, TasksController],
})
export class AppModule {}
