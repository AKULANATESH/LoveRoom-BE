import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromAddress =
      process.env.EMAIL_FROM ?? 'LoveRoom <onboarding@resend.dev>';
    this.frontendUrl =
      process.env.FRONTEND_URL ?? 'http://localhost:5173';
  }

  async sendPartnerSetupEmail(params: {
    to: string;
    partnerName: string;
    resetToken: string;
  }): Promise<void> {
    const resetUrl = `${this.frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(params.resetToken)}`;

    const subject = `${params.partnerName} invited you to LoveRoom`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <h2>You're invited to LoveRoom</h2>
        <p><strong>${params.partnerName}</strong> created a shared account for both of you.</p>
        <p>Choose your username and set a new password to get started:</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#E91E63;color:#fff;text-decoration:none;border-radius:8px;">Set username &amp; password</a></p>
        <p style="font-size: 13px; color: #666;">Or open this link:<br/>${resetUrl}</p>
        <p style="font-size: 13px; color: #666;">This link expires in 72 hours.</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not set. Partner setup link for ${params.to}: ${resetUrl}`,
      );
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject,
      html,
    });

    if (error) {
      this.logger.error(`Failed to send partner setup email: ${error.message}`);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
