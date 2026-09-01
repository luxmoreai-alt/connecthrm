// ── Employee types ──

export interface EmployeeFromAPI {
  id: string;
  department: string;
  designation: string;
  employmentType: string;
  dateOfJoining: string;
  reportingManager: string;
  shiftSchedule: string;
  employmentStatus: "ACTIVE" | "OFFBOARDED";
  lastWorkingDate: string | null;
  offboardingReason: string | null;
  offboardingNotes: string | null;
  offboardedAt: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    empId: string | null;
    profilePhotoUrl: string | null;
    officeLocationRequired: boolean;
    officeLatitude: number | null;
    officeLongitude: number | null;
    officeRadiusMeters: number | null;
    lastLoginAt: string | null;
  };
}

export interface EmployeeRow {
  profileId: string;
  empId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: "Active" | "Inactive" | "Offboarded";
  joinDate: string;
  raw: EmployeeFromAPI;
}

export interface DropdownEmployee {
  userId: string;
  empId: string;
  firstName: string;
  lastName: string;
  employmentType: string;
}

export interface CreateEmployeePayload {
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

export interface CreateEmployeeResult {
  empId: string;
  generatedPassword: string;
  emailSent: boolean;
  emailError?: string;
  profile: {
    id: string;
    userId: string;
    department: string;
    designation: string;
  };
}

export interface PersonalForm {
  aadhaarNumber: string;
  panNumber: string;
  mobileNumber: string;
  whatsappNumber: string;
  bloodGroup: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  nationality: string;
  currentAddressLine1: string;
  currentCity: string;
  currentState: string;
  currentPincode: string;
  currentCountry: string;
  permanentSameAsCurrent: boolean;
  permanentAddressLine1: string;
  permanentCity: string;
  permanentState: string;
  permanentPincode: string;
  permanentCountry: string;
  emergencyContactNumber: string;
  emergencyContactPerson: string;
  emergencyContactRelationship: string;
  totalExperienceYears: string;
  lastCompany: string;
  lastDesignation: string;
  reasonForLeaving: string;
  previousCompanyCTC: string;
  highestQualification: string;
  institutionName: string;
  graduationYear: string;
}

export interface PersonalDetailsRow extends PersonalForm {
  id: string;
  userId: string;
  employeeName: string;
  empId: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryComponentForm {
  name: string;
  amount: string;
}

export interface SalaryComponentRow {
  name: string;
  amount: number;
}

export interface SalaryForm {
  ctc: string;
  earnings: SalaryComponentForm[];
  deductions: SalaryComponentForm[];
  pfApplicable: boolean;
  pfEmployeeContribution: string;
  pfEmployerContribution: string;
  taxRegime: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  bankMobileNumber: string;
  branchName: string;
  uanNumber: string;
}

export interface SalaryDetailsRow {
  id: string;
  userId: string;
  ctc: number;
  basic: number;
  hra: number;
  allowances: number;
  earnings: SalaryComponentRow[];
  deductions: SalaryComponentRow[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  pfApplicable: boolean;
  pfEmployeeContribution: number;
  pfEmployerContribution: number;
  taxRegime: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  bankMobileNumber: string;
  branchName: string;
  panNumber: string;
  uanNumber: string;
  employeeName: string;
  empId: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeBankingDetails {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  mobileNumber: string;
  branchName: string;
  panNumber: string;
  uanNumber: string;
  submitted: boolean;
}

export interface ExistingDoc {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  documentType: string | null;
  uploadedAt: string;
}

export interface DocumentRow {
  id: string;
  userId: string;
  documentType: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  filePath: string;
  employeeName: string;
  empId: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddEmployeeFormState {
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
  officeLatitude: string;
  officeLongitude: string;
  officeRadiusMeters: string;
}
