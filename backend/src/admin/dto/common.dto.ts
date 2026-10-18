import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { trim } from '../../common/transform.js';

export class PageDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Sensitive actions must say why; the text lands in the audit log. */
export class ReasonDto {
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class OptionalReasonDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason?: string;
}
