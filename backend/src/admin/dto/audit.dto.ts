import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageDto } from './common.dto.js';

export class AuditQueryDto extends PageDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  actorId?: string;

  /** Exact (`user.suspend`) or prefix ending in a dot (`user.`). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetId?: string;

  /** Platform scope only: narrow to one organization, or `none` for platform-level events. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  orgId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class ListAdminSessionsDto extends PageDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  userId?: string;
}
