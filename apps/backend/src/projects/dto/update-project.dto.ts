import { IsString, IsOptional } from 'class-validator';

export class UpdateProjectDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
}
