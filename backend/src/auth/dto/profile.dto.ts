import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export const MIN_AGE = 13;

export function parseDob(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export function isValidDob(value: unknown, now = new Date()): boolean {
  if (typeof value !== 'string') return false;
  const d = parseDob(value);
  if (!d) return false;
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - MIN_AGE, now.getUTCMonth(), now.getUTCDate()),
  );
  return d.getTime() <= cutoff.getTime() && d.getUTCFullYear() >= 1900;
}

@ValidatorConstraint({ name: 'dateOfBirth' })
class DobConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isValidDob(value);
  }
  defaultMessage() {
    return `dateOfBirth must be a valid date (YYYY-MM-DD) and you must be at least ${MIN_AGE}`;
  }
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @ValidateIf((_, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name?: string;

  /** null clears. */
  @IsOptional()
  @Validate(DobConstraint)
  dateOfBirth?: string | null;

  /** null clears. */
  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number] | null;
}

export class EmailChangeRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class EmailChangeVerifyDto extends EmailChangeRequestDto {
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class ListSessionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
