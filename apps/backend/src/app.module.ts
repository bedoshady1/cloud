import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DynamodbModule } from './dynamodb/dynamodb.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, DynamodbModule, ProjectsModule, TasksModule, CommentsModule],
  controllers: [HealthController],
})
export class AppModule {}
