import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { CognitoUser } from '@mini-jira/shared';

@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  create(@Param('taskId') taskId: string, @Body() dto: CreateCommentDto, @CurrentUser() user: CognitoUser) {
    return this.commentsService.create(taskId, dto, user);
  }

  @Get()
  findAll(@Param('taskId') taskId: string, @CurrentUser() user: CognitoUser) {
    return this.commentsService.findAll(taskId, user);
  }
}
