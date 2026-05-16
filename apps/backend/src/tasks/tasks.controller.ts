import { Controller, Get } from '@nestjs/common';

@Controller('tasks')
export class TasksController {
  @Get()
  findAll() {
    // Placeholder — full implementation in Plan 2
    return [];
  }
}
