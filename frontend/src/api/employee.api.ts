import { api } from "@/lib/api";
import type {
  EmployeeFromAPI,
  DropdownEmployee,
  CreateEmployeePayload,
  CreateEmployeeResult,
  PersonalForm,
  PersonalDetailsRow,
  SalaryDetailsRow,
  DocumentRow,
  EmployeeSalaryStructureRow,
  SalaryComputation,
  SaveEmployeeSalaryStructureInput,
  EmployeeBankingDetails,
} from "@/types";

export const employeeApi = {
  list: () =>
    api.get<{ data: EmployeeFromAPI[]; total: number }>("/employees"),

  getByUserId: (userId: string) =>
    api.get<any>(`/employees/user/${userId}`),

  getById: (id: string) =>
    api.get<EmployeeFromAPI>(`/employees/${id}`),

  create: (payload: CreateEmployeePayload) =>
    api.post<CreateEmployeeResult>("/employees", payload),

  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/employees/${id}`, payload),

  offboard: (id: string, payload: {
    lastWorkingDate: string;
    reason: "RESIGNED" | "TERMINATED" | "CONTRACT_ENDED" | "ABSCONDED" | "OTHER";
    notes?: string;
  }) => api.post<EmployeeFromAPI>(`/employees/${id}/offboard`, payload),

  remove: (id: string) =>
    api.delete<{ id: string; emailReleased: boolean }>(`/employees/${id}`),

  sendOnboardingLink: (id: string) =>
    api.post<{ email: string; sent: boolean }>(`/employees/${id}/send-onboarding-link`),

  sendBankingDetailsLink: (id: string) =>
    api.post<{ email: string; sent: boolean }>(`/employees/${id}/send-banking-details-link`),

  uploadPhoto: (id: string, photo: File) => {
    const formData = new FormData();
    formData.append("photo", photo);
    return api.postFormData<{ profilePhotoUrl: string }>(`/employees/${id}/photo`, formData);
  },

  dropdown: () =>
    api.get<DropdownEmployee[]>("/employees/dropdown"),

  savePersonal: (userId: string, data: PersonalForm) =>
    api.put(`/employees/${userId}/personal`, data),

  saveSalary: (userId: string, data: Record<string, unknown>) =>
    api.put(`/employees/${userId}/salary`, data),

  uploadDocuments: (userId: string, formData: FormData) =>
    api.postFormData(`/employees/${userId}/documents`, formData),
};

export const personalDetailsApi = {
  getMe: () =>
    api.get<PersonalDetailsRow | null>("/personal-details/me"),

  saveMe: (data: PersonalForm) =>
    api.put<PersonalDetailsRow>("/personal-details/me", data),

  list: () =>
    api.get<{ data: PersonalDetailsRow[]; total: number }>("/personal-details"),

  getById: (id: string) =>
    api.get<PersonalDetailsRow>(`/personal-details/${id}`),

  getByUserId: (userId: string) =>
    api.get<PersonalDetailsRow | null>(`/personal-details/user/${userId}`),

  save: (userId: string, data: PersonalForm) =>
    api.put<PersonalDetailsRow>(`/personal-details/user/${userId}`, data),

  update: (id: string, data: PersonalForm) =>
    api.patch<PersonalDetailsRow>(`/personal-details/${id}`, data),
};

export const salaryDetailsApi = {
  list: () =>
    api.get<{ data: SalaryDetailsRow[]; total: number }>("/salary-details"),

  getById: (id: string) =>
    api.get<SalaryDetailsRow>(`/salary-details/${id}`),

  getByUserId: (userId: string) =>
    api.get<SalaryDetailsRow | null>(`/salary-details/user/${userId}`),

  save: (userId: string, data: Record<string, unknown>) =>
    api.put<SalaryDetailsRow>(`/salary-details/user/${userId}`, data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<SalaryDetailsRow>(`/salary-details/${id}`, data),
};

export const salaryStructureApi = {
  getMyBankingDetails: () =>
    api.get<EmployeeBankingDetails>("/salary-structures/me/banking"),

  saveMyBankingDetails: (data: Omit<EmployeeBankingDetails, "submitted">) =>
    api.put<EmployeeBankingDetails>("/salary-structures/me/banking", data),

  list: () =>
    api.get<{ data: EmployeeSalaryStructureRow[]; total: number }>("/salary-structures"),

  getByUserId: (userId: string) =>
    api.get<EmployeeSalaryStructureRow | null>(`/salary-structures/user/${userId}`),

  preview: (payload: SaveEmployeeSalaryStructureInput) =>
    api.post<SalaryComputation>("/salary-structures/preview", payload),

  save: (userId: string, payload: SaveEmployeeSalaryStructureInput) =>
    api.put<EmployeeSalaryStructureRow>(`/salary-structures/user/${userId}`, payload),
};

export const documentsApi = {
  list: () =>
    api.get<{ data: DocumentRow[]; total: number }>("/documents"),

  getByUserId: (userId: string) =>
    api.get<{ data: DocumentRow[]; total: number }>(`/documents/user/${userId}`),

  listMine: () =>
    api.get<{ data: DocumentRow[]; total: number }>("/documents/me"),

  uploadMine: (formData: FormData) =>
    api.postFormData<DocumentRow[]>("/documents/me", formData),

  removeMine: (id: string) =>
    api.delete(`/documents/me/${id}`),

  downloadMine: (id: string, fileName: string) =>
    api.downloadBlob(`/documents/me/${id}/download`, fileName),

  upload: (userId: string, formData: FormData) =>
    api.postFormData<DocumentRow[]>(`/documents/user/${userId}`, formData),

  remove: (id: string) =>
    api.delete(`/documents/${id}`),

  download: (id: string, fileName: string) =>
    api.downloadBlob(`/documents/${id}/download`, fileName),
};
