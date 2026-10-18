import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/transform.js';

export class CreateRoleDto {
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];

  /** Pre-fill from an existing role; the resulting set is still escalation-checked. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cloneFromId?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  name?: string;

  /** Empty string clears. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
}
