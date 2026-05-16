import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { ManagerOnly, TeamGuard } from '../auth/team.guard';

@Controller('users')
@UseGuards(TeamGuard)
@ManagerOnly()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get() findAll() { return this.usersService.findAll(); }
}
