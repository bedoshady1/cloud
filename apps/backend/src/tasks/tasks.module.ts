import { forwardRef, Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { MetricsModule } from '../metrics/metrics.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [MetricsModule, forwardRef(() => FilesModule)],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
