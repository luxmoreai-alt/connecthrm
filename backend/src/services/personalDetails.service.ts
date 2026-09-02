import { PersonalDetailsRepository } from '../repositories/personalDetails.repository';
import { EmployeeRepository } from '../repositories/employee.repository';
import { ApiError } from '../utils/apiError';
import { OfferStudioService } from './offerStudio.service';

interface PersonalDetailsInput {
  aadhaarNumber?: string;
  panNumber?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  nationality?: string;
  currentAddressLine1?: string;
  currentCity?: string;
  currentState?: string;
  currentPincode?: string;
  currentCountry?: string;
  permanentSameAsCurrent?: boolean;
  permanentAddressLine1?: string;
  permanentCity?: string;
  permanentState?: string;
  permanentPincode?: string;
  permanentCountry?: string;
  emergencyContactNumber?: string;
  emergencyContactPerson?: string;
  emergencyContactRelationship?: string;
  highestQualification?: string;
  institutionName?: string;
  graduationYear?: string;
  totalExperienceYears?: string;
  lastCompany?: string;
  lastDesignation?: string;
  reasonForLeaving?: string;
  previousCompanyCTC?: string;
}

export class PersonalDetailsService {
  private personalRepo: PersonalDetailsRepository;
  private employeeRepo: EmployeeRepository;
  private offerStudioService: OfferStudioService;

  constructor() {
    this.personalRepo = new PersonalDetailsRepository();
    this.employeeRepo = new EmployeeRepository();
    this.offerStudioService = new OfferStudioService();
  }

  async listAll() {
    const records = await this.personalRepo.findAll();
    return {
      data: records.map((r) => this.formatRecord(r)),
      total: records.length,
    };
  }

  async getById(id: string) {
    const record = await this.personalRepo.findById(id);
    if (!record) {
      throw ApiError.notFound('Personal details not found', 'PERSONAL_NOT_FOUND');
    }
    return this.formatRecord(record);
  }

  async getByUserId(userId: string) {
    const record = await this.personalRepo.findByUserId(userId);
    if (!record) return null;
    return this.formatRecord(record);
  }

  async savePersonal(userId: string, input: PersonalDetailsInput) {
    // Verify employee exists
    const profile = await this.employeeRepo.findByUserId(userId);
    if (!profile) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    const record = await this.personalRepo.upsertByUserId(userId, {
      aadhaarNumber: input.aadhaarNumber || null,
      panNumber: input.panNumber || null,
      mobileNumber: input.mobileNumber || null,
      whatsappNumber: input.whatsappNumber || null,
      bloodGroup: input.bloodGroup || null,
      dateOfBirth: input.dateOfBirth || null,
      gender: input.gender || null,
      maritalStatus: input.maritalStatus || null,
      nationality: input.nationality || null,
      currentAddressLine1: input.currentAddressLine1 || null,
      currentCity: input.currentCity || null,
      currentState: input.currentState || null,
      currentPincode: input.currentPincode || null,
      currentCountry: input.currentCountry || null,
      permanentSameAsCurrent: input.permanentSameAsCurrent ?? true,
      permanentAddressLine1: input.permanentAddressLine1 || null,
      permanentCity: input.permanentCity || null,
      permanentState: input.permanentState || null,
      permanentPincode: input.permanentPincode || null,
      permanentCountry: input.permanentCountry || null,
      emergencyContactNumber: input.emergencyContactNumber || null,
      emergencyContactPerson: input.emergencyContactPerson || null,
      emergencyContactRelationship: input.emergencyContactRelationship || null,
      highestQualification: input.highestQualification || null,
      institutionName: input.institutionName || null,
      graduationYear: input.graduationYear || null,
      totalExperienceYears: input.totalExperienceYears || null,
      lastCompany: input.lastCompany || null,
      lastDesignation: input.lastDesignation || null,
      reasonForLeaving: input.reasonForLeaving || null,
      previousCompanyCTC: input.previousCompanyCTC || null,
    });

    const appointmentSync = await this.offerStudioService.syncAppointmentDraft(profile, record);
    if (!appointmentSync.ok && !appointmentSync.skipped) {
      console.error('Appointment draft sync failed:', appointmentSync.error);
    }
    return { ...this.formatRecord(record), appointmentSync };
  }

  async updateById(id: string, input: PersonalDetailsInput) {
    const existing = await this.personalRepo.findById(id);
    if (!existing) {
      throw ApiError.notFound('Personal details not found', 'PERSONAL_NOT_FOUND');
    }

    await this.personalRepo.update(id, {
      aadhaarNumber: input.aadhaarNumber || null,
      panNumber: input.panNumber || null,
      mobileNumber: input.mobileNumber || null,
      whatsappNumber: input.whatsappNumber || null,
      bloodGroup: input.bloodGroup || null,
      dateOfBirth: input.dateOfBirth || null,
      gender: input.gender || null,
      maritalStatus: input.maritalStatus || null,
      nationality: input.nationality || null,
      currentAddressLine1: input.currentAddressLine1 || null,
      currentCity: input.currentCity || null,
      currentState: input.currentState || null,
      currentPincode: input.currentPincode || null,
      currentCountry: input.currentCountry || null,
      permanentSameAsCurrent: input.permanentSameAsCurrent ?? true,
      permanentAddressLine1: input.permanentAddressLine1 || null,
      permanentCity: input.permanentCity || null,
      permanentState: input.permanentState || null,
      permanentPincode: input.permanentPincode || null,
      permanentCountry: input.permanentCountry || null,
      emergencyContactNumber: input.emergencyContactNumber || null,
      emergencyContactPerson: input.emergencyContactPerson || null,
      emergencyContactRelationship: input.emergencyContactRelationship || null,
      highestQualification: input.highestQualification || null,
      institutionName: input.institutionName || null,
      graduationYear: input.graduationYear || null,
      totalExperienceYears: input.totalExperienceYears || null,
      lastCompany: input.lastCompany || null,
      lastDesignation: input.lastDesignation || null,
      reasonForLeaving: input.reasonForLeaving || null,
      previousCompanyCTC: input.previousCompanyCTC || null,
    });

    const record = await this.personalRepo.findById(id);
    if (!record) {
      throw ApiError.notFound('Personal details not found after update', 'PERSONAL_NOT_FOUND');
    }
    const profile = await this.employeeRepo.findByUserId(record.userId);
    const appointmentSync = profile
      ? await this.offerStudioService.syncAppointmentDraft(profile, record)
      : { ok: false, skipped: true, error: 'Employee profile was not found.' };
    if (!appointmentSync.ok && !appointmentSync.skipped) {
      console.error('Appointment draft sync failed:', appointmentSync.error);
    }
    return { ...this.formatRecord(record), appointmentSync };
  }

  private formatRecord(r: any) {
    return {
      id: r.id,
      userId: r.userId,
      aadhaarNumber: r.aadhaarNumber || '',
      panNumber: r.panNumber || '',
      mobileNumber: r.mobileNumber || '',
      whatsappNumber: r.whatsappNumber || '',
      bloodGroup: r.bloodGroup || '',
      dateOfBirth: r.dateOfBirth || '',
      gender: r.gender || '',
      maritalStatus: r.maritalStatus || '',
      nationality: r.nationality || '',
      currentAddressLine1: r.currentAddressLine1 || '',
      currentCity: r.currentCity || '',
      currentState: r.currentState || '',
      currentPincode: r.currentPincode || '',
      currentCountry: r.currentCountry || '',
      permanentSameAsCurrent: r.permanentSameAsCurrent ?? true,
      permanentAddressLine1: r.permanentAddressLine1 || '',
      permanentCity: r.permanentCity || '',
      permanentState: r.permanentState || '',
      permanentPincode: r.permanentPincode || '',
      permanentCountry: r.permanentCountry || '',
      emergencyContactNumber: r.emergencyContactNumber || '',
      emergencyContactPerson: r.emergencyContactPerson || '',
      emergencyContactRelationship: r.emergencyContactRelationship || '',
      highestQualification: r.highestQualification || '',
      institutionName: r.institutionName || '',
      graduationYear: r.graduationYear || '',
      totalExperienceYears: r.totalExperienceYears || '',
      lastCompany: r.lastCompany || '',
      lastDesignation: r.lastDesignation || '',
      reasonForLeaving: r.reasonForLeaving || '',
      previousCompanyCTC: r.previousCompanyCTC || '',
      employeeName: r.user ? `${r.user.firstName} ${r.user.lastName}` : '',
      empId: r.user?.empId || '',
      email: r.user?.email || '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
