import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { TaskPriority, TaskStatus } from '@mini-jira/shared';

export class CreateTaskDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(TaskPriority) priority!: TaskPriority;
  @IsDateString() deadline!: string;
  @IsString() @IsNotEmpty() assigneeId!: string;
  @IsString() @IsNotEmpty() teamId!: string;
  @IsString() @IsNotEmpty() projectId!: string;
  @IsEnum(TaskStatus) @IsOptional() status?: TaskStatus;
}
