import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { FilesService } from './files.service';
import { TasksService } from '../tasks/tasks.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { ManagerOnly, TeamGuard } from '../auth/team.guard';
import { CognitoUser } from '@mini-jira/shared';
import { IsString } from 'class-validator';

class UploadImageDto {
  @IsString() filename: string;
}

class ConfirmUploadDto {
  @IsString() imageKey: string;
}

@Controller('tasks/:taskId/image')
@UseGuards(TeamGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @ManagerOnly()
  async getUploadUrl(
    @Param('taskId') taskId: string,
    @Body() dto: UploadImageDto,
    @CurrentUser() user: CognitoUser,
  ) {
    const task = await this.tasksService.findOne(taskId, user);
    if (task.imageKey) {
      return this.filesService.replaceImage(taskId, dto.filename, task.imageKey);
    }
    return this.filesService.getPresignedUploadUrl(taskId, dto.filename);
  }

  @Post('confirm')
  @ManagerOnly()
  async confirmUpload(
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    await this.filesService.confirmUpload(taskId, dto.imageKey);
    return { success: true };
  }

  @Delete()
  @ManagerOnly()
  async deleteImage(@Param('taskId') taskId: string) {
    await this.filesService.deleteTaskImages(taskId);
    return { success: true };
  }
}
