import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskPriority, TaskStatus } from '@mini-jira/shared';

export class UpdateTaskDto {
  @IsEnum(TaskStatus) @IsOptional() status?: TaskStatus;
  @IsEnum(TaskPriority) @IsOptional() priority?: TaskPriority;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsDateString() @IsOptional() deadline?: string;
  @IsString() @IsOptional() assigneeId?: string;
}
