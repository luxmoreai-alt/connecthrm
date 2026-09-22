"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Flex,
  Text,
  SimpleGrid,
  Divider,
  Checkbox,
  useToast,
  IconButton,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Badge,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from "@chakra-ui/react";
import { BellRing, CheckCircle2, Edit2, Eye, GraduationCap, MapPin, Phone, Plus, Search, UserRound } from "lucide-react";
import { employeeApi, personalDetailsApi } from "@/api";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { Field, StyledInput, StyledSelect } from "@/components/ui/FormHelpers";
import EmployeeSelector from "@/components/ui/EmployeeSelector";
import type { EmployeeFromAPI, PersonalForm, PersonalDetailsRow } from "@/types";

const emptyForm: PersonalForm = {
  aadhaarNumber: "",
  panNumber: "",
  mobileNumber: "",
  whatsappNumber: "",
  bloodGroup: "",
  dateOfBirth: "",
  gender: "",
  maritalStatus: "",
  nationality: "",
  currentAddressLine1: "",
  currentCity: "",
  currentState: "",
  currentPincode: "",
  currentCountry: "",
  permanentSameAsCurrent: true,
  permanentAddressLine1: "",
  permanentCity: "",
  permanentState: "",
  permanentPincode: "",
  permanentCountry: "",
  emergencyContactNumber: "",
  emergencyContactPerson: "",
  emergencyContactRelationship: "",
  totalExperienceYears: "",
  lastCompany: "",
  lastDesignation: "",
  reasonForLeaving: "",
  previousCompanyCTC: "",
  highestQualification: "",
  institutionName: "",
  graduationYear: "",
};

/* ── View Modal ─────────────────────────────────────────────────── */
function ViewModal({
  isOpen,
  onClose,
  record,
}: {
  isOpen: boolean;
  onClose: () => void;
  record: PersonalDetailsRow | null;
}) {
  if (!record) return null;
  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <Flex justify="space-between" py={1.5} borderBottom="1px solid" borderColor="gray.50">
      <Text fontSize="sm" color="text.muted" fontWeight="500">{label}</Text>
      <Text fontSize="sm" color="text.body" fontWeight="500">{value || "—"}</Text>
    </Flex>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader borderBottom="1px solid" borderColor="surface.border">
          <Text fontWeight="700">Personal Details — {record.employeeName}</Text>
          <Text fontSize="xs" color="text.muted">{record.empId} · {record.email}</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody py={5}>
          <Text fontWeight="700" mb={2} color="text.heading">Identity</Text>
          <InfoRow label="Aadhaar" value={record.aadhaarNumber} />
          <InfoRow label="PAN Number" value={record.panNumber} />
          <InfoRow label="Mobile" value={record.mobileNumber} />
          <InfoRow label="WhatsApp" value={record.whatsappNumber} />

          <Divider my={4} />
          <Text fontWeight="700" mb={2} color="text.heading">Demographics</Text>
          <InfoRow label="Blood Group" value={record.bloodGroup} />
          <InfoRow label="Date of Birth" value={record.dateOfBirth} />
          <InfoRow label="Gender" value={record.gender} />
          <InfoRow label="Marital Status" value={record.maritalStatus} />
          <InfoRow label="Nationality" value={record.nationality} />

          <Divider my={4} />
          <Text fontWeight="700" mb={2} color="text.heading">Emergency Contact</Text>
          <InfoRow label="Contact Person" value={record.emergencyContactPerson} />
          <InfoRow label="Contact Number" value={record.emergencyContactNumber} />
          <InfoRow label="Relationship" value={record.emergencyContactRelationship} />

          <Divider my={4} />
          <Text fontWeight="700" mb={2} color="text.heading">Current Address</Text>
          <InfoRow label="Address" value={record.currentAddressLine1} />
          <InfoRow label="City" value={record.currentCity} />
          <InfoRow label="State" value={record.currentState} />
          <InfoRow label="Pincode" value={record.currentPincode} />
          <InfoRow label="Country" value={record.currentCountry} />

          {!record.permanentSameAsCurrent && (
            <>
              <Divider my={4} />
              <Text fontWeight="700" mb={2} color="text.heading">Permanent Address</Text>
              <InfoRow label="Address" value={record.permanentAddressLine1} />
              <InfoRow label="City" value={record.permanentCity} />
              <InfoRow label="State" value={record.permanentState} />
              <InfoRow label="Pincode" value={record.permanentPincode} />
              <InfoRow label="Country" value={record.permanentCountry} />
            </>
          )}

          <Divider my={4} />
          <Text fontWeight="700" mb={2} color="text.heading">Education</Text>
          <InfoRow label="Qualification" value={record.highestQualification} />
          <InfoRow label="Institution" value={record.institutionName} />
          <InfoRow label="Graduation Year" value={record.graduationYear} />

          {record.totalExperienceYears && (
            <>
              <Divider my={4} />
              <Text fontWeight="700" mb={2} color="text.heading">Experience</Text>
              <InfoRow label="Total Experience" value={`${record.totalExperienceYears} years`} />
              <InfoRow label="Previous Company" value={record.lastCompany} />
              <InfoRow label="Previous Designation" value={record.lastDesignation} />
              <InfoRow label="Previous Company CTC" value={record.previousCompanyCTC} />
              <InfoRow label="Reason for Leaving" value={record.reasonForLeaving} />
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/* ── Personal Details Form ──────────────────────────────────────── */
function PersonalForm_({
  onDone,
  onCancel,
  initialUserId,
}: {
  onDone: () => void;
  onCancel: () => void;
  initialUserId?: string;
}) {
  const [selectedUserId, setSelectedUserId] = useState(initialUserId || "");
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonalForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const toast = useToast();

  const isEditMode = !!existingRecordId;

  const resetForm = useCallback(() => {
    setForm({ ...emptyForm });
    setExistingRecordId(null);
  }, []);

  const populateForm = useCallback((record: PersonalDetailsRow) => {
    setExistingRecordId(record.id);
    setForm({
      aadhaarNumber: record.aadhaarNumber,
      panNumber: record.panNumber,
      mobileNumber: record.mobileNumber,
      whatsappNumber: record.whatsappNumber,
      bloodGroup: record.bloodGroup,
      dateOfBirth: record.dateOfBirth,
      gender: record.gender,
      maritalStatus: record.maritalStatus,
      nationality: record.nationality,
      currentAddressLine1: record.currentAddressLine1,
      currentCity: record.currentCity,
      currentState: record.currentState,
      currentPincode: record.currentPincode,
      currentCountry: record.currentCountry,
      permanentSameAsCurrent: record.permanentSameAsCurrent,
      permanentAddressLine1: record.permanentAddressLine1,
      permanentCity: record.permanentCity,
      permanentState: record.permanentState,
      permanentPincode: record.permanentPincode,
      permanentCountry: record.permanentCountry,
      emergencyContactNumber: record.emergencyContactNumber,
      emergencyContactPerson: record.emergencyContactPerson,
      emergencyContactRelationship: record.emergencyContactRelationship,
      totalExperienceYears: record.totalExperienceYears,
      lastCompany: record.lastCompany,
      lastDesignation: record.lastDesignation,
      reasonForLeaving: record.reasonForLeaving,
      previousCompanyCTC: record.previousCompanyCTC,
      highestQualification: record.highestQualification,
      institutionName: record.institutionName,
      graduationYear: record.graduationYear,
    });
  }, []);

  // Fetch existing data when employee changes
  useEffect(() => {
    if (!selectedUserId) {
      resetForm();
      return;
    }
    let cancelled = false;
    const fetchData = async () => {
      setFetching(true);
      resetForm();
      try {
        const data = await personalDetailsApi.getByUserId(selectedUserId);
        if (cancelled) return;
        if (data) {
          populateForm(data);
        }
      } catch {
        // No existing data or error — keep empty form
      } finally {
        if (!cancelled) setFetching(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [selectedUserId, resetForm, populateForm]);

  const handleSave = async () => {
    if (!selectedUserId) {
      toast({ title: "Please select an employee", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    try {
      setSaving(true);
      const saved = await personalDetailsApi.save(selectedUserId, form);
      const sync = saved.appointmentSync;
      const description = sync?.ok && !sync.skipped
        ? sync.locked
          ? "The appointment was already mailed, so HRMS did not change it."
          : `The appointment-letter draft was ${sync.created ? "created" : "updated"} in Offer Studio.`
        : sync?.error
          ? `Personal details were saved. Appointment draft: ${sync.error}`
          : "Personal details were saved successfully.";
      toast({
        title: `Personal details ${isEditMode ? "updated" : "saved"}`,
        description,
        status: sync && !sync.ok && !sync.skipped ? "warning" : "success",
        duration: 4500,
        isClosable: true,
      });
      onDone();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save", status: "error", duration: 4000, isClosable: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="700" color="text.heading">
          {isEditMode ? "Edit Personal Details" : "Add Personal Details"}
        </Text>
        <SecondaryButton size="sm" onClick={onCancel}>Back to List</SecondaryButton>
      </Flex>

      <SectionCard mb={4}>
        <EmployeeSelector value={selectedUserId} onChange={setSelectedUserId} />
        {fetching && (
          <Flex align="center" gap={2} mt={-3} mb={2}>
            <Spinner size="sm" color="brand.400" />
            <Text fontSize="sm" color="text.muted">Loading employee data...</Text>
          </Flex>
        )}
        {selectedUserId && !fetching && isEditMode && (
          <Badge colorScheme="green" fontSize="xs" mt={-3} mb={2}>Existing record found — editing</Badge>
        )}
        {selectedUserId && !fetching && !isEditMode && (
          <Badge colorScheme="blue" fontSize="xs" mt={-3} mb={2}>No existing record — creating new</Badge>
        )}
      </SectionCard>

      <SectionCard mb={4}>
        <Text fontWeight="800" color="text.heading" mb={3}>Identity Information</Text>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={5}>
          <Field label="Aadhaar Number">
            <StyledInput inputMode="numeric" placeholder="12-digit Aadhaar" value={form.aadhaarNumber} onChange={(e) => setForm((p) => ({ ...p, aadhaarNumber: e.target.value.replace(/\D/g, "").slice(0, 12) }))} />
          </Field>
          <Field label="PAN Number">
            <StyledInput placeholder="e.g., ABCDE1234F" maxLength={10} value={form.panNumber} onChange={(e) => setForm((p) => ({ ...p, panNumber: e.target.value.toUpperCase().slice(0, 10) }))} />
          </Field>
          <Field label="Mobile Number">
            <StyledInput inputMode="numeric" placeholder="Mobile number" value={form.mobileNumber} onChange={(e) => setForm((p) => ({ ...p, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
          </Field>
          <Field label="WhatsApp Number">
            <StyledInput inputMode="numeric" placeholder="WhatsApp number" value={form.whatsappNumber} onChange={(e) => setForm((p) => ({ ...p, whatsappNumber: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
          </Field>
        </SimpleGrid>
        <Checkbox
          isChecked={form.whatsappNumber !== "" && form.whatsappNumber === form.mobileNumber}
          onChange={(e) => {
            if (e.target.checked) {
              setForm((p) => ({ ...p, whatsappNumber: p.mobileNumber }));
            } else {
              setForm((p) => ({ ...p, whatsappNumber: "" }));
            }
          }}
          colorScheme="brand"
          mb={4}
        >
          <Text fontSize="sm">WhatsApp same as Mobile Number</Text>
        </Checkbox>

        <Divider my={5} />
        <Text fontWeight="800" color="text.heading" mb={3}>Demographics</Text>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4} mb={5}>
          <Field label="Blood Group">
            <StyledSelect placeholder="Select" value={form.bloodGroup} onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value }))}>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </StyledSelect>
          </Field>
          <Field label="Date of Birth">
            <StyledInput type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
          </Field>
          <Field label="Gender">
            <StyledSelect placeholder="Select gender" value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </StyledSelect>
          </Field>
          <Field label="Marital Status">
            <StyledSelect placeholder="Select" value={form.maritalStatus} onChange={(e) => setForm((p) => ({ ...p, maritalStatus: e.target.value }))}>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
            </StyledSelect>
          </Field>
          <Field label="Nationality">
            <StyledInput placeholder="Nationality" value={form.nationality} onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))} />
          </Field>
        </SimpleGrid>

        <Divider my={5} />
        <Text fontWeight="800" color="text.heading" mb={3}>Current Address</Text>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={5}>
          <Field label="Address">
            <StyledInput placeholder="Address" value={form.currentAddressLine1} onChange={(e) => setForm((p) => ({ ...p, currentAddressLine1: e.target.value }))} />
          </Field>
          <Field label="City">
            <StyledInput placeholder="City" value={form.currentCity} onChange={(e) => setForm((p) => ({ ...p, currentCity: e.target.value }))} />
          </Field>
          <Field label="State">
            <StyledInput placeholder="State" value={form.currentState} onChange={(e) => setForm((p) => ({ ...p, currentState: e.target.value }))} />
          </Field>
          <Field label="Pincode">
            <StyledInput inputMode="numeric" placeholder="Pincode" value={form.currentPincode} onChange={(e) => setForm((p) => ({ ...p, currentPincode: e.target.value.replace(/\D/g, "").slice(0, 10) }))} />
          </Field>
          <Field label="Country">
            <StyledInput placeholder="Country" value={form.currentCountry} onChange={(e) => setForm((p) => ({ ...p, currentCountry: e.target.value }))} />
          </Field>
        </SimpleGrid>

        <Checkbox
          isChecked={form.permanentSameAsCurrent}
          onChange={(e) => setForm((p) => ({ ...p, permanentSameAsCurrent: e.target.checked }))}
          colorScheme="brand"
          mb={4}
        >
          Permanent Address same as Current Address
        </Checkbox>

        {!form.permanentSameAsCurrent && (
          <>
            <Text fontSize="sm" color="text.muted" mb={3}>Permanent Address</Text>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={5}>
              <Field label="Address Line 1">
                <StyledInput value={form.permanentAddressLine1} onChange={(e) => setForm((p) => ({ ...p, permanentAddressLine1: e.target.value }))} />
              </Field>
              <Field label="City">
                <StyledInput value={form.permanentCity} onChange={(e) => setForm((p) => ({ ...p, permanentCity: e.target.value }))} />
              </Field>
              <Field label="State">
                <StyledInput value={form.permanentState} onChange={(e) => setForm((p) => ({ ...p, permanentState: e.target.value }))} />
              </Field>
              <Field label="Pincode">
                <StyledInput value={form.permanentPincode} onChange={(e) => setForm((p) => ({ ...p, permanentPincode: e.target.value }))} />
              </Field>
              <Field label="Country">
                <StyledInput value={form.permanentCountry} onChange={(e) => setForm((p) => ({ ...p, permanentCountry: e.target.value }))} />
              </Field>
            </SimpleGrid>
          </>
        )}

        <Divider my={5} />
        <Text fontWeight="800" color="text.heading" mb={3}>Emergency Contact</Text>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
          <Field label="Contact Person">
            <StyledInput placeholder="Contact person name" value={form.emergencyContactPerson} onChange={(e) => setForm((p) => ({ ...p, emergencyContactPerson: e.target.value }))} />
          </Field>
          <Field label="Contact Number">
            <StyledInput inputMode="numeric" placeholder="Contact number" value={form.emergencyContactNumber} onChange={(e) => setForm((p) => ({ ...p, emergencyContactNumber: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
          </Field>
          <Field label="Relationship">
            <StyledSelect placeholder="Select" value={form.emergencyContactRelationship} onChange={(e) => setForm((p) => ({ ...p, emergencyContactRelationship: e.target.value }))}>
              <option value="Father">Father</option>
              <option value="Mother">Mother</option>
              <option value="Spouse">Spouse</option>
              <option value="Brother">Brother</option>
              <option value="Sister">Sister</option>
              <option value="Friend">Friend</option>
              <option value="Other">Other</option>
            </StyledSelect>
          </Field>
        </SimpleGrid>
      </SectionCard>

      <SectionCard mb={4}>
        <Text fontWeight="800" color="text.heading" mb={3}>Education</Text>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={5}>
          <Field label="Highest Qualification">
            <StyledSelect placeholder="Select" value={form.highestQualification} onChange={(e) => setForm((p) => ({ ...p, highestQualification: e.target.value }))}>
              <option value="M.E">M.E</option>
              <option value="M.Tech">M.Tech</option>
              <option value="M.Sc">M.Sc</option>
              <option value="M.Com">M.Com</option>
              <option value="MBA">MBA</option>
              <option value="MCA">MCA</option>
              <option value="B.E">B.E</option>
              <option value="B.Tech">B.Tech</option>
              <option value="B.Sc">B.Sc</option>
              <option value="B.Com">B.Com</option>
              <option value="BBA">BBA</option>
              <option value="BCA">BCA</option>
              <option value="Diploma">Diploma</option>
              <option value="ITI">ITI</option>
              <option value="12th">12th</option>
              <option value="10th">10th</option>
              <option value="Other">Other</option>
            </StyledSelect>
          </Field>
          <Field label="Institution Name">
            <StyledInput placeholder="Institution" value={form.institutionName} onChange={(e) => setForm((p) => ({ ...p, institutionName: e.target.value }))} />
          </Field>
          <Field label="Graduation Year">
            <StyledInput placeholder="e.g., 2024" value={form.graduationYear} onChange={(e) => setForm((p) => ({ ...p, graduationYear: e.target.value }))} />
          </Field>
        </SimpleGrid>

        <Divider my={5} />
        <Text fontWeight="800" color="text.heading" mb={3}>Previous Employment</Text>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
          <Field label="Total Experience (Years)">
            <StyledInput value={form.totalExperienceYears} onChange={(e) => setForm((p) => ({ ...p, totalExperienceYears: e.target.value }))} />
          </Field>
          <Field label="Previous Company">
            <StyledInput value={form.lastCompany} onChange={(e) => setForm((p) => ({ ...p, lastCompany: e.target.value }))} />
          </Field>
          <Field label="Previous Designation">
            <StyledInput value={form.lastDesignation} onChange={(e) => setForm((p) => ({ ...p, lastDesignation: e.target.value }))} />
          </Field>
          <Field label="Previous Company CTC">
            <StyledInput placeholder="e.g., 5,00,000" value={form.previousCompanyCTC} onChange={(e) => setForm((p) => ({ ...p, previousCompanyCTC: e.target.value }))} />
          </Field>
          <Field label="Reason for Leaving">
            <StyledSelect placeholder="Select" value={form.reasonForLeaving} onChange={(e) => setForm((p) => ({ ...p, reasonForLeaving: e.target.value }))}>
              <option value="Personal">Personal</option>
              <option value="Career Growth">Career Growth</option>
              <option value="Better Opportunity">Better Opportunity</option>
              <option value="Higher Education">Higher Education</option>
              <option value="Relocation">Relocation</option>
              <option value="Health Issues">Health Issues</option>
              <option value="Company Closure">Company Closure</option>
              <option value="Contract Ended">Contract Ended</option>
              <option value="Other">Other</option>
            </StyledSelect>
          </Field>
        </SimpleGrid>
      </SectionCard>

      <SectionCard>
        <Flex justify="flex-end" gap={3}>
          <SecondaryButton size="sm" onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton size="sm" onClick={handleSave} isLoading={saving} isDisabled={!selectedUserId || fetching}>
            {isEditMode ? "Update Details" : "Save Details"}
          </PrimaryButton>
        </Flex>
      </SectionCard>
    </Box>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function PersonalDetailsPage() {
  const [records, setRecords] = useState<PersonalDetailsRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeFromAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "add" | "edit">("list");
  const [editRecord, setEditRecord] = useState<PersonalDetailsRow | null>(null);
  const [viewRecord, setViewRecord] = useState<PersonalDetailsRow | null>(null);
  const viewModal = useDisclosure();
  const toast = useToast();

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const [details, employeeList] = await Promise.all([personalDetailsApi.list(), employeeApi.list()]);
      setRecords(details.data);
      setEmployees(employeeList.data.filter((employee) => employee.employmentStatus !== "OFFBOARDED"));
    } catch {
      toast({ title: "Failed to load personal details", status: "error", duration: 3000, isClosable: true });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const requiredFields: Array<[keyof PersonalForm, string]> = [
    ["aadhaarNumber", "Aadhaar number"], ["panNumber", "PAN number"], ["mobileNumber", "Mobile number"], ["dateOfBirth", "Date of birth"],
    ["gender", "Gender"], ["bloodGroup", "Blood group"], ["maritalStatus", "Marital status"], ["nationality", "Nationality"],
    ["currentAddressLine1", "Current address"], ["currentCity", "City"], ["currentState", "State"], ["currentPincode", "Pincode"], ["currentCountry", "Country"],
    ["emergencyContactPerson", "Emergency contact person"], ["emergencyContactNumber", "Emergency contact number"], ["emergencyContactRelationship", "Emergency contact relationship"],
    ["highestQualification", "Highest qualification"], ["institutionName", "Institution"], ["graduationYear", "Graduation year"],
  ];
  const cards = employees.map((employee) => {
    const record = records.find((item) => item.userId === employee.user.id) || null;
    const missing = requiredFields.filter(([field]) => !String(record?.[field] ?? "").trim()).map(([, label]) => label);
    return { employee, record, missing };
  });
  const filtered = cards.filter(({ employee, record }) => {
    const q = search.toLowerCase();
    return `${employee.user.firstName} ${employee.user.lastName}`.toLowerCase().includes(q)
      || (employee.user.empId || "").toLowerCase().includes(q)
      || employee.user.email.toLowerCase().includes(q)
      || (record?.mobileNumber || "").toLowerCase().includes(q);
  });
  const incompleteCount = cards.filter((card) => card.missing.length > 0).length;

  const handleView = (row: PersonalDetailsRow) => {
    setViewRecord(row);
    viewModal.onOpen();
  };

  const handleEdit = (row: PersonalDetailsRow) => {
    setEditRecord(row);
    setView("edit");
  };

  const handleCardEdit = (userId: string, record: PersonalDetailsRow | null) => {
    setEditRecord(record || ({ userId } as PersonalDetailsRow));
    setView("edit");
  };

  const handleFormDone = () => {
    setView("list");
    setEditRecord(null);
    fetchRecords();
  };

  const handleReminder = async (employee: EmployeeFromAPI, missing: string[]) => {
    try {
      await employeeApi.sendOnboardingLink(employee.id);
      toast({ title: "Reminder sent", description: `${employee.user.firstName} will receive an email to complete ${missing.length} missing detail${missing.length === 1 ? "" : "s"}.`, status: "success", duration: 4000, isClosable: true });
    } catch (error: any) {
      toast({ title: "Could not send reminder", description: error?.message || "Please try again.", status: "error", duration: 4000, isClosable: true });
    }
  };

  const columns: Column<PersonalDetailsRow>[] = [
    {
      key: "empId",
      header: "Emp ID",
      width: "100px",
      render: (row) => (
        <Text fontWeight="600" fontSize="sm" color="brand.500">{row.empId}</Text>
      ),
    },
    {
      key: "employeeName",
      header: "Employee Name",
      render: (row) => (
        <Box>
          <Text fontWeight="600" fontSize="sm">{row.employeeName}</Text>
          <Text fontSize="xs" color="text.muted">{row.email}</Text>
        </Box>
      ),
    },
    {
      key: "mobileNumber",
      header: "Mobile",
      render: (row) => <Text fontSize="sm">{row.mobileNumber || "—"}</Text>,
    },
    {
      key: "gender",
      header: "Gender",
      render: (row) => <Text fontSize="sm">{row.gender || "—"}</Text>,
    },
    {
      key: "currentCity",
      header: "City",
      render: (row) => <Text fontSize="sm">{row.currentCity || "—"}</Text>,
    },
    {
      key: "highestQualification",
      header: "Qualification",
      render: (row) =>
        row.highestQualification ? (
          <Badge variant="subtle" colorScheme="brand" fontSize="xs">{row.highestQualification}</Badge>
        ) : (
          <Text fontSize="sm" color="text.muted">—</Text>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      render: (row) => (
        <HStack spacing={1}>
          <IconButton
            aria-label="View"
            icon={<Eye size={16} />}
            size="sm"
            variant="ghost"
            color="text.muted"
            _hover={{ color: "brand.400", bg: "brand.50" }}
            onClick={() => handleView(row)}
          />
          <IconButton
            aria-label="Edit"
            icon={<Edit2 size={16} />}
            size="sm"
            variant="ghost"
            color="text.muted"
            _hover={{ color: "blue.500", bg: "blue.50" }}
            onClick={() => handleEdit(row)}
          />
        </HStack>
      ),
    },
  ];

  if (view === "add") {
    return (
      <Box>
        <PageHeader title="Personal Details" subtitle="Add or edit personal details for an employee." />
        <PersonalForm_ onDone={handleFormDone} onCancel={() => setView("list")} />
      </Box>
    );
  }

  if (view === "edit" && editRecord) {
    return (
      <Box>
        <PageHeader title="Personal Details" subtitle="Update personal, address, education, and experience information." />
        <PersonalForm_ onDone={handleFormDone} onCancel={() => { setView("list"); setEditRecord(null); }} initialUserId={editRecord.userId} />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Personal Details"
        subtitle="Update personal, address, education, and experience information."
        actions={
          <PrimaryButton size="sm" leftIcon={<Plus size={16} />} onClick={() => setView("add")}>
            Add New
          </PrimaryButton>
        }
      />

      <SectionCard>
        <Flex
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={3}
          mb={4}
        >
          <InputGroup maxW={{ base: "100%", md: "320px" }}>
            <InputLeftElement pointerEvents="none">
              <Search size={16} color="gray" />
            </InputLeftElement>
            <Input
              placeholder="Search by name, ID, email, mobile..."
              size="md"
              borderRadius="lg"
              fontSize="sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <HStack spacing={3}>
            <Badge colorScheme={incompleteCount ? "orange" : "green"} borderRadius="full" px={2.5} py={1}>
              {incompleteCount} need{incompleteCount === 1 ? "s" : ""} attention
            </Badge>
            <Text fontSize="sm" color="text.muted">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</Text>
          </HStack>
        </Flex>

        {loading ? (
          <Flex minH="240px" align="center" justify="center"><Spinner size="lg" color="brand.500" /></Flex>
        ) : filtered.length === 0 ? (
          <Flex minH="180px" align="center" justify="center"><Text color="text.muted">No employees found.</Text></Flex>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
            {filtered.map(({ employee, record, missing }) => {
              const complete = missing.length === 0;
              const name = `${employee.user.firstName} ${employee.user.lastName}`;
              return (
                <Box key={employee.id} border="1px solid" borderColor={complete ? "green.100" : "orange.200"} borderRadius="xl" p={5} bg="white" boxShadow="sm">
                  <Flex justify="space-between" gap={3} align="flex-start" mb={4}>
                    <HStack spacing={3} minW={0}>
                      <Flex w="42px" h="42px" flexShrink={0} borderRadius="full" bg={complete ? "green.50" : "orange.50"} color={complete ? "green.600" : "orange.600"} align="center" justify="center">
                        <UserRound size={19} />
                      </Flex>
                      <Box minW={0}>
                        <Text fontWeight="800" color="text.heading" noOfLines={1}>{name}</Text>
                        <Text fontSize="xs" color="text.muted" noOfLines={1}>{employee.user.email}</Text>
                      </Box>
                    </HStack>
                    <Badge colorScheme={complete ? "green" : "orange"} borderRadius="full" flexShrink={0}>{complete ? "Complete" : `${missing.length} missing`}</Badge>
                  </Flex>
                  <Text fontSize="xs" fontWeight="700" color="brand.600" mb={3}>{employee.user.empId || "No employee ID"}</Text>
                  <SimpleGrid columns={2} spacing={2} fontSize="sm" color="text.body" mb={4}>
                    <HStack spacing={1.5}><Phone size={14} /><Text noOfLines={1}>{record?.mobileNumber || "Mobile not added"}</Text></HStack>
                    <HStack spacing={1.5}><MapPin size={14} /><Text noOfLines={1}>{record?.currentCity || "City not added"}</Text></HStack>
                    <HStack spacing={1.5}><GraduationCap size={14} /><Text noOfLines={1}>{record?.highestQualification || "Qualification not added"}</Text></HStack>
                    <HStack spacing={1.5}><UserRound size={14} /><Text noOfLines={1}>{record?.gender || "Gender not added"}</Text></HStack>
                  </SimpleGrid>
                  {!complete && <Box bg="orange.50" borderRadius="lg" p={3} mb={4}>
                    <Text fontSize="xs" fontWeight="700" color="orange.800" mb={1}>Still needed</Text>
                    <Text fontSize="xs" color="orange.800">{missing.slice(0, 4).join(", ")}{missing.length > 4 ? ` and ${missing.length - 4} more` : ""}</Text>
                  </Box>}
                  <Flex gap={2} wrap="wrap">
                    {record && <SecondaryButton size="sm" leftIcon={<Eye size={15} />} onClick={() => handleView(record)}>View</SecondaryButton>}
                    <SecondaryButton size="sm" leftIcon={<Edit2 size={15} />} onClick={() => handleCardEdit(employee.user.id, record)}>{record ? "Edit" : "Add details"}</SecondaryButton>
                    {!complete && <PrimaryButton size="sm" leftIcon={<BellRing size={15} />} onClick={() => handleReminder(employee, missing)}>Send reminder</PrimaryButton>}
                    {complete && <HStack color="green.600" fontSize="sm" fontWeight="700"><CheckCircle2 size={16} /><Text>Ready</Text></HStack>}
                  </Flex>
                </Box>
              );
            })}
          </SimpleGrid>
        )}
      </SectionCard>

      <ViewModal isOpen={viewModal.isOpen} onClose={viewModal.onClose} record={viewRecord} />
    </Box>
  );
}
