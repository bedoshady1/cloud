import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { Team } from '@mini-jira/shared';

@Injectable()
export class TeamsService {
  private readonly table = process.env.DYNAMO_TEAMS_TABLE!;

  constructor(private readonly db: DynamodbService) {}

  async create(dto: CreateTeamDto): Promise<Team> {
    const team: Team = { teamId: dto.teamId, name: dto.name, createdAt: new Date().toISOString() };
    await this.db.put(this.table, team);
    return team;
  }

  async findAll() {
    return this.db.scan({ TableName: this.table });
  }

  async findOne(teamId: string): Promise<Team> {
    const item = await this.db.get(this.table, { teamId });
    if (!item) throw new NotFoundException(`Team ${teamId} not found`);
    return item as Team;
  }
}
