import crypto from 'crypto';
import { UserRepository } from '../repositories/user.repository';
import { EmployeeRepository } from '../repositories/employee.repository';
import { TokenService } from './token.service';
import { EmailService } from './email.service';
import { hashPassword } from '../utils/password';
import { ApiError } from '../utils/apiError';
import { UserRole } from '../entities/User.entity';
import fs from 'fs';
import path from 'path';
import { getUploadPath } from '../utils/uploadPath';
import { del, put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { NotificationService } from './notification.service';

interface CreateEmployeeInput {
  empId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  designation: string;
  employmentType: string;
  dateOfJoining: string;
  reportingManager: string;
  shiftSchedule: string;
  allowLoginOnlyInsideOffice: boolean;
  officeLatitude?: number;
  officeLongitude?: number;
  officeRadiusMeters?: number;
}

interface UpdateEmployeeInput {
  empId?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  designation?: string;
  employmentType?: string;
  dateOfJoining?: string;
  reportingManager?: string;
  shiftSchedule?: string;
  isActive?: boolean;
  officeLocationRequired?: boolean;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  officeRadiusMeters?: number | null;
}

interface OffboardEmployeeInput {
  lastWorkingDate: string;
  reason: 'RESIGNED' | 'TERMINATED' | 'CONTRACT_ENDED' | 'ABSCONDED' | 'OTHER';
  notes?: string;
}

export class EmployeeService {
  private userRepo: UserRepository;
  private employeeRepo: EmployeeRepository;
  private tokenService: TokenService;
  private emailService: EmailService;
  private notificationService: NotificationService;

  constructor() {
    this.userRepo = new UserRepository();
    this.employeeRepo = new EmployeeRepository();
    this.tokenService = new TokenService();
    this.emailService = new EmailService();
    this.notificationService = new NotificationService();
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return `Emp@${result}`;
  }

  private async saveIntegratedProfilePhoto(userId: string, previousPhoto: string | null | undefined, photoData: string): Promise<string> {
    const match = photoData.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      throw ApiError.badRequest('The Offer Studio profile photo is invalid', 'EMPLOYEE_PHOTO_INVALID');
    }
    const mimeType = `image/${match[1]}`;
    const extension = match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`;
    const contents = Buffer.from(match[2], 'base64');
    if (!contents.length || contents.length > 2 * 1024 * 1024) {
      throw ApiError.badRequest('The Offer Studio profile photo must be smaller than 2 MB', 'EMPLOYEE_PHOTO_TOO_LARGE');
    }

    let profilePhotoUrl: string;
    if (process.env.VERCEL) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw ApiError.internal(
          'HRMS profile photo storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel',
          'BLOB_STORAGE_NOT_CONFIGURED',
        );
      }
      const blob = await put(
        `profile-photos/${userId}/${randomUUID()}${extension}`,
        contents,
        { access: 'public', contentType: mimeType, addRandomSuffix: false },
      );
      profilePhotoUrl = blob.url;
    } else {
      const photoDirectory = getUploadPath('profile-photos');
      fs.mkdirSync(photoDirectory, { recursive: true });
      const fileName = `${randomUUID()}${extension}`;
      fs.writeFileSync(path.join(photoDirectory, fileName), contents);
      profilePhotoUrl = `/uploads/profile-photos/${fileName}`;
    }

    await this.userRepo.update(userId, { profilePhotoUrl });
    if (previousPhoto?.includes('.blob.vercel-storage.com/') && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(previousPhoto).catch(() => undefined);
    } else if (previousPhoto?.startsWith('/uploads/profile-photos/')) {
      fs.unlink(getUploadPath('profile-photos', path.basename(previousPhoto)), () => undefined);
    }
    return profilePhotoUrl;
  }

  async createEmployee(input: CreateEmployeeInput, photoData?: string, additionalMessage = '') {
    const empId = input.empId.trim().toUpperCase();
    const [existingEmail, existingEmpId] = await Promise.all([
      this.userRepo.findByEmail(input.email),
      this.userRepo.findByEmpId(empId),
    ]);
    if (existingEmail) {
      throw ApiError.conflict(
        'An employee with this email already exists',
        'EMPLOYEE_DUPLICATE_EMAIL',
      );
    }
    if (existingEmpId) {
      throw ApiError.conflict(
        `Employee ID ${empId} is already in use`,
        'EMPLOYEE_DUPLICATE_ID',
      );
    }

    if (input.allowLoginOnlyInsideOffice) {
      if (
        input.officeLatitude == null ||
        input.officeLongitude == null ||
        input.officeRadiusMeters == null
      ) {
        throw ApiError.badRequest(
          'Office coordinates and radius are required when location-based login is enabled',
          'EMPLOYEE_LOCATION_REQUIRED',
        );
      }
    }

    const generatedPassword = this.generatePassword();
    const hashedPassword = await hashPassword(generatedPassword);

    const user = await this.userRepo.create({
      email: input.email,
      password: hashedPassword,
      firstName: input.firstName,
      lastName: input.lastName,
      empId,
      role: UserRole.EMPLOYEE,
      isActive: true,
      employeeTourCompleted: false,
      officeLocationRequired: input.allowLoginOnlyInsideOffice,
      officeLatitude: input.allowLoginOnlyInsideOffice ? input.officeLatitude! : null,
      officeLongitude: input.allowLoginOnlyInsideOffice ? input.officeLongitude! : null,
      officeRadiusMeters: input.allowLoginOnlyInsideOffice ? input.officeRadiusMeters! : null,
    });

    const profile = await this.employeeRepo.create({
      userId: user.id,
      department: input.department,
      designation: input.designation,
      employmentType: input.employmentType,
      dateOfJoining: input.dateOfJoining,
      reportingManager: input.reportingManager,
      shiftSchedule: input.shiftSchedule,
    });

    if (photoData) await this.saveIntegratedProfilePhoto(user.id, user.profilePhotoUrl, photoData);

    // Await delivery because Vercel may pause background work after responding.
    let emailSent = false;
    let emailError: string | undefined;
    try {
      await this.emailService.sendCredentials(
        input.email,
        empId,
        generatedPassword,
        input.firstName,
        input.dateOfJoining,
        additionalMessage,
      );
      emailSent = true;
    } catch (error) {
      emailError = (error as Error).message;
      console.error('Failed to send credentials email', emailError);
    }

    return {
      empId,
      generatedPassword,
      emailSent,
      emailError,
      profile: {
        id: profile.id,
        department: profile.department,
        designation: profile.designation,
        userId: user.id,
      },
    };
  }

  async listEmployees() {
    const profiles = await this.employeeRepo.findAll();
    const data = profiles.filter((p) => !p.user.deletedAt).map((p) => ({
      id: p.id,
      department: p.department,
      designation: p.designation,
      employmentType: p.employmentType,
      dateOfJoining: p.dateOfJoining,
      reportingManager: p.reportingManager,
      shiftSchedule: p.shiftSchedule,
      employmentStatus: p.employmentStatus || 'ACTIVE',
      lastWorkingDate: p.lastWorkingDate,
      offboardingReason: p.offboardingReason,
      offboardingNotes: p.offboardingNotes,
      offboardedAt: p.offboardedAt,
      user: {
        id: p.user.id,
        email: p.user.email,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        isActive: p.user.isActive,
        empId: p.user.empId,
        profilePhotoUrl: p.user.profilePhotoUrl,
        officeLocationRequired: p.user.officeLocationRequired,
        officeLatitude: p.user.officeLatitude,
        officeLongitude: p.user.officeLongitude,
        officeRadiusMeters: p.user.officeRadiusMeters,
        lastLoginAt: p.user.lastLoginAt,
      },
    }));
    return { data, total: data.length };
  }

  async dropdownEmployees() {
    const profiles = await this.employeeRepo.findAll();
    return profiles
      .filter((p) => p.user?.isActive && !p.user.deletedAt)
      .map((p) => ({
        userId: p.user.id,
        empId: p.user.empId,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        employmentType: p.employmentType,
      }));
  }

  async getEmployee(id: string) {
    const profile = await this.employeeRepo.findById(id);
    if (!profile || profile.user.deletedAt) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }
    return {
      id: profile.id,
      department: profile.department,
      designation: profile.designation,
      employmentType: profile.employmentType,
      dateOfJoining: profile.dateOfJoining,
      reportingManager: profile.reportingManager,
      shiftSchedule: profile.shiftSchedule,
      employmentStatus: profile.employmentStatus || 'ACTIVE',
      lastWorkingDate: profile.lastWorkingDate,
      offboardingReason: profile.offboardingReason,
      offboardingNotes: profile.offboardingNotes,
      offboardedAt: profile.offboardedAt,
      user: {
        id: profile.user.id,
        email: profile.user.email,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        isActive: profile.user.isActive,
        empId: profile.user.empId,
        profilePhotoUrl: profile.user.profilePhotoUrl,
        officeLocationRequired: profile.user.officeLocationRequired,
        officeLatitude: profile.user.officeLatitude,
        officeLongitude: profile.user.officeLongitude,
        officeRadiusMeters: profile.user.officeRadiusMeters,
        lastLoginAt: profile.user.lastLoginAt,
      },
    };
  }

  async updateEmployee(id: string, input: UpdateEmployeeInput) {
    const profile = await this.employeeRepo.findById(id);
    if (!profile || profile.user.deletedAt) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }
    if (profile.employmentStatus === 'OFFBOARDED' && input.isActive === true) {
      throw ApiError.badRequest(
        'Offboarded employees cannot be reactivated from login access',
        'EMPLOYEE_OFFBOARDED',
      );
    }

    // Build user updates
    const userUpdates: Record<string, unknown> = {};
    if (input.empId !== undefined) {
      const empId = input.empId.trim().toUpperCase();
      if (empId !== profile.user.empId) {
        const existingEmpId = await this.userRepo.findByEmpId(empId);
        if (existingEmpId && existingEmpId.id !== profile.userId) {
          throw ApiError.conflict(
            `Employee ID ${empId} is already in use`,
            'EMPLOYEE_DUPLICATE_ID',
          );
        }
        userUpdates.empId = empId;
      }
    }
    if (input.firstName !== undefined) userUpdates.firstName = input.firstName;
    if (input.lastName !== undefined) userUpdates.lastName = input.lastName;
    if (input.isActive !== undefined) userUpdates.isActive = input.isActive;

    if (input.officeLocationRequired !== undefined) {
      userUpdates.officeLocationRequired = input.officeLocationRequired;
      if (input.officeLocationRequired) {
        if (
          input.officeLatitude == null ||
          input.officeLongitude == null ||
          input.officeRadiusMeters == null
        ) {
          throw ApiError.badRequest(
            'Office coordinates and radius are required when location-based login is enabled',
            'EMPLOYEE_LOCATION_REQUIRED',
          );
        }
        userUpdates.officeLatitude = input.officeLatitude;
        userUpdates.officeLongitude = input.officeLongitude;
        userUpdates.officeRadiusMeters = input.officeRadiusMeters;
      } else {
        userUpdates.officeLatitude = null;
        userUpdates.officeLongitude = null;
        userUpdates.officeRadiusMeters = null;
      }
    }

    if (Object.keys(userUpdates).length > 0) {
      await this.userRepo.update(profile.userId, userUpdates);
    }

    // Revoke tokens when deactivating so employee is logged out immediately
    if (input.isActive === false) {
      await this.tokenService.revokeAllUserTokens(profile.userId);
    }

    // Build profile updates
    const profileUpdates: Record<string, unknown> = {};
    if (input.department !== undefined) profileUpdates.department = input.department;
    if (input.designation !== undefined) profileUpdates.designation = input.designation;
    if (input.employmentType !== undefined) profileUpdates.employmentType = input.employmentType;
    if (input.dateOfJoining !== undefined) profileUpdates.dateOfJoining = input.dateOfJoining;
    if (input.reportingManager !== undefined)
      profileUpdates.reportingManager = input.reportingManager;
    if (input.shiftSchedule !== undefined) profileUpdates.shiftSchedule = input.shiftSchedule;

    if (Object.keys(profileUpdates).length > 0) {
      await this.employeeRepo.update(id, profileUpdates);
    }

    const updated = await this.getEmployee(id);
    await this.notificationService.notifyUser(
      profile.userId,
      'EMPLOYEE_DETAILS_UPDATED',
      'Employment details updated',
      'HR updated your employee profile or login settings.',
      '/employee/profile',
    ).catch((err) => console.error('Failed to create employee update notification', err.message));
    return updated;
  }

  async provisionOfferAccess(input: CreateEmployeeInput, photoData?: string, additionalMessage = '') {
    if (!this.emailService.isConfigured()) {
      throw ApiError.internal(
        'HRMS email is not configured. Add the SMTP environment variables before sending employee access',
        'EMPLOYEE_EMAIL_NOT_CONFIGURED',
      );
    }
    const email = input.email.trim().toLowerCase();
    const empId = input.empId.trim().toUpperCase();
    const [existingEmail, existingEmpId] = await Promise.all([
      this.userRepo.findByEmail(email),
      this.userRepo.findByEmpId(empId),
    ]);

    if (!existingEmail && !existingEmpId) {
      const created = await this.createEmployee({ ...input, email, empId }, photoData, additionalMessage);
      if (!created.emailSent) {
        throw ApiError.internal(
          `The HRMS account was created, but its credentials email failed: ${created.emailError || 'SMTP delivery failed'}`,
          'EMPLOYEE_CREDENTIALS_EMAIL_FAILED',
        );
      }
      return {
        created: true,
        empId: created.empId,
        email,
        emailSent: true,
        profileId: created.profile.id,
        photoSynced: Boolean(photoData),
      };
    }

    if (!existingEmail || !existingEmpId || existingEmail.id !== existingEmpId.id) {
      throw ApiError.conflict(
        'The employee email or employee ID is already assigned to another HRMS account',
        'EMPLOYEE_INTEGRATION_CONFLICT',
      );
    }
    if (existingEmail.deletedAt) {
      throw ApiError.conflict('The matching HRMS employee is archived', 'EMPLOYEE_ARCHIVED');
    }

    const profile = await this.employeeRepo.findByUserId(existingEmail.id);
    if (!profile) {
      throw ApiError.conflict('The matching HRMS account has no employee profile', 'EMPLOYEE_PROFILE_MISSING');
    }
    if (profile.employmentStatus === 'OFFBOARDED') {
      throw ApiError.conflict('The matching HRMS employee is offboarded', 'EMPLOYEE_OFFBOARDED');
    }

    if (photoData) await this.saveIntegratedProfilePhoto(existingEmail.id, existingEmail.profilePhotoUrl, photoData);

    await this.employeeRepo.update(profile.id, {
      department: input.department,
      designation: input.designation,
      employmentType: input.employmentType,
      dateOfJoining: input.dateOfJoining,
      reportingManager: input.reportingManager,
      shiftSchedule: input.shiftSchedule,
    });

    const generatedPassword = this.generatePassword();
    await this.userRepo.update(existingEmail.id, {
      password: await hashPassword(generatedPassword),
      isActive: true,
    });
    await this.tokenService.revokeAllUserTokens(existingEmail.id);
    await this.emailService.sendCredentials(email, empId, generatedPassword, input.firstName, input.dateOfJoining, additionalMessage);

    return {
      created: false,
      empId,
      email,
      emailSent: true,
      profileId: profile.id,
      photoSynced: Boolean(photoData),
    };
  }

  async syncOfferProfilePhoto(empIdValue: string, emailValue: string, photoData: string) {
    if (!photoData) {
      throw ApiError.badRequest('Offer Studio did not provide an employee photo', 'EMPLOYEE_PHOTO_REQUIRED');
    }
    const empId = empIdValue.trim().toUpperCase();
    const email = emailValue.trim().toLowerCase();
    const [employeeById, employeeByEmail] = await Promise.all([
      this.userRepo.findByEmpId(empId),
      this.userRepo.findByEmail(email),
    ]);
    if (!employeeById || !employeeByEmail || employeeById.id !== employeeByEmail.id || employeeById.deletedAt) {
      throw ApiError.conflict('A matching active HRMS employee was not found', 'EMPLOYEE_INTEGRATION_CONFLICT');
    }
    const profile = await this.employeeRepo.findByUserId(employeeById.id);
    if (!profile || profile.employmentStatus === 'OFFBOARDED') {
      throw ApiError.conflict('A matching active HRMS employee profile was not found', 'EMPLOYEE_PROFILE_MISSING');
    }
    await this.saveIntegratedProfilePhoto(employeeById.id, employeeById.profilePhotoUrl, photoData);
    return { created: false, empId, email, emailSent: false, profileId: profile.id, photoSynced: true };
  }

  async offboardEmployee(id: string, input: OffboardEmployeeInput) {
    const profile = await this.employeeRepo.findById(id);
    if (!profile || profile.user.deletedAt) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }
    if (profile.employmentStatus === 'OFFBOARDED') {
      throw ApiError.conflict('Employee is already offboarded', 'EMPLOYEE_ALREADY_OFFBOARDED');
    }

    const today = new Date().toISOString().slice(0, 10);
    if (input.lastWorkingDate > today) {
      throw ApiError.badRequest('Last working date cannot be in the future', 'INVALID_LAST_WORKING_DATE');
    }

    await this.employeeRepo.update(id, {
      employmentStatus: 'OFFBOARDED',
      lastWorkingDate: input.lastWorkingDate,
      offboardingReason: input.reason,
      offboardingNotes: input.notes?.trim() || null,
      offboardedAt: new Date(),
    });
    await this.userRepo.update(profile.userId, { isActive: false });
    await this.tokenService.revokeAllUserTokens(profile.userId);

    await this.notificationService.notifyUser(
      profile.userId,
      'EMPLOYEE_OFFBOARDED',
      'Employment status updated',
      `Your employment record was marked as offboarded effective ${input.lastWorkingDate}.`,
      '/employee/profile',
    ).catch((err) => console.error('Failed to create offboarding notification', err.message));

    return this.getEmployee(id);
  }

  async deleteEmployee(id: string) {
    const profile = await this.employeeRepo.findById(id);
    if (!profile || profile.user.deletedAt) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    const previousPhoto = profile.user.profilePhotoUrl;
    await this.tokenService.revokeAllUserTokens(profile.userId);
    await this.userRepo.archiveEmployee(profile.userId);

    if (previousPhoto?.includes('.blob.vercel-storage.com/') && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(previousPhoto).catch(() => undefined);
    } else if (previousPhoto?.startsWith('/uploads/profile-photos/')) {
      const previousPath = getUploadPath('profile-photos', path.basename(previousPhoto));
      fs.unlink(previousPath, () => undefined);
    }

    return { id, emailReleased: true };
  }

  async sendOnboardingLink(id: string) {
    const profile = await this.employeeRepo.findById(id) ?? await this.employeeRepo.findByUserId(id);
    if (!profile || profile.user.deletedAt) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    await this.emailService.sendOnboardingLink(
      profile.user.email,
      profile.user.firstName,
      profile.user.empId || '',
    );
    return { email: profile.user.email, sent: true };
  }

  async sendBankingDetailsLink(id: string) {
    const profile = await this.employeeRepo.findById(id) ?? await this.employeeRepo.findByUserId(id);
    if (!profile || profile.user.deletedAt) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    await this.emailService.sendBankingDetailsLink(
      profile.user.email,
      profile.user.firstName,
      profile.user.empId || '',
    );
    return { email: profile.user.email, sent: true };
  }

  async updateProfilePhoto(id: string, file: Express.Multer.File) {
    const profile = await this.employeeRepo.findById(id);
    if (!profile || profile.user.deletedAt) {
      if (file.path) fs.unlink(file.path, () => undefined);
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    const previousPhoto = profile.user.profilePhotoUrl;
    let profilePhotoUrl: string;

    if (process.env.VERCEL) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw ApiError.internal(
          'Profile photo storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.',
          'BLOB_STORAGE_NOT_CONFIGURED',
        );
      }
      const extension = path.extname(file.originalname).toLowerCase();
      const blob = await put(
        `profile-photos/${profile.userId}/${randomUUID()}${extension}`,
        file.buffer,
        {
          access: 'public',
          contentType: file.mimetype,
          addRandomSuffix: false,
        },
      );
      profilePhotoUrl = blob.url;
    } else {
      profilePhotoUrl = `/uploads/profile-photos/${file.filename}`;
    }

    await this.userRepo.update(profile.userId, { profilePhotoUrl });
    await this.notificationService.notifyUser(
      profile.userId,
      'PROFILE_PHOTO_UPDATED',
      'Profile photo updated',
      'HR updated your employee profile photo.',
      '/employee/profile',
    ).catch((err) => console.error('Failed to create photo notification', err.message));

    if (previousPhoto?.includes('.blob.vercel-storage.com/') && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(previousPhoto).catch(() => undefined);
    } else if (previousPhoto?.startsWith('/uploads/profile-photos/')) {
      const previousPath = getUploadPath('profile-photos', path.basename(previousPhoto));
      fs.unlink(previousPath, () => undefined);
    }

    return { profilePhotoUrl };
  }
}
