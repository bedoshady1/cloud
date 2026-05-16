import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { User } from '@mini-jira/shared';

@Injectable()
export class UsersService {
  private readonly table = process.env.DYNAMO_USERS_TABLE!;

  constructor(private readonly db: DynamodbService) {}

  async upsert(user: User): Promise<void> {
    await this.db.put(this.table, user as unknown as Record<string, unknown>);
  }

  async findOne(userId: string): Promise<User> {
    const item = await this.db.get(this.table, { userId });
    if (!item) throw new NotFoundException(`User ${userId} not found`);
    return item as User;
  }

  async findAll() {
    return this.db.scan({ TableName: this.table });
  }
}
