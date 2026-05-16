import { forwardRef, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
