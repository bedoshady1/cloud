import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { ManagerOnly, TeamGuard } from '../auth/team.guard';

@Controller('teams')
@UseGuards(TeamGuard)
@ManagerOnly()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post() create(@Body() dto: CreateTeamDto) { return this.teamsService.create(dto); }
  @Get() findAll() { return this.teamsService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.teamsService.findOne(id); }
}
