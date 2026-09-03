import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { transporter } from '../config/mail';
import { AppDataSource } from '../config/database';
import { OrgSettings } from '../entities/OrgSettings.entity';
import { getUploadPath } from '../utils/uploadPath';

/**
 * Resolve the templates directory.
 * In dev  (ts-node):  src/services/../templates  →  src/templates
 * In prod (compiled):  dist/services/../templates →  dist/templates  (copied by build)
 */
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

export class EmailService {
  isConfigured(): boolean {
    return Boolean(transporter && this.getSender());
  }

  private getSender(): string | undefined {
    return env.SMTP_FROM || env.SMTP_USER;
  }

  private async sendMail(options: Record<string, unknown>): Promise<void> {
    const sender = this.getSender();
    if (!transporter || !sender) {
      throw new Error('SMTP is not configured in the backend environment');
    }
    try {
      await transporter.sendMail({
        ...options,
        from: `"${env.SMTP_FROM_NAME}" <${sender}>`,
      });
    } catch (error: any) {
      const code = error?.code || error?.responseCode || 'SMTP_ERROR';
      const detail = error?.response || error?.message || 'SMTP connection failed';
      throw new Error(`Email delivery failed (${code}: ${detail}). Verify the SMTP credentials and sender settings.`);
    }
  }

  private loadTemplate(
    templateName: string,
    variables: Record<string, string>,
  ): string {
    const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Email template not found: ${templatePath}`);
    }

    let html = fs.readFileSync(templatePath, 'utf-8');

    for (const [key, value] of Object.entries(variables)) {
      // Use split/join for safe literal replacement (no regex special-char issues)
      html = html.split(`{{${key}}}`).join(this.escapeHtml(value));
    }
    return html;
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async getBranding() {
    let companyName = 'Connect HR';
    let companyAddress = '';
    let companyLegalLine = '';
    let logoPath = path.join(TEMPLATES_DIR, 'logobg.png');

    try {
      const org = await AppDataSource.getRepository(OrgSettings).findOne({ where: {} });
      if (org) {
        companyName = org.companyName || companyName;
        companyAddress = org.companyAddress || '';
        companyLegalLine = [
          org.cinNumber ? `CIN: ${org.cinNumber}` : '',
          org.gstNumber ? `GSTIN: ${org.gstNumber}` : '',
          ...(org.payslipAdditionalFields || []).map((field) => `${field.label}: ${field.value}`),
        ].filter(Boolean).join('  |  ');

        if (org.companyLogoUrl?.startsWith('/uploads/company-logos/')) {
          const localLogo = getUploadPath('company-logos', path.basename(org.companyLogoUrl));
          if (fs.existsSync(localLogo)) logoPath = localLogo;
        } else if (org.companyLogoUrl && /^https?:\/\//i.test(org.companyLogoUrl)) {
          logoPath = org.companyLogoUrl;
        }
      }
    } catch (error: any) {
      console.error('Unable to load email branding; using defaults', error?.message || error);
    }

    return {
      variables: {
        companyName,
        companyAddress,
        companyLegalLine,
        companyWebsite: env.APP_URL,
      },
      attachment: {
        filename: `company-logo${path.extname(new URL(logoPath, 'https://local.invalid').pathname) || '.png'}`,
        path: logoPath,
        cid: 'company-logo',
      },
    };
  }

  async sendCredentials(
    email: string,
    empId: string,
    password: string,
    firstName: string,
    joiningDate = '',
    additionalMessage = '',
  ): Promise<void> {
    const branding = await this.getBranding();
    const subject = 'Welcome to Connect HR - Your account is ready';
    const html = this.loadTemplate('credentials', {
      ...branding.variables,
      firstName,
      empId,
      email,
      password,
      loginUrl: `${env.APP_URL}/login`,
      appUrl: env.APP_URL,
      personalDetailsUrl: `${env.APP_URL}/employee/personal-details`,
      joiningDate: joiningDate || 'your confirmed joining date',
      additionalMessage: additionalMessage.trim() || 'Please keep these credentials safely and sign in on or after your joining date.',
      year: new Date().getFullYear().toString(),
    });

    if (transporter && this.getSender()) {
      await this.sendMail({
        to: email,
        subject,
        html,
        attachments: [
          {
            ...branding.attachment,
          },
        ],
      });
      console.log('Credentials email sent', { email, empId });
    } else {
      console.log('SMTP not configured - credentials generated for new employee (password redacted):', {
        email,
        empId,
      });
    }
  }

  async sendGenericEmail(
    to: string,
    subject: string,
    templateName: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const branding = await this.getBranding();
    const html = this.loadTemplate(templateName, { ...branding.variables, ...variables });

    if (transporter && this.getSender()) {
      await this.sendMail({
        to,
        subject,
        html,
        attachments: [branding.attachment],
      });
      console.log(`Email sent: ${subject}`, { to });
    } else {
      console.log(`SMTP not configured - ${subject}:`, {
        to,
        templateName,
      });
    }
  }

  async sendOnboardingLink(
    email: string,
    firstName: string,
    empId: string,
  ): Promise<void> {
    const branding = await this.getBranding();
    const html = this.loadTemplate('onboardingReminder', {
      ...branding.variables,
      firstName,
      empId,
      onboardingUrl: `${env.APP_URL}/employee/personal-details#documents`,
      loginUrl: `${env.APP_URL}/login`,
      year: new Date().getFullYear().toString(),
    });

    await this.sendMail({
      to: email,
      subject: 'Action required - Complete your Connect HR onboarding',
      html,
      attachments: [branding.attachment],
    });
  }

  async sendBankingDetailsLink(
    email: string,
    firstName: string,
    empId: string,
  ): Promise<void> {
    const branding = await this.getBranding();
    const bankingUrl = `${env.APP_URL}/employee/banking-details`;
    const html = this.loadTemplate('bankingDetailsRequest', {
      ...branding.variables,
      firstName,
      empId,
      bankingUrl,
      loginUrl: `${env.APP_URL}/login?next=${encodeURIComponent('/employee/banking-details')}`,
      year: new Date().getFullYear().toString(),
    });

    await this.sendMail({
      to: email,
      subject: 'Action required - Add your salary banking details',
      html,
      attachments: [branding.attachment],
    });
  }
}
