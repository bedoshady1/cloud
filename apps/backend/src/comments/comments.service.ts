import { Injectable } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment, CognitoUser } from '@mini-jira/shared';

@Injectable()
export class CommentsService {
  private readonly table = process.env.DYNAMO_COMMENTS_TABLE!;

  constructor(private readonly db: DynamodbService, private readonly tasks: TasksService) {}

  async create(taskId: string, dto: CreateCommentDto, caller: CognitoUser): Promise<Comment> {
    await this.tasks.findOne(taskId, caller);
    const comment: Comment = {
      taskId,
      commentId: crypto.randomUUID(),
      authorId: caller.userId,
      body: dto.body,
      createdAt: new Date().toISOString(),
    };
    await this.db.put(this.table, comment as unknown as Record<string, unknown>);
    return comment;
  }

  async findAll(taskId: string, caller: CognitoUser) {
    await this.tasks.findOne(taskId, caller);
    return this.db.query({
      TableName: this.table,
      KeyConditionExpression: 'taskId = :tid',
      ExpressionAttributeValues: { ':tid': taskId },
    });
  }
}
