import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateProjectDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsOptional() description?: string;
}
