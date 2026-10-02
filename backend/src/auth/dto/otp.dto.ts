import { IsBoolean, IsEmail, IsIn, IsOptional, Matches } from 'class-validator';

/** Only 'email' is enabled today. Add 'phone' here when SMS OTP ships. */
export const OTP_CHANNELS = ['email'] as const;
export type OtpChannelInput = (typeof OTP_CHANNELS)[number];

export class RequestOtpDto {
  @IsIn(OTP_CHANNELS)
  channel: OtpChannelInput;

  @IsEmail()
  destination: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
