import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ManagerOnly, TeamGuard } from '../auth/team.guard';
import { CognitoUser } from '@mini-jira/shared';

@Controller('tasks')
@UseGuards(TeamGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ManagerOnly()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: CognitoUser) {
    return this.tasksService.create(dto, user.userId);
  }

  @Get()
  findAll(@CurrentUser() user: CognitoUser, @Query('limit') limit?: string, @Query('lastKey') lastKey?: string) {
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
    let parsedLastKey: Record<string, unknown> | undefined;
    if (lastKey) {
      try {
        parsedLastKey = JSON.parse(decodeURIComponent(lastKey));
      } catch {
        throw new BadRequestException('Invalid lastKey format');
      }
    }
    return this.tasksService.findAll(user, parsedLimit, parsedLastKey);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CognitoUser) {
    return this.tasksService.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: CognitoUser) {
    return this.tasksService.update(id, dto, user);
  }

  @Delete(':id')
  @ManagerOnly()
  remove(@Param('id') id: string, @CurrentUser() user: CognitoUser) {
    return this.tasksService.remove(id, user);
  }

  @Get(':id/audit')
  getAuditLog(@Param('id') id: string, @CurrentUser() user: CognitoUser) {
    return this.tasksService.getAuditLog(id, user);
  }
}
