import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DynamodbModule } from './dynamodb/dynamodb.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, DynamodbModule, ProjectsModule, TasksModule, CommentsModule, TeamsModule, UsersModule, FilesModule],
  controllers: [HealthController],
})
export class AppModule {}
