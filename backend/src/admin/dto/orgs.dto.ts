import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim, trimLower } from '../../common/transform.js';
import { SLUG_RE } from '../../rbac/access.js';
import { PageDto } from './common.dto.js';

export class ListOrgsDto extends PageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  q?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

export class CreateOrgDto {
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name: string;

  @Transform(trimLower)
  @Matches(SLUG_RE, { message: 'slug must be 3-40 characters: lowercase letters, digits and hyphens' })
  slug: string;

  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  ownerEmail: string;
}

export class UpdateOrgDto {
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name: string;
}

export class SetOrgStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';

  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class UpdateSecurityDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  allowedEmailDomains?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  inviteTtlDays?: number;
}

export class CreateInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => trimLower({ value: v })) : value))
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  emails: string[];

  @IsString()
  @MaxLength(40)
  roleId: string;
}
