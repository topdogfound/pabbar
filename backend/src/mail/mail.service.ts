import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    this.from =
      config.get<string>('SMTP_FROM') ??
      (user ? `Pabbar <${user}>` : 'Pabbar <no-reply@localhost>');
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(config.get<string>('SMTP_PORT') ?? 4716),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
    });
  }

  async sendOtp(to: string, code: string, ttlMinutes: number) {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Your sign-in code: ${code}`,
      text: `Your sign-in code is ${code}. It expires in ${ttlMinutes} minutes. If you didn't request it, ignore this email.`,
      html: `<p>Your sign-in code is</p><p style="font-size:28px;letter-spacing:6px;font-weight:600">${code}</p><p>It expires in ${ttlMinutes} minutes. If you didn't request it, you can ignore this email.</p>`,
    });
    this.logger.log(`OTP email sent to ${to.replace(/(.{2}).*(@.*)/, '$1***$2')}`);
  }

  async sendInvitation(opts: {
    to: string;
    orgName: string;
    inviterName: string | null;
    roleName: string;
    link: string;
    expiresAt: Date;
  }) {
    const { to, orgName, inviterName, roleName, link, expiresAt } = opts;
    const who = inviterName ? `${esc(inviterName)} invited you` : 'You have been invited';
    const until = expiresAt.toUTCString();
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `You're invited to ${orgName} on Pabbar`,
      text: `${inviterName ?? 'Someone'} invited you to join ${orgName} as ${roleName}.\n\nAccept: ${link}\n\nSign in with this email address (${to}). The invitation expires ${until}.`,
      html: `<p>${who} to join <strong>${esc(orgName)}</strong> as <strong>${esc(roleName)}</strong>.</p><p><a href="${esc(link)}">Accept the invitation</a></p><p>Sign in with this email address (${esc(to)}). The invitation expires ${esc(until)}.</p>`,
    });
    this.logger.log(`Invitation email sent to ${to.replace(/(.{2}).*(@.*)/, '$1***$2')}`);
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
