"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Flex,
  Text,
  SimpleGrid,
  useToast,
  IconButton,
  HStack,
  VStack,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Image as ChakraImage,
  Alert,
  AlertIcon,
  AlertDescription,
  Textarea,
  Badge,
} from "@chakra-ui/react";
import { Plus, Edit2, Trash2, CalendarDays, Clock, MapPin, CalendarOff, Shield, Upload, X, FileDown } from "lucide-react";
import { payrollApi, settingsApi } from "@/api";
import { leaveApi, type LeaveSlabData } from "@/api/leave.api";
import type { Holiday } from "@/api";
import type { WorkdayOverride } from "@/api/settings.api";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { Field, StyledInput, StyledSelect } from "@/components/ui/FormHelpers";
import SalaryConfigurationSection from "@/components/settings/SalaryConfigurationSection";
import BrandMark from "@/components/ui/BrandMark";
import { getAssetUrl } from "@/lib/api";

const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

type LeavePolicyFormState = {
  probationPeriodMonths: string;
  probationLeaveAllowed: boolean;
  allowHalfDayLeave: boolean;
  allowPermissionHours: boolean;
  maxPermissionHoursPerMonth: string;
  maxPermissionRequestsPerMonth: string;
  maxRegularizationsPerMonth: string;
};

type LeaveSlabFormState = {
  minYearsOfService: string;
  maxYearsOfService: string;
  casualLeavePerYear: string;
  sickLeavePerYear: string;
  earnedLeavePerYear: string;
};

const toInputNumber = (value: number | null | undefined): string =>
  value == null ? "" : String(value);

const parseNumericField = (
  raw: string,
  label: string,
  opts: { integer?: boolean; min?: number; nullable?: boolean } = {}
): number | null => {
  const value = raw.trim();
  if (value === "") {
    if (opts.nullable) return null;
    throw new Error(`${label} is required`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number`);
  }
  if (opts.integer && !Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number`);
  }
  if (opts.min != null && parsed < opts.min) {
    throw new Error(`${label} must be at least ${opts.min}`);
  }
  return parsed;
};

export default function SettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [companyForm, setCompanyForm] = useState({
    companyName: "Connect HR",
    companyAddress: "",
    companyLogoUrl: null as string | null,
    cinNumber: "",
    gstNumber: "",
    payslipAdditionalFields: [] as Array<{ label: string; value: string }>,
  });
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Settings state ──

  // ── Timings form ──
  const [timingsForm, setTimingsForm] = useState({
    workStartTime: "09:00",
    workEndTime: "18:00",
    lateGraceMinutes: 15,
    halfDayMinMinutes: 240,
    fullDayMinMinutes: 540,
  });

  // ── Weekly off form ──
  const [weekOffForm, setWeekOffForm] = useState({
    weekOffDays: "SUNDAY",
    alternateSaturdayOffRule: "NONE" as "NONE" | "SECOND_FOURTH" | "FIRST_THIRD",
  });
  const [workdayOverrides, setWorkdayOverrides] = useState<WorkdayOverride[]>([]);
  const [workdayForm, setWorkdayForm] = useState({
    date: "",
    type: "WORKING_DAY" as WorkdayOverride["type"],
    reason: "",
  });

  // ── Location form ──
  const [locationForm, setLocationForm] = useState({
    officeLatitude: "",
    officeLongitude: "",
    officeRadiusMeters: "",
    geoFenceRequired: true,
    allowRemoteAttendance: false,
  });

  // ── Holidays ──
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayForm, setHolidayForm] = useState({ date: "", name: "" });
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // ── Leave Policy ──
  const [policyForm, setPolicyForm] = useState<LeavePolicyFormState>({
    probationPeriodMonths: "6",
    probationLeaveAllowed: false,
    allowHalfDayLeave: true,
    allowPermissionHours: true,
    maxPermissionHoursPerMonth: "2",
    maxPermissionRequestsPerMonth: "4",
    maxRegularizationsPerMonth: "4",
  });
  const [slabs, setSlabs] = useState<LeaveSlabFormState[]>([
    {
      minYearsOfService: "0",
      maxYearsOfService: "2",
      casualLeavePerYear: "6",
      sickLeavePerYear: "6",
      earnedLeavePerYear: "0",
    },
  ]);

  // ── Load data ──
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [s, h, lp, overrides] = await Promise.all([
        settingsApi.get(),
        settingsApi.listHolidays(),
        leaveApi.getPolicy().catch(() => null),
        settingsApi.listWorkdayOverrides(),
      ]);
      setTimingsForm({
        workStartTime: s.workStartTime?.slice(0, 5) || "09:00",
        workEndTime: s.workEndTime?.slice(0, 5) || "18:00",
        lateGraceMinutes: s.lateGraceMinutes,
        halfDayMinMinutes: s.halfDayMinMinutes,
        fullDayMinMinutes: s.fullDayMinMinutes,
      });
      setCompanyForm({
        companyName: s.companyName || "Connect HR",
        companyAddress: s.companyAddress || "",
        companyLogoUrl: s.companyLogoUrl || null,
        cinNumber: s.cinNumber || "",
        gstNumber: s.gstNumber || "",
        payslipAdditionalFields: s.payslipAdditionalFields || [],
      });
      setWeekOffForm({
        weekOffDays: s.weekOffDays || "SUNDAY",
        alternateSaturdayOffRule: s.alternateSaturdayOffRule || "NONE",
      });
      setLocationForm({
        officeLatitude: s.officeLatitude != null ? String(s.officeLatitude) : "",
        officeLongitude: s.officeLongitude != null ? String(s.officeLongitude) : "",
        officeRadiusMeters: s.officeRadiusMeters != null ? String(s.officeRadiusMeters) : "",
        geoFenceRequired: s.geoFenceRequired ?? true,
        allowRemoteAttendance: s.allowRemoteAttendance ?? false,
      });
      setHolidays(h.data);
      setWorkdayOverrides(overrides);
      if (lp) {
        const pol = lp.policy;
        if (pol) {
          setPolicyForm({
            probationPeriodMonths: toInputNumber(pol.probationPeriodMonths ?? 6),
            probationLeaveAllowed: pol.probationLeaveAllowed ?? false,
            allowHalfDayLeave: pol.allowHalfDayLeave ?? true,
            allowPermissionHours: pol.allowPermissionHours ?? true,
            maxPermissionHoursPerMonth: toInputNumber(pol.maxPermissionHoursPerMonth ?? 2),
            maxPermissionRequestsPerMonth: toInputNumber(pol.maxPermissionRequestsPerMonth ?? 4),
            maxRegularizationsPerMonth: toInputNumber(pol.maxRegularizationsPerMonth ?? 4),
          });
        }
        if (lp.slabs && lp.slabs.length > 0) {
          setSlabs(lp.slabs.map((sl: LeaveSlabData) => ({
            minYearsOfService: toInputNumber(sl.minYearsOfService),
            maxYearsOfService: toInputNumber(sl.maxYearsOfService),
            casualLeavePerYear: toInputNumber(sl.casualLeavePerYear),
            sickLeavePerYear: toInputNumber(sl.sickLeavePerYear),
            earnedLeavePerYear: toInputNumber(sl.earnedLeavePerYear),
          })));
        }
      }
    } catch {
      toast({ title: "Failed to load settings", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Save helpers ──
  const saveSection = async (section: string, data: Record<string, unknown>) => {
    try {
      setSaving(section);
      await settingsApi.update(data);
      toast({ title: "Settings updated", status: "success", duration: 2000, isClosable: true, position: "top-right" });
    } catch {
      toast({ title: "Failed to save settings", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setSaving(null);
    }
  };

  const handleSaveTimings = () =>
    saveSection("timings", timingsForm);

  const handleSaveWeekOff = () =>
    saveSection("weekoff", weekOffForm);

  const handleSaveWorkdayOverride = async () => {
    if (!workdayForm.date || workdayForm.reason.trim().length < 3) {
      toast({ title: "Date and reason are required", status: "warning", duration: 2500, isClosable: true, position: "top-right" });
      return;
    }
    try {
      setSaving("workday-override");
      await settingsApi.saveWorkdayOverride(workdayForm);
      setWorkdayOverrides(await settingsApi.listWorkdayOverrides());
      setWorkdayForm({ date: "", type: "WORKING_DAY", reason: "" });
      toast({ title: "Workday updated", description: "All active users were notified with the reason.", status: "success", duration: 3000, isClosable: true, position: "top-right" });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to save workday update", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteWorkdayOverride = async (id: string) => {
    try {
      await settingsApi.deleteWorkdayOverride(id);
      setWorkdayOverrides((rows) => rows.filter((row) => row.id !== id));
      toast({ title: "Workday update removed", status: "success", duration: 2000, isClosable: true, position: "top-right" });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to remove update", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    }
  };

  const handleSaveLocation = () => {
    const data: Record<string, unknown> = {
      officeLatitude: locationForm.officeLatitude ? parseFloat(locationForm.officeLatitude) : null,
      officeLongitude: locationForm.officeLongitude ? parseFloat(locationForm.officeLongitude) : null,
      officeRadiusMeters: locationForm.officeRadiusMeters ? parseInt(locationForm.officeRadiusMeters) : null,
      geoFenceRequired: locationForm.geoFenceRequired,
      allowRemoteAttendance: locationForm.allowRemoteAttendance,
    };
    saveSection("location", data);
  };

  const handleLogoChange = async (file?: File) => {
    if (!file) return;
    try {
      setSaving("logo");
      const updated = await settingsApi.uploadCompanyLogo(file);
      setCompanyForm((form) => ({ ...form, companyLogoUrl: updated.companyLogoUrl }));
      toast({ title: "Company logo updated", status: "success", duration: 2000, isClosable: true, position: "top-right" });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to upload logo", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setSaving(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    try {
      setSaving("logo");
      await settingsApi.deleteCompanyLogo();
      setCompanyForm((form) => ({ ...form, companyLogoUrl: null }));
      toast({ title: "Custom logo removed", status: "success", duration: 2000, isClosable: true, position: "top-right" });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to remove logo", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setSaving(null);
    }
  };

  const addPayslipField = () => setCompanyForm((form) => ({
    ...form,
    payslipAdditionalFields: [...form.payslipAdditionalFields, { label: "", value: "" }],
  }));

  const updatePayslipField = (index: number, key: "label" | "value", value: string) =>
    setCompanyForm((form) => ({
      ...form,
      payslipAdditionalFields: form.payslipAdditionalFields.map((field, i) =>
        i === index ? { ...field, [key]: value } : field
      ),
    }));

  const removePayslipField = (index: number) => setCompanyForm((form) => ({
    ...form,
    payslipAdditionalFields: form.payslipAdditionalFields.filter((_, i) => i !== index),
  }));

  const downloadSamplePayslip = async () => {
    if (!companyForm.companyName.trim()) return;
    try {
      setSaving("sample-payslip");
      await settingsApi.update({
        companyName: companyForm.companyName,
        companyAddress: companyForm.companyAddress || null,
        cinNumber: companyForm.cinNumber || null,
        gstNumber: companyForm.gstNumber || null,
        payslipAdditionalFields: companyForm.payslipAdditionalFields.filter((field) => field.label.trim() && field.value.trim()),
      });
      await payrollApi.downloadSamplePayslip();
      toast({ title: "Sample payslip generated", description: "The PDF uses your latest saved logo and branding.", status: "success", duration: 3000, isClosable: true, position: "top-right" });
    } catch (err: any) {
      toast({ title: "Could not generate sample payslip", description: err?.message, status: "error", duration: 4000, isClosable: true, position: "top-right" });
    } finally {
      setSaving(null);
    }
  };

  // ── Holiday CRUD ──
  const openAddHoliday = () => {
    setEditingHoliday(null);
    setHolidayForm({ date: "", name: "" });
    onOpen();
  };

  const openEditHoliday = (h: Holiday) => {
    setEditingHoliday(h);
    setHolidayForm({ date: h.date, name: h.name });
    onOpen();
  };

  const handleSaveHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name.trim()) {
      toast({ title: "Date and name are required", status: "warning", duration: 2000, isClosable: true, position: "top-right" });
      return;
    }
    try {
      setSaving("holiday");
      if (editingHoliday) {
        await settingsApi.updateHoliday(editingHoliday.id, holidayForm);
      } else {
        await settingsApi.createHoliday(holidayForm);
      }
      const h = await settingsApi.listHolidays();
      setHolidays(h.data);
      onClose();
      toast({ title: editingHoliday ? "Holiday updated" : "Holiday added", status: "success", duration: 2000, isClosable: true, position: "top-right" });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to save holiday", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await settingsApi.deleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      toast({ title: "Holiday deleted", status: "success", duration: 2000, isClosable: true, position: "top-right" });
    } catch {
      toast({ title: "Failed to delete holiday", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    }
  };

  // ── Week off day toggle ──
  const selectedDays = weekOffForm.weekOffDays ? weekOffForm.weekOffDays.split(",") : [];
  const toggleDay = (day: string) => {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    setWeekOffForm((f) => ({ ...f, weekOffDays: next.join(",") }));
  };

  // ── Leave Policy helpers ──
  const addSlab = () => {
    setSlabs((prev) => [
      ...prev,
      {
        minYearsOfService: "0",
        maxYearsOfService: "",
        casualLeavePerYear: "0",
        sickLeavePerYear: "0",
        earnedLeavePerYear: "0",
      },
    ]);
  };
  const removeSlab = (idx: number) => {
    setSlabs((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateSlab = (idx: number, field: keyof LeaveSlabFormState, value: string) => {
    setSlabs((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };
  const handleSaveLeavePolicy = async () => {
    try {
      setSaving("leavePolicy");
      const normalizedSlabs = slabs.map((slab, idx) => {
        const row = idx + 1;
        const minYears = parseNumericField(slab.minYearsOfService, `Slab ${row} Min Years`, {
          integer: true,
          min: 0,
        }) as number;
        const maxYears = parseNumericField(slab.maxYearsOfService, `Slab ${row} Max Years`, {
          integer: true,
          min: 0,
          nullable: true,
        });
        if (maxYears != null && maxYears < minYears) {
          throw new Error(`Slab ${row} Max Years cannot be less than Min Years`);
        }
        return {
          minYearsOfService: minYears,
          maxYearsOfService: maxYears,
          casualLeavePerYear: parseNumericField(slab.casualLeavePerYear, `Slab ${row} CL/Year`, {
            integer: true,
            min: 0,
          }) as number,
          sickLeavePerYear: parseNumericField(slab.sickLeavePerYear, `Slab ${row} SL/Year`, {
            integer: true,
            min: 0,
          }) as number,
          earnedLeavePerYear: parseNumericField(slab.earnedLeavePerYear, `Slab ${row} Emergency Leave/Year`, {
            integer: true,
            min: 0,
          }) as number,
        };
      });

      await leaveApi.updatePolicy({
        probationPeriodMonths: parseNumericField(policyForm.probationPeriodMonths, "Probation Period", {
          integer: true,
          min: 0,
        }) as number,
        probationLeaveAllowed: policyForm.probationLeaveAllowed,
        allowHalfDayLeave: policyForm.allowHalfDayLeave,
        allowPermissionHours: policyForm.allowPermissionHours,
        maxPermissionHoursPerMonth: parseNumericField(
          policyForm.maxPermissionHoursPerMonth,
          "Max Permission Hrs/Month",
          { min: 0 }
        ) as number,
        maxPermissionRequestsPerMonth: parseNumericField(
          policyForm.maxPermissionRequestsPerMonth,
          "Max Permission Requests/Month",
          { integer: true, min: 0 }
        ) as number,
        maxRegularizationsPerMonth: parseNumericField(
          policyForm.maxRegularizationsPerMonth,
          "Max Regularizations/Month",
          { integer: true, min: 0 }
        ) as number,
        slabs: normalizedSlabs,
      });
      toast({ title: "Leave policy updated", status: "success", duration: 2000, isClosable: true, position: "top-right" });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to save leave policy", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Box>
        <PageHeader title="Settings" subtitle="Manage organisation preferences" />
        <Flex justify="center" py={20}><Spinner size="lg" color="brand.400" /></Flex>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader title="Settings" subtitle="Manage organisation preferences" />

      <SectionCard title="Company & Payslip Branding" mb={4}>
        <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={5} alignItems="start">
          <Box p={4} bg="surface.bg" borderRadius="lg" minH="150px">
            <Text fontSize="xs" color="text.muted" mb={3}>Logo used on generated payslips</Text>
            {companyForm.companyLogoUrl ? (
              <ChakraImage
                src={getAssetUrl(companyForm.companyLogoUrl)}
                alt="Company logo"
                w="180px"
                h="72px"
                objectFit="contain"
                bg="white"
                border="1px solid"
                borderColor="surface.border"
                borderRadius="lg"
                p={1}
              />
            ) : <BrandMark logoSize="52px" />}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => handleLogoChange(e.target.files?.[0])}
            />
            <HStack mt={3} spacing={2}>
              <SecondaryButton
                size="xs"
                leftIcon={<Upload size={13} />}
                onClick={() => logoInputRef.current?.click()}
                isLoading={saving === "logo"}
              >
                {companyForm.companyLogoUrl ? "Change logo" : "Upload logo"}
              </SecondaryButton>
              {companyForm.companyLogoUrl && (
                <IconButton
                  aria-label="Remove custom logo"
                  icon={<X size={14} />}
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  onClick={handleRemoveLogo}
                  isDisabled={saving === "logo"}
                />
              )}
            </HStack>
            <Text fontSize="10px" color="text.muted" mt={2}>PNG, JPG or WEBP · maximum 2 MB</Text>
          </Box>
          <Flex direction="column" gap={4}>
            <Field label="Company Name" required>
              <StyledInput
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm((form) => ({ ...form, companyName: e.target.value }))}
                placeholder="Company name"
              />
            </Field>
            <Field label="Company Address">
              <StyledInput
                value={companyForm.companyAddress}
                onChange={(e) => setCompanyForm((form) => ({ ...form, companyAddress: e.target.value }))}
                placeholder="Address shown on payslips"
              />
            </Field>
          </Flex>
          <Flex direction="column" gap={4}>
            <Field label="CIN Number">
              <StyledInput
                value={companyForm.cinNumber}
                onChange={(e) => setCompanyForm((form) => ({ ...form, cinNumber: e.target.value.toUpperCase() }))}
                placeholder="e.g. U72900KA2020PTC123456"
                maxLength={21}
              />
            </Field>
            <Field label="GSTIN">
              <StyledInput
                value={companyForm.gstNumber}
                onChange={(e) => setCompanyForm((form) => ({ ...form, gstNumber: e.target.value.toUpperCase() }))}
                placeholder="e.g. 29ABCDE1234F1Z5"
                maxLength={15}
              />
            </Field>
          </Flex>
        </SimpleGrid>
        <Box mt={5} pt={4} borderTop="1px solid" borderColor="surface.border">
          <Flex justify="space-between" align="center" mb={3}>
            <Box>
              <Text fontSize="sm" fontWeight="700" color="text.heading">Additional Payslip Information</Text>
              <Text fontSize="xs" color="text.muted">Add optional items such as PAN, website, registration number, or contact details.</Text>
            </Box>
            <SecondaryButton size="xs" leftIcon={<Plus size={14} />} onClick={addPayslipField} isDisabled={companyForm.payslipAdditionalFields.length >= 10}>
              Add Information
            </SecondaryButton>
          </Flex>
          <Flex direction="column" gap={2}>
            {companyForm.payslipAdditionalFields.map((field, index) => (
              <SimpleGrid key={index} columns={{ base: 1, md: 2 }} spacing={2} position="relative" pr={{ md: 10 }}>
                <StyledInput value={field.label} onChange={(e) => updatePayslipField(index, "label", e.target.value)} placeholder="Label (e.g. Company PAN)" maxLength={60} />
                <StyledInput value={field.value} onChange={(e) => updatePayslipField(index, "value", e.target.value)} placeholder="Value shown on payslip" maxLength={250} />
                <IconButton aria-label="Remove information" icon={<Trash2 size={14} />} size="sm" variant="ghost" colorScheme="red" position={{ md: "absolute" }} right={0} top={0} onClick={() => removePayslipField(index)} />
              </SimpleGrid>
            ))}
          </Flex>
        </Box>
        <Flex justify="flex-end" mt={4} gap={3} flexWrap="wrap">
          <SecondaryButton
            leftIcon={<FileDown size={15} />}
            onClick={downloadSamplePayslip}
            isLoading={saving === "sample-payslip"}
            isDisabled={!companyForm.companyName.trim() || Boolean(saving && saving !== "sample-payslip")}
          >
            Generate Sample Payslip
          </SecondaryButton>
          <PrimaryButton
            onClick={() => saveSection("company", {
              companyName: companyForm.companyName,
              companyAddress: companyForm.companyAddress || null,
              cinNumber: companyForm.cinNumber || null,
              gstNumber: companyForm.gstNumber || null,
              payslipAdditionalFields: companyForm.payslipAdditionalFields.filter((field) => field.label.trim() && field.value.trim()),
            })}
            isLoading={saving === "company"}
            isDisabled={!companyForm.companyName.trim()}
          >
            Save Payslip Branding
          </PrimaryButton>
        </Flex>
      </SectionCard>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
        {/* ── Office Timings ── */}
        <SectionCard
          title="Office Timings"
          actions={
            <Flex align="center" gap={1.5} color="brand.400">
              <Clock size={15} />
              <Text fontSize="xs" fontWeight="600">Attendance Rules</Text>
            </Flex>
          }
        >
          <Flex direction="column" gap={4}>
            <Alert status="info" borderRadius="lg" alignItems="flex-start">
              <AlertIcon mt={0.5} />
              <AlertDescription fontSize="sm">
                Full Day requires arrival by Work Start plus Late Grace, checkout at or after Work End, and a complete 9-hour punch-in period. The 9 hours include the 1-hour break. If an employee punches in but misses any requirement, salary attendance is Half Day. No punch is full LOP.
              </AlertDescription>
            </Alert>
            <SimpleGrid columns={2} spacing={4}>
              <Field label="Work Start Time" required>
                <StyledInput
                  type="time"
                  value={timingsForm.workStartTime}
                  onChange={(e) => setTimingsForm((f) => ({ ...f, workStartTime: e.target.value }))}
                />
              </Field>
              <Field label="Work End Time" required>
                <StyledInput
                  type="time"
                  value={timingsForm.workEndTime}
                  onChange={(e) => setTimingsForm((f) => ({ ...f, workEndTime: e.target.value }))}
                />
              </Field>
            </SimpleGrid>
            <Field label="Late Grace (minutes)">
              <StyledInput
                type="number"
                value={timingsForm.lateGraceMinutes}
                onChange={(e) => setTimingsForm((f) => ({ ...f, lateGraceMinutes: parseInt(e.target.value) || 0 }))}
                maxW="140px"
              />
            </Field>
            <SimpleGrid columns={2} spacing={4}>
              <Field label="Half Day Reference (minutes)">
                <StyledInput
                  type="number"
                  value={timingsForm.halfDayMinMinutes}
                  onChange={(e) => setTimingsForm((f) => ({ ...f, halfDayMinMinutes: parseInt(e.target.value) || 0 }))}
                />
              </Field>
              <Field label="Required Presence (540 = 9 hours, including break)">
                <StyledInput
                  type="number"
                  value={timingsForm.fullDayMinMinutes}
                  onChange={(e) => setTimingsForm((f) => ({ ...f, fullDayMinMinutes: parseInt(e.target.value) || 0 }))}
                />
              </Field>
            </SimpleGrid>
            <PrimaryButton
              size="sm"
              alignSelf="flex-start"
              mt={1}
              onClick={handleSaveTimings}
              isLoading={saving === "timings"}
            >
              Save Timings
            </PrimaryButton>
          </Flex>
        </SectionCard>

        {/* ── Weekly Off Rules ── */}
        <SectionCard
          title="Weekly Off Rules"
          actions={
            <Flex align="center" gap={1.5} color="brand.400">
              <CalendarOff size={15} />
              <Text fontSize="xs" fontWeight="600">Week Days</Text>
            </Flex>
          }
        >
          <Flex direction="column" gap={4}>
            <Field label="Weekly Off Days">
              <Flex gap={2} flexWrap="wrap">
                {WEEK_DAYS.map((day) => (
                  <Box
                    key={day}
                    as="button"
                    type="button"
                    px={3}
                    py={1.5}
                    borderRadius="full"
                    fontSize="xs"
                    fontWeight="600"
                    border="1px solid"
                    borderColor={selectedDays.includes(day) ? "brand.400" : "surface.border"}
                    bg={selectedDays.includes(day) ? "brand.50" : "white"}
                    color={selectedDays.includes(day) ? "brand.600" : "text.muted"}
                    _hover={{ borderColor: "brand.300", bg: "brand.50" }}
                    transition="all 0.15s"
                    onClick={() => toggleDay(day)}
                  >
                    {day.slice(0, 3)}
                  </Box>
                ))}
              </Flex>
            </Field>
            <Field label="Alternate Saturday Off">
              <StyledSelect
                value={weekOffForm.alternateSaturdayOffRule}
                onChange={(e) =>
                  setWeekOffForm((f) => ({
                    ...f,
                    alternateSaturdayOffRule: e.target.value as "NONE" | "SECOND_FOURTH" | "FIRST_THIRD",
                  }))
                }
                maxW="280px"
              >
                <option value="NONE">None</option>
                <option value="SECOND_FOURTH">2nd &amp; 4th Saturday Off</option>
                <option value="FIRST_THIRD">1st &amp; 3rd Saturday Off</option>
              </StyledSelect>
            </Field>
            <PrimaryButton
              size="sm"
              alignSelf="flex-start"
              mt={1}
              onClick={handleSaveWeekOff}
              isLoading={saving === "weekoff"}
            >
              Save Week Off Rules
            </PrimaryButton>
          </Flex>
        </SectionCard>

        {/* ── Office Location & Attendance Access ── */}
        <SectionCard
          title="Single-date Workday Update"
          actions={<Badge colorScheme="purple">One date only</Badge>}
        >
          <Flex direction="column" gap={4}>
            <Alert status="info" borderRadius="lg" alignItems="flex-start">
              <AlertIcon mt={0.5} />
              <AlertDescription fontSize="sm">
                Change one weekly off/holiday into a working day, or one normal day into a non-working day. Employees receive the reason as an office notification.
              </AlertDescription>
            </Alert>
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
              <Field label="Date" required>
                <StyledInput type="date" value={workdayForm.date} onChange={(e) => setWorkdayForm((form) => ({ ...form, date: e.target.value }))} />
              </Field>
              <Field label="Day status" required>
                <StyledSelect value={workdayForm.type} onChange={(e) => setWorkdayForm((form) => ({ ...form, type: e.target.value as WorkdayOverride["type"] }))}>
                  <option value="WORKING_DAY">Working Day</option>
                  <option value="NON_WORKING_DAY">Non-working Day</option>
                </StyledSelect>
              </Field>
            </SimpleGrid>
            <Field label="Reason shown to employees" required>
              <Textarea value={workdayForm.reason} onChange={(e) => setWorkdayForm((form) => ({ ...form, reason: e.target.value }))} maxLength={500} placeholder="Example: Sunday is a working day due to the client release." borderRadius="xl" />
            </Field>
            <PrimaryButton size="sm" alignSelf="flex-start" onClick={handleSaveWorkdayOverride} isLoading={saving === "workday-override"}>
              Save &amp; Notify Everyone
            </PrimaryButton>
            {workdayOverrides.length > 0 && (
              <VStack align="stretch" spacing={2} pt={2} borderTop="1px solid" borderColor="surface.border">
                {workdayOverrides.slice().reverse().slice(0, 8).map((row) => (
                  <Flex key={row.id} align="center" gap={3} p={3} bg="surface.bg" borderRadius="xl">
                    <Box flex={1} minW={0}>
                      <Flex gap={2} align="center" flexWrap="wrap">
                        <Text fontWeight="700" fontSize="sm">{new Date(`${row.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
                        <Badge colorScheme={row.type === "WORKING_DAY" ? "green" : "orange"}>{row.type === "WORKING_DAY" ? "Working" : "Non-working"}</Badge>
                      </Flex>
                      <Text fontSize="xs" color="text.muted" mt={1}>{row.reason}</Text>
                    </Box>
                    <IconButton aria-label="Delete workday update" icon={<Trash2 size={15} />} size="sm" variant="ghost" colorScheme="red" onClick={() => handleDeleteWorkdayOverride(row.id)} />
                  </Flex>
                ))}
              </VStack>
            )}
          </Flex>
        </SectionCard>

        <SectionCard
          title="Office Location & Attendance Access"
          actions={
            <Flex align="center" gap={1.5} color="brand.400">
              <MapPin size={15} />
              <Text fontSize="xs" fontWeight="600">Geo-fence + Remote</Text>
            </Flex>
          }
        >
          <Flex direction="column" gap={4}>
            <SimpleGrid columns={2} spacing={4}>
              <Field label="Latitude">
                <StyledInput
                  type="number"
                  step="any"
                  placeholder="e.g. 28.6139"
                  value={locationForm.officeLatitude}
                  onChange={(e) => setLocationForm((f) => ({ ...f, officeLatitude: e.target.value }))}
                />
              </Field>
              <Field label="Longitude">
                <StyledInput
                  type="number"
                  step="any"
                  placeholder="e.g. 77.2090"
                  value={locationForm.officeLongitude}
                  onChange={(e) => setLocationForm((f) => ({ ...f, officeLongitude: e.target.value }))}
                />
              </Field>
            </SimpleGrid>
            <Field label="Radius (meters)">
              <StyledInput
                type="number"
                placeholder="e.g. 200"
                value={locationForm.officeRadiusMeters}
                onChange={(e) => setLocationForm((f) => ({ ...f, officeRadiusMeters: e.target.value }))}
                maxW="180px"
              />
            </Field>
            <Flex gap={3} flexWrap="wrap">
              <Box
                as="button"
                type="button"
                px={4}
                py={2}
                borderRadius="lg"
                fontSize="sm"
                fontWeight="600"
                border="1px solid"
                borderColor={locationForm.geoFenceRequired ? "brand.400" : "surface.border"}
                bg={locationForm.geoFenceRequired ? "brand.50" : "white"}
                color={locationForm.geoFenceRequired ? "brand.700" : "text.muted"}
                _hover={{ borderColor: "brand.300" }}
                transition="all 0.15s"
                onClick={() => setLocationForm((f) => ({ ...f, geoFenceRequired: !f.geoFenceRequired }))}
              >
                {locationForm.geoFenceRequired ? "✓ " : ""}Geo-fence Required
              </Box>
              <Box
                as="button"
                type="button"
                px={4}
                py={2}
                borderRadius="lg"
                fontSize="sm"
                fontWeight="600"
                border="1px solid"
                borderColor={locationForm.allowRemoteAttendance ? "green.400" : "surface.border"}
                bg={locationForm.allowRemoteAttendance ? "green.50" : "white"}
                color={locationForm.allowRemoteAttendance ? "green.700" : "text.muted"}
                _hover={{ borderColor: "green.300" }}
                transition="all 0.15s"
                onClick={() =>
                  setLocationForm((f) => ({
                    ...f,
                    allowRemoteAttendance: !f.allowRemoteAttendance,
                  }))
                }
              >
                {locationForm.allowRemoteAttendance ? "✓ " : ""}Allow Remote Attendance
              </Box>
            </Flex>
            <PrimaryButton
              size="sm"
              alignSelf="flex-start"
              mt={1}
              onClick={handleSaveLocation}
              isLoading={saving === "location"}
            >
              Save Location & Access
            </PrimaryButton>
          </Flex>
        </SectionCard>

        {/* ── Holidays ── */}
        <SectionCard
          title="Holidays"
          actions={
            <SecondaryButton size="xs" leftIcon={<Plus size={14} />} onClick={openAddHoliday}>
              Add Holiday
            </SecondaryButton>
          }
        >
          <Alert status="info" borderRadius="lg" mb={4} alignItems="flex-start">
            <AlertIcon mt={0.5} />
            <AlertDescription fontSize="sm">
              The combined 2026 Government of India/Central Government and Tamil Nadu Government holidays are preloaded as the default calendar. Add, edit, or remove holidays to match the organization&apos;s business requirements. The updated calendar is shown to employees.
            </AlertDescription>
          </Alert>
          <Flex direction="column" gap={0}>
            {holidays.length === 0 ? (
              <Flex direction="column" align="center" py={8} color="text.muted">
                <CalendarDays size={32} />
                <Text fontSize="sm" mt={2}>No holidays added yet</Text>
              </Flex>
            ) : (
              holidays.map((h, i) => (
                <Flex
                  key={h.id}
                  align="center"
                  justify="space-between"
                  py={2.5}
                  px={1}
                  borderBottom={i < holidays.length - 1 ? "1px solid" : "none"}
                  borderColor="surface.border"
                  _hover={{ bg: "surface.bg" }}
                  borderRadius="md"
                  transition="background 0.1s"
                >
                  <Flex align="center" gap={3}>
                    <Flex
                      w={9}
                      h={9}
                      borderRadius="lg"
                      bg="brand.50"
                      align="center"
                      justify="center"
                      flexShrink={0}
                    >
                      <CalendarDays size={16} color="var(--chakra-colors-brand-400)" />
                    </Flex>
                    <Box>
                      <Text fontSize="sm" fontWeight="600" color="text.heading">
                        {h.name}
                      </Text>
                      <Text fontSize="xs" color="text.muted">
                        {new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    </Box>
                  </Flex>
                  <HStack spacing={1}>
                    <IconButton
                      aria-label="Edit"
                      icon={<Edit2 size={14} />}
                      size="xs"
                      variant="ghost"
                      color="text.muted"
                      _hover={{ color: "brand.400", bg: "brand.50" }}
                      onClick={() => openEditHoliday(h)}
                    />
                    <IconButton
                      aria-label="Delete"
                      icon={<Trash2 size={14} />}
                      size="xs"
                      variant="ghost"
                      color="text.muted"
                      _hover={{ color: "red.500", bg: "red.50" }}
                      onClick={() => handleDeleteHoliday(h.id)}
                    />
                  </HStack>
                </Flex>
              ))
            )}
          </Flex>
        </SectionCard>
      </SimpleGrid>

      {/* ── Leave Policy ── */}
      <Box mt={4}>
        <SectionCard
          title="Leave Policy"
          actions={
            <Flex align="center" gap={1.5} color="brand.400">
              <Shield size={15} />
              <Text fontSize="xs" fontWeight="600">Leave Rules</Text>
            </Flex>
          }
        >
          <Flex direction="column" gap={5}>
            {/* General Settings */}
            <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
              <Field label="Probation Period (months)">
                <StyledInput
                  type="number"
                  value={policyForm.probationPeriodMonths}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, probationPeriodMonths: e.target.value }))}
                  maxW="140px"
                />
              </Field>
              <Field label="Max Permission Hrs/Month">
                <StyledInput
                  type="number"
                  value={policyForm.maxPermissionHoursPerMonth}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, maxPermissionHoursPerMonth: e.target.value }))}
                  maxW="140px"
                />
              </Field>
              <Field label="Max Permission Requests/Month">
                <StyledInput
                  type="number"
                  value={policyForm.maxPermissionRequestsPerMonth}
                  onChange={(e) =>
                    setPolicyForm((f) => ({
                      ...f,
                      maxPermissionRequestsPerMonth: e.target.value,
                    }))
                  }
                  maxW="140px"
                />
              </Field>
              <Field label="Max Regularizations/Month">
                <StyledInput
                  type="number"
                  value={policyForm.maxRegularizationsPerMonth}
                  onChange={(e) =>
                    setPolicyForm((f) => ({
                      ...f,
                      maxRegularizationsPerMonth: e.target.value,
                    }))
                  }
                  maxW="140px"
                />
              </Field>
            </SimpleGrid>

            {/* Toggles */}
            <Alert status="info" borderRadius="lg" alignItems="flex-start">
              <AlertIcon mt={0.5} />
              <AlertDescription fontSize="sm">
                Paid leave starts only after probation. Each employee then receives a 12-month leave year from their probation-completion date. Casual Leave accrues monthly and carries only within that leave year; Sick Leave and Emergency Leave reset every month.
              </AlertDescription>
            </Alert>
            <Flex gap={4} flexWrap="wrap">
              {([
                ["allowHalfDayLeave", "Allow Half-Day Leave"],
                ["allowPermissionHours", "Allow Permission Hours"],
              ] as const).map(([key, label]) => (
                <Box
                  key={key}
                  as="button"
                  type="button"
                  px={4}
                  py={2}
                  borderRadius="lg"
                  fontSize="sm"
                  fontWeight="600"
                  border="1px solid"
                  borderColor={policyForm[key] ? "green.400" : "surface.border"}
                  bg={policyForm[key] ? "green.50" : "white"}
                  color={policyForm[key] ? "green.700" : "text.muted"}
                  _hover={{ borderColor: "green.300" }}
                  transition="all 0.15s"
                  onClick={() => setPolicyForm((f) => ({ ...f, [key]: !f[key] }))}
                >
                  {policyForm[key] ? "✓ " : ""}{label}
                </Box>
              ))}
            </Flex>

            {/* Slabs */}
            <Box>
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontSize="sm" fontWeight="700" color="text.heading">Annual Leave Allowance After Probation</Text>
                <SecondaryButton size="xs" leftIcon={<Plus size={14} />} onClick={addSlab}>
                  Add Slab
                </SecondaryButton>
              </Flex>
              <Flex direction="column" gap={3}>
                {slabs.map((slab, idx) => (
                  <Flex key={idx} bg="surface.bg" borderRadius="lg" p={3} gap={3} align="flex-end" flexWrap="wrap">
                    <Box>
                      <Text fontSize="xs" color="text.muted" mb={1}>Min Years</Text>
                      <StyledInput
                        type="number" size="sm" w="80px"
                        value={slab.minYearsOfService}
                        onChange={(e) => updateSlab(idx, "minYearsOfService", e.target.value)}
                      />
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="text.muted" mb={1}>Max Years</Text>
                      <StyledInput
                        type="number" size="sm" w="80px"
                        placeholder="∞"
                        value={slab.maxYearsOfService}
                        onChange={(e) => updateSlab(idx, "maxYearsOfService", e.target.value)}
                      />
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="text.muted" mb={1}>CL/Year</Text>
                      <StyledInput
                        type="number" size="sm" w="80px"
                        value={slab.casualLeavePerYear}
                        onChange={(e) => updateSlab(idx, "casualLeavePerYear", e.target.value)}
                      />
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="text.muted" mb={1}>SL/Year</Text>
                      <StyledInput
                        type="number" size="sm" w="80px"
                        value={slab.sickLeavePerYear}
                        onChange={(e) => updateSlab(idx, "sickLeavePerYear", e.target.value)}
                      />
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="text.muted" mb={1}>Emergency Leave/Year</Text>
                      <StyledInput
                        type="number" size="sm" w="80px"
                        value={slab.earnedLeavePerYear}
                        onChange={(e) => updateSlab(idx, "earnedLeavePerYear", e.target.value)}
                      />
                    </Box>
                    {slabs.length > 1 && (
                      <IconButton
                        aria-label="Remove slab"
                        icon={<Trash2 size={14} />}
                        size="sm"
                        variant="ghost"
                        color="red.400"
                        _hover={{ bg: "red.50" }}
                        onClick={() => removeSlab(idx)}
                      />
                    )}
                  </Flex>
                ))}
              </Flex>
            </Box>

            <PrimaryButton
              size="sm"
              alignSelf="flex-start"
              onClick={handleSaveLeavePolicy}
              isLoading={saving === "leavePolicy"}
            >
              Save Leave Policy
            </PrimaryButton>
          </Flex>
        </SectionCard>
      </Box>

      <SalaryConfigurationSection />

      {/* Holiday Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader borderBottom="1px solid" borderColor="surface.border" fontSize="md" fontWeight="700">
            {editingHoliday ? "Edit Holiday" : "Add Holiday"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody py={5}>
            <Flex direction="column" gap={4}>
              <Field label="Date" required>
                <StyledInput
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))}
                />
              </Field>
              <Field label="Holiday Name" required>
                <StyledInput
                  placeholder="e.g. Republic Day"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
            </Flex>
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="surface.border" gap={2}>
            <SecondaryButton size="sm" onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton size="sm" onClick={handleSaveHoliday} isLoading={saving === "holiday"}>
              {editingHoliday ? "Update" : "Add"}
            </PrimaryButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
