import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ManagerOnly, TeamGuard } from '../auth/team.guard';
import { CognitoUser } from '@mini-jira/shared';

@Controller('projects')
@UseGuards(TeamGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ManagerOnly()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: CognitoUser) {
    return this.projectsService.create(dto, user.userId);
  }

  @Get()
  findAll(@Query('limit') limit?: string, @Query('lastKey') lastKey?: string) {
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
    let parsedLastKey: Record<string, unknown> | undefined;
    if (lastKey) {
      try {
        parsedLastKey = JSON.parse(lastKey);
      } catch {
        throw new BadRequestException('Invalid lastKey format');
      }
    }
    return this.projectsService.findAll(parsedLimit, parsedLastKey);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @ManagerOnly()
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @ManagerOnly()
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
