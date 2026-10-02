import { Injectable } from '@nestjs/common';
import { MailService } from '../../mail/mail.service.js';

export type OtpChannelName = 'EMAIL' | 'SMS';

/**
 * Delivery strategy for one OTP channel. To add mobile OTP later, implement
 * this for SMS (Twilio/MSG91), add it to OTP_SENDERS in AuthModule and enable
 * the `phoneOtp` flag in auth config. No schema or endpoint changes needed.
 */
export interface OtpSender {
  readonly channel: OtpChannelName;
  normalize(destination: string): string;
  send(destination: string, code: string, ttlMinutes: number): Promise<void>;
}

export const OTP_SENDERS = Symbol('OTP_SENDERS');

@Injectable()
export class EmailOtpSender implements OtpSender {
  readonly channel = 'EMAIL' as const;

  constructor(private readonly mail: MailService) {}

  normalize(destination: string) {
    return destination.trim().toLowerCase();
  }

  send(destination: string, code: string, ttlMinutes: number) {
    return this.mail.sendOtp(destination, code, ttlMinutes);
  }
}
