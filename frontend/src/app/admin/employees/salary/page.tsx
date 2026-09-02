"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Divider,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Spinner,
  Switch,
  Text,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { Edit2, Eye, Info, Lock, Mail, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { employeeApi, salaryStructureApi, settingsApi } from "@/api";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { Field, StyledInput, StyledSelect } from "@/components/ui/FormHelpers";
import EmployeeSelector from "@/components/ui/EmployeeSelector";
import { formatInrCurrency } from "@/lib/formatters";
import type {
  EmployeeSalaryStructureRow,
  OrganizationSalaryConfig,
  SalaryComputation,
  SalaryTemplateComponent,
  SaveEmployeeSalaryStructureInput,
} from "@/types";

type PageView = "list" | "add" | "edit";

type CustomComponentForm = {
  componentName: string;
  category: "EARNING" | "DEDUCTION";
  amount: string;
};

type BankingForm = {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  mobileNumber: string;
  branchName: string;
  panNumber: string;
  uanNumber: string;
};

const emptyCustom: CustomComponentForm = {
  componentName: "",
  category: "EARNING",
  amount: "",
};

const emptyBanking: BankingForm = {
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  mobileNumber: "",
  branchName: "",
  panNumber: "",
  uanNumber: "",
};

const formatCurrency = formatInrCurrency;

function SummaryTile({ title, value }: { title: string; value: string }) {
  return (
    <Box border="1px solid" borderColor="surface.border" borderRadius="lg" p={3} bg="surface.bg">
      <Text fontSize="xs" color="text.muted">{title}</Text>
      <Text fontSize="sm" fontWeight="700" color="text.heading">{value}</Text>
    </Box>
  );
}

const humanizeToken = (value?: string | null): string => {
  if (!value) return "Template rules";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getComponentSourceLabel = (component: SalaryTemplateComponent): string => {
  if (component.sourceType === "AUTO_STATUTORY") {
    return "Statutory deduction from organization rules";
  }
  if (component.calculationType === "PERCENTAGE") {
    return `${component.value ?? 0}% of ${humanizeToken(component.percentageOf)}`;
  }
  if (component.calculationType === "FIXED") {
    return `Fixed ${formatCurrency(Number(component.value ?? 0))} from template`;
  }
  if (component.calculationType === "FORMULA") {
    return component.formulaExpression ? `Formula: ${component.formulaExpression}` : "Formula-based component";
  }
  if (component.calculationType === "RESIDUAL") {
    return "Residual component auto-balanced by template";
  }
  return "Calculated from template";
};

function GuidedStepHeader({
  step,
  title,
  subtitle,
  status,
}: {
  step: number;
  title: string;
  subtitle: string;
  status: "done" | "active" | "pending";
}) {
  return (
    <Flex justify="space-between" align={{ base: "start", md: "center" }} mb={3} direction={{ base: "column", md: "row" }} gap={2}>
      <Flex align="center" gap={3}>
        <Flex
          w={8}
          h={8}
          borderRadius="full"
          align="center"
          justify="center"
          fontSize="sm"
          fontWeight="700"
          bg={status === "done" ? "green.500" : status === "active" ? "brand.500" : "gray.100"}
          color={status === "pending" ? "gray.600" : "white"}
        >
          {step}
        </Flex>
        <Box>
          <Text fontSize="md" fontWeight="800" color="text.heading">
            {title}
          </Text>
          <Text fontSize="xs" color="text.muted">
            {subtitle}
          </Text>
        </Box>
      </Flex>
      <Badge
        borderRadius="full"
        px={2.5}
        py={1}
        colorScheme={status === "done" ? "green" : status === "active" ? "brand" : "gray"}
        textTransform="none"
      >
        {status === "done" ? "Completed" : status === "active" ? "In Progress" : "Pending"}
      </Badge>
    </Flex>
  );
}

function AutoCalculationBanner({
  hasEmployee,
  hasCtc,
  isAutoCalculating,
  lastPreviewAt,
  autoPreviewError,
  onRecalculate,
  previewing,
}: {
  hasEmployee: boolean;
  hasCtc: boolean;
  isAutoCalculating: boolean;
  lastPreviewAt: string;
  autoPreviewError: string | null;
  onRecalculate: () => void;
  previewing: boolean;
}) {
  const bg = !hasEmployee || !hasCtc ? "gray.50" : autoPreviewError ? "red.50" : "brand.50";
  const borderColor = !hasEmployee || !hasCtc ? "gray.200" : autoPreviewError ? "red.200" : "brand.100";
  return (
    <Box border="1px solid" borderColor={borderColor} bg={bg} borderRadius="xl" px={4} py={3}>
      <Flex align={{ base: "start", md: "center" }} justify="space-between" direction={{ base: "column", md: "row" }} gap={3}>
        <HStack align="start" spacing={2.5}>
          <Box mt={0.5}>
            {isAutoCalculating ? <Spinner size="sm" color="brand.400" /> : <Info size={16} color={autoPreviewError ? "#e53e3e" : "#0B72E7"} />}
          </Box>
          <Box>
            <Text fontSize="sm" fontWeight="700" color="text.heading">
              {isAutoCalculating
                ? "Calculating salary structure..."
                : !hasEmployee
                  ? "Select an employee to start salary calculation."
                  : !hasCtc
                    ? "Enter Annual CTC to auto-generate Monthly CTC and all components."
                    : autoPreviewError
                      ? "Could not refresh preview automatically."
                      : "Salary structure is auto-generated from the active salary template."}
            </Text>
            <Text fontSize="xs" color="text.muted">
              {autoPreviewError
                ? autoPreviewError
                : lastPreviewAt
                  ? `Last updated at ${lastPreviewAt}.`
                  : "Changes in CTC or overrides refresh preview automatically."}
            </Text>
          </Box>
        </HStack>
        <SecondaryButton size="xs" leftIcon={<RefreshCw size={13} />} onClick={onRecalculate} isLoading={previewing}>
          Recalculate
        </SecondaryButton>
      </Flex>
    </Box>
  );
}

function LiveSalarySummary({
  preview,
  emptyHint,
}: {
  preview: SalaryComputation | null;
  emptyHint: string;
}) {
  return (
    <SectionCard
      title="Live Salary Summary"
      bgGradient="linear(180deg, #ffffff 0%, #faf7ff 100%)"
      borderColor="brand.100"
    >
      {preview ? (
        <VStack spacing={3} align="stretch">
          <SimpleGrid columns={1} spacing={2}>
            <SummaryTile title="Gross Earnings" value={formatCurrency(preview.summary.grossSalary)} />
            <SummaryTile title="Employee Deductions" value={formatCurrency(preview.summary.employeeDeductions)} />
            <SummaryTile title="Net Pay" value={formatCurrency(preview.summary.netPay)} />
            <SummaryTile title="Employer Contribution" value={formatCurrency(preview.summary.employerContributions)} />
            <SummaryTile title="Total Employer Cost" value={formatCurrency(preview.summary.employerCostImpact)} />
          </SimpleGrid>
          <Text fontSize="xs" color="text.muted">
            Monthly CTC: {formatCurrency(preview.monthlyCtc)} | Annual CTC: {formatCurrency(preview.annualCtc)}
          </Text>
        </VStack>
      ) : (
        <Box border="1px dashed" borderColor="surface.border" borderRadius="lg" p={4} bg="white">
          <Text fontSize="sm" fontWeight="600" color="text.heading" mb={1}>
            Waiting for salary input
          </Text>
          <Text fontSize="xs" color="text.muted">
            {emptyHint}
          </Text>
        </Box>
      )}
    </SectionCard>
  );
}

function ComponentOverrideRow({
  component,
  enabled,
  onEnabledChange,
  allowManualOverride,
  manualOverrideEnabled,
  onManualOverrideChange,
  overrideValue,
  onOverrideValueChange,
  onClearOverride,
  previewAmount,
  overrideModeEnabled,
  invalidOverride,
}: {
  component: SalaryTemplateComponent;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  allowManualOverride: boolean;
  manualOverrideEnabled: boolean;
  onManualOverrideChange: (next: boolean) => void;
  overrideValue: string;
  onOverrideValueChange: (value: string) => void;
  onClearOverride: () => void;
  previewAmount?: number;
  overrideModeEnabled: boolean;
  invalidOverride: boolean;
}) {
  const statusLabel = !allowManualOverride
    ? "Template Locked"
    : manualOverrideEnabled
      ? "Manual Override"
      : "Auto";
  const statusColor = !allowManualOverride
    ? "gray"
    : manualOverrideEnabled
      ? "orange"
      : "green";

  return (
    <Box border="1px solid" borderColor={manualOverrideEnabled ? "orange.200" : "surface.border"} borderRadius="xl" p={3.5} bg="white">
      <Flex justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap={3}>
        <Box>
          <HStack spacing={2} mb={1.5} flexWrap="wrap">
            <Text fontSize="sm" fontWeight="700" color="text.heading">
              {component.componentName}
            </Text>
            <Badge borderRadius="full" colorScheme={component.category === "EARNING" ? "green" : "red"} textTransform="none">
              {component.category === "EARNING" ? "Earning" : "Deduction"}
            </Badge>
            <Badge borderRadius="full" colorScheme={statusColor} textTransform="none">
              {statusLabel}
            </Badge>
          </HStack>
          <Text fontSize="xs" color="text.muted">
            {component.componentCode} - {getComponentSourceLabel(component)}
          </Text>
          {!allowManualOverride ? (
            <HStack spacing={1} mt={1}>
              <Lock size={13} color="#718096" />
              <Text fontSize="xs" color="text.muted">
                This component is locked by template (not editable per employee).
              </Text>
            </HStack>
          ) : null}
        </Box>
        <Box textAlign={{ base: "left", md: "right" }}>
          <Text fontSize="xs" color="text.muted">
            Auto-calculated value
          </Text>
          <Text fontSize="sm" fontWeight="800" color="text.heading">
            {previewAmount != null ? formatCurrency(previewAmount) : "--"}
          </Text>
        </Box>
      </Flex>

      <Divider my={3} />

      <Flex align={{ base: "start", md: "center" }} justify="space-between" gap={2} direction={{ base: "column", md: "row" }}>
        <HStack spacing={2}>
          <Switch size="sm" isChecked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
          <Text fontSize="xs" color="text.muted">
            Include component in this structure
          </Text>
        </HStack>
        {allowManualOverride ? (
          <HStack spacing={2}>
            <Switch
              size="sm"
              colorScheme="orange"
              isChecked={manualOverrideEnabled}
              onChange={(e) => onManualOverrideChange(e.target.checked)}
              isDisabled={!overrideModeEnabled}
            />
            <Text fontSize="xs" color={overrideModeEnabled ? "text.muted" : "gray.400"}>
              {overrideModeEnabled ? "Enable manual override" : "Enable 'Allow manual overrides' first"}
            </Text>
          </HStack>
        ) : null}
      </Flex>

      {allowManualOverride && manualOverrideEnabled ? (
        <Flex mt={3} gap={2} align="center">
          <StyledInput
            type="number"
            maxW="220px"
            value={overrideValue}
            onChange={(e) => onOverrideValueChange(e.target.value)}
            placeholder="Enter override amount"
            borderColor={invalidOverride ? "red.300" : undefined}
          />
          <IconButton
            aria-label={`Clear override for ${component.componentName}`}
            icon={<XCircle size={14} />}
            size="sm"
            variant="ghost"
            color="red.500"
            onClick={onClearOverride}
          />
          {invalidOverride ? (
            <Text fontSize="xs" color="red.500">
              Enter a valid non-negative amount.
            </Text>
          ) : (
            <Text fontSize="xs" color="text.muted">
              Manual value is used in live preview and final save.
            </Text>
          )}
        </Flex>
      ) : null}
    </Box>
  );
}

function ViewModal({
  row,
  isOpen,
  onClose,
}: {
  row: EmployeeSalaryStructureRow | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!row) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader borderBottom="1px solid" borderColor="surface.border">
          <Text fontWeight="700">Salary Structure - {row.employeeName}</Text>
          <Text fontSize="xs" color="text.muted">{row.employeeCode} - {row.email}</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody py={4}>
          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
            <SummaryTile title="Monthly CTC" value={formatCurrency(row.monthlyCtc)} />
            <SummaryTile title="Gross" value={formatCurrency(row.summary.grossSalary)} />
            <SummaryTile title="Net Pay" value={formatCurrency(row.summary.netPay)} />
            <SummaryTile title="Employer Cost" value={formatCurrency(row.summary.employerCostImpact)} />
          </SimpleGrid>

          <Divider my={4} />

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb={2}>Earnings</Text>
              {row.earnings.map((item) => (
                <Flex key={item.id} justify="space-between" py={1.5} borderBottom="1px solid" borderColor="gray.50">
                  <Text fontSize="sm">{item.componentName}</Text>
                  <Text fontSize="sm" fontWeight="600">{formatCurrency(item.calculatedAmount)}</Text>
                </Flex>
              ))}
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb={2}>Deductions</Text>
              {row.deductions.map((item) => (
                <Flex key={item.id} justify="space-between" py={1.5} borderBottom="1px solid" borderColor="gray.50">
                  <Text fontSize="sm">{item.componentName}</Text>
                  <Text fontSize="sm" fontWeight="600">{formatCurrency(item.calculatedAmount)}</Text>
                </Flex>
              ))}
            </Box>
          </SimpleGrid>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function SalaryStructureForm({
  initialUserId,
  onCancel,
  onDone,
}: {
  initialUserId?: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [config, setConfig] = useState<OrganizationSalaryConfig | null>(null);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId || "");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [annualCtc, setAnnualCtc] = useState("");
  const [monthlyCtc, setMonthlyCtc] = useState("");
  const [taxRegime, setTaxRegime] = useState("New");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [notes, setNotes] = useState("");
  const [componentStates, setComponentStates] = useState<Record<string, boolean>>({});
  const [componentOverrides, setComponentOverrides] = useState<Record<string, string>>({});
  const [componentOverrideEnabled, setComponentOverrideEnabled] = useState<Record<string, boolean>>({});
  const [customComponents, setCustomComponents] = useState<CustomComponentForm[]>([]);
  const [banking, setBanking] = useState<BankingForm>(emptyBanking);
  const [showCustomComponents, setShowCustomComponents] = useState(false);
  const [showBankingInfo, setShowBankingInfo] = useState(true);
  const [preview, setPreview] = useState<SalaryComputation | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [isAutoCalculating, setIsAutoCalculating] = useState(false);
  const [autoPreviewError, setAutoPreviewError] = useState<string | null>(null);
  const [lastPreviewAt, setLastPreviewAt] = useState("");
  const [monthlyEdited, setMonthlyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingBankingLink, setSendingBankingLink] = useState(false);
  const [refreshingBanking, setRefreshingBanking] = useState(false);
  const previewSequenceRef = useRef(0);

  const activeComponents: SalaryTemplateComponent[] = useMemo(
    () => (config?.components || []).filter((c) => c.status === "ACTIVE").sort((a, b) => a.displayOrder - b.displayOrder),
    [config],
  );
  const hasEmployee = Boolean(selectedUserId);
  const hasCtcInput = Number(annualCtc || 0) > 0 || Number(monthlyCtc || 0) > 0;
  const templateReady = Boolean(config && activeComponents.length > 0);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoadingConfig(true);
        const cfg = await settingsApi.getSalaryConfig();
        setConfig(cfg);
        setTaxRegime(cfg.taxRegimeDefaults || "New");
        const defaultStates: Record<string, boolean> = {};
        for (const c of (cfg.components || []).filter((item) => item.status === "ACTIVE")) {
          defaultStates[c.componentCode] = c.defaultEnabled;
        }
        setComponentStates(defaultStates);
      } catch {
        toast({ title: "Failed to load salary config", status: "error", duration: 3000, isClosable: true });
      } finally {
        setLoadingConfig(false);
      }
    };
    loadConfig();
  }, [toast]);

  useEffect(() => {
    if (!selectedUserId || !config) return;
    let cancelled = false;
    const loadExisting = async () => {
      try {
        setLoadingExisting(true);
        const [row, submittedBanking] = await Promise.all([
          salaryStructureApi.getByUserId(selectedUserId),
          salaryStructureApi.getBankingDetailsByUserId(selectedUserId),
        ]);
        if (cancelled) return;
        const baseStates: Record<string, boolean> = {};
        for (const c of activeComponents) baseStates[c.componentCode] = c.defaultEnabled;
        if (!row) {
          setExistingId(null);
          setTaxRegime(config.taxRegimeDefaults || "New");
          setAnnualCtc("");
          setMonthlyCtc("");
          setMonthlyEdited(false);
          setEffectiveFrom(new Date().toISOString().slice(0, 10));
          setOverrideEnabled(false);
          setNotes("");
          setComponentStates(baseStates);
          setComponentOverrides({});
          setComponentOverrideEnabled({});
          setCustomComponents([]);
          setShowCustomComponents(false);
          setBanking({
            accountHolderName: submittedBanking.accountHolderName,
            bankName: submittedBanking.bankName,
            accountNumber: submittedBanking.accountNumber,
            ifscCode: submittedBanking.ifscCode,
            mobileNumber: submittedBanking.mobileNumber,
            branchName: submittedBanking.branchName,
            panNumber: submittedBanking.panNumber,
            uanNumber: submittedBanking.uanNumber,
          });
          setShowBankingInfo(true);
          setPreview(null);
          setAutoPreviewError(null);
          setLastPreviewAt("");
          return;
        }
        setExistingId(row.id);
        setAnnualCtc(row.annualCtc ? String(row.annualCtc) : "");
        setMonthlyCtc(row.monthlyCtc ? String(row.monthlyCtc) : "");
        setMonthlyEdited(Boolean(row.overrideEnabled));
        setTaxRegime(row.taxRegime || config.taxRegimeDefaults || "New");
        setEffectiveFrom(row.effectiveFrom || new Date().toISOString().slice(0, 10));
        setOverrideEnabled(Boolean(row.overrideEnabled));
        setNotes(row.notes || "");
        const nextStates: Record<string, boolean> = {};
        for (const c of activeComponents) nextStates[c.componentCode] = c.defaultEnabled;
        for (const i of [...row.earnings, ...row.deductions]) nextStates[i.componentCode] = true;
        setComponentStates(nextStates);
        const nextOverrides: Record<string, string> = {};
        for (const i of [...row.earnings, ...row.deductions]) {
          if (i.isOverride && i.sourceType !== "EMPLOYEE_CUSTOM") {
            nextOverrides[i.componentCode] = String(i.calculatedAmount);
          }
        }
        setComponentOverrides(nextOverrides);
        const nextOverrideEnabled: Record<string, boolean> = {};
        Object.keys(nextOverrides).forEach((code) => {
          nextOverrideEnabled[code] = true;
        });
        setComponentOverrideEnabled(nextOverrideEnabled);
        setCustomComponents([
          ...row.earnings.filter((i) => i.sourceType === "EMPLOYEE_CUSTOM").map((i) => ({
            componentName: i.componentName,
            category: "EARNING" as const,
            amount: String(i.calculatedAmount),
          })),
          ...row.deductions.filter((i) => i.sourceType === "EMPLOYEE_CUSTOM").map((i) => ({
            componentName: i.componentName,
            category: "DEDUCTION" as const,
            amount: String(i.calculatedAmount),
          })),
        ]);
        setShowCustomComponents(
          row.earnings.some((i) => i.sourceType === "EMPLOYEE_CUSTOM")
            || row.deductions.some((i) => i.sourceType === "EMPLOYEE_CUSTOM"),
        );
        setBanking({
          accountHolderName: submittedBanking.accountHolderName,
          bankName: submittedBanking.bankName,
          accountNumber: submittedBanking.accountNumber,
          ifscCode: submittedBanking.ifscCode,
          mobileNumber: submittedBanking.mobileNumber,
          branchName: submittedBanking.branchName,
          panNumber: submittedBanking.panNumber,
          uanNumber: submittedBanking.uanNumber,
        });
        setShowBankingInfo(true);
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    };
    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, config, activeComponents]);

  useEffect(() => {
    if (!annualCtc.trim()) {
      if (!overrideEnabled || !monthlyEdited) setMonthlyCtc("");
      return;
    }
    const annualValue = Number(annualCtc);
    if (!Number.isFinite(annualValue) || annualValue <= 0) return;
    if (!overrideEnabled || !monthlyEdited) {
      setMonthlyCtc((annualValue / 12).toFixed(2));
    }
  }, [annualCtc, overrideEnabled, monthlyEdited]);

  useEffect(() => {
    if (!overrideEnabled) {
      setMonthlyEdited(false);
    }
  }, [overrideEnabled]);

  const previewComponentMap = useMemo(() => {
    const map: Record<string, SalaryComputation["earnings"][number]> = {};
    if (!preview) return map;
    for (const item of [...preview.earnings, ...preview.deductions]) {
      map[item.componentCode] = item;
    }
    return map;
  }, [preview]);

  const invalidOverrideCodes = useMemo(() => {
    if (!overrideEnabled) return [] as string[];
    return Object.entries(componentOverrideEnabled)
      .filter(([, enabled]) => enabled)
      .map(([code]) => code)
      .filter((code) => {
        const value = componentOverrides[code];
        if (value == null || value.trim() === "") return true;
        const parsed = Number(value);
        return !Number.isFinite(parsed) || parsed < 0;
      });
  }, [overrideEnabled, componentOverrideEnabled, componentOverrides]);

  const buildPayload = useCallback((): SaveEmployeeSalaryStructureInput => {
    const parsedOverrides: Record<string, number> = {};
    if (overrideEnabled) {
      for (const [key, enabled] of Object.entries(componentOverrideEnabled)) {
        if (!enabled) continue;
        const value = componentOverrides[key];
        if (value == null || value.trim() === "") continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) parsedOverrides[key] = parsed;
      }
    }
    return {
      annualCtc: annualCtc ? Number(annualCtc) : undefined,
      monthlyCtc: monthlyCtc ? Number(monthlyCtc) : undefined,
      taxRegime,
      effectiveFrom,
      overrideEnabled,
      notes,
      componentStates,
      componentOverrides: parsedOverrides,
      customComponents: customComponents
        .filter((i) => i.componentName.trim() && Number(i.amount) > 0)
        .map((i) => ({
          componentName: i.componentName.trim(),
          category: i.category,
          amount: Number(i.amount),
        })),
      bankingInfo: {
        accountHolderName: banking.accountHolderName.trim(),
        bankName: banking.bankName.trim(),
        accountNumber: banking.accountNumber.trim(),
        ifscCode: banking.ifscCode.trim().toUpperCase(),
        mobileNumber: banking.mobileNumber.trim(),
        branchName: banking.branchName.trim(),
        panNumber: banking.panNumber.trim().toUpperCase(),
        uanNumber: banking.uanNumber.trim(),
      },
    };
  }, [
    annualCtc,
    monthlyCtc,
    taxRegime,
    effectiveFrom,
    overrideEnabled,
    notes,
    componentStates,
    componentOverrides,
    componentOverrideEnabled,
    customComponents,
    banking,
  ]);

  const runPreview = useCallback(async (showToastOnError: boolean) => {
    if (!templateReady) {
      setPreview(null);
      setAutoPreviewError("No active salary template found.");
      if (showToastOnError) {
        toast({ title: "No active salary template found", status: "warning", duration: 2500, isClosable: true });
      }
      return;
    }

    if (!selectedUserId) {
      setPreview(null);
      setAutoPreviewError("Select an employee to generate salary structure.");
      if (showToastOnError) {
        toast({ title: "Select an employee", status: "warning", duration: 2500, isClosable: true });
      }
      return;
    }

    if (Number(annualCtc || 0) <= 0 && Number(monthlyCtc || 0) <= 0) {
      setPreview(null);
      setAutoPreviewError("Enter Annual CTC to auto-calculate salary structure.");
      if (showToastOnError) {
        toast({ title: "Enter annual or monthly CTC", status: "warning", duration: 2500, isClosable: true });
      }
      return;
    }

    if (invalidOverrideCodes.length > 0) {
      const message = "Fix invalid override values before recalculation.";
      setAutoPreviewError(message);
      if (showToastOnError) {
        toast({ title: message, status: "warning", duration: 2500, isClosable: true });
      }
      return;
    }

    const requestId = ++previewSequenceRef.current;
    if (showToastOnError) setPreviewing(true);
    setIsAutoCalculating(!showToastOnError);
    try {
      const result = await salaryStructureApi.preview(buildPayload());
      if (requestId !== previewSequenceRef.current) return;
      setPreview(result);
      setAutoPreviewError(null);
      setLastPreviewAt(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (err: any) {
      if (requestId !== previewSequenceRef.current) return;
      const message = err?.message || "Failed to run preview";
      setAutoPreviewError(message);
      if (showToastOnError) {
        toast({ title: message, status: "error", duration: 3000, isClosable: true });
      }
    } finally {
      if (requestId === previewSequenceRef.current) {
        setPreviewing(false);
        setIsAutoCalculating(false);
      }
    }
  }, [
    annualCtc,
    monthlyCtc,
    selectedUserId,
    buildPayload,
    invalidOverrideCodes,
    templateReady,
    toast,
  ]);

  useEffect(() => {
    if (loadingConfig || loadingExisting) return;
    const timer = setTimeout(() => {
      void runPreview(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [loadingConfig, loadingExisting, runPreview]);

  const saveStructure = async () => {
    if (!selectedUserId) {
      toast({ title: "Select an employee", status: "warning", duration: 2500, isClosable: true });
      return;
    }
    if (invalidOverrideCodes.length > 0) {
      toast({ title: "Fix invalid override values before saving", status: "warning", duration: 2500, isClosable: true });
      return;
    }
    if (banking.accountNumber && !/^\d{6,30}$/.test(banking.accountNumber)) {
      toast({ title: "Enter a valid bank account number", status: "warning", duration: 2500, isClosable: true });
      return;
    }
    if (banking.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(banking.ifscCode)) {
      toast({ title: "Enter a valid IFSC code (for example, HDFC0001234)", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    if (banking.mobileNumber && !/^\d{10,15}$/.test(banking.mobileNumber)) {
      toast({ title: "Enter a valid 10 to 15 digit banking mobile number", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    try {
      setSaving(true);
      await salaryStructureApi.save(selectedUserId, buildPayload());
      toast({
        title: existingId ? "Salary structure updated" : "Salary structure created",
        status: "success",
        duration: 2500,
        isClosable: true,
      });
      onDone();
    } catch (err: any) {
      toast({ title: err?.message || "Failed to save salary structure", status: "error", duration: 3000, isClosable: true });
    } finally {
      setSaving(false);
    }
  };

  const sendBankingDetailsLink = async () => {
    if (!selectedUserId) {
      toast({ title: "Select an employee first", status: "warning", duration: 2500, isClosable: true });
      return;
    }
    try {
      setSendingBankingLink(true);
      const result = await employeeApi.sendBankingDetailsLink(selectedUserId);
      toast({
        title: "Banking details link sent",
        description: `The secure form link was emailed to ${result.email}.`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (err: any) {
      toast({ title: "Could not send banking link", description: err?.message, status: "error", duration: 3500, isClosable: true });
    } finally {
      setSendingBankingLink(false);
    }
  };

  const refreshBankingDetails = async () => {
    if (!selectedUserId) return;
    try {
      setRefreshingBanking(true);
      const details = await salaryStructureApi.getBankingDetailsByUserId(selectedUserId);
      setBanking({
        accountHolderName: details.accountHolderName,
        bankName: details.bankName,
        accountNumber: details.accountNumber,
        ifscCode: details.ifscCode,
        mobileNumber: details.mobileNumber,
        branchName: details.branchName,
        panNumber: details.panNumber,
        uanNumber: details.uanNumber,
      });
      toast({
        title: details.submitted ? "Employee banking details loaded" : "Banking details not submitted yet",
        status: details.submitted ? "success" : "info",
        duration: 2500,
        isClosable: true,
      });
    } catch (err: any) {
      toast({ title: "Could not refresh banking details", description: err?.message, status: "error", duration: 3500, isClosable: true });
    } finally {
      setRefreshingBanking(false);
    }
  };

  if (loadingConfig) {
    return <Flex justify="center" py={12}><Spinner color="brand.400" /></Flex>;
  }

  if (!config) {
    return (
      <SectionCard>
        <Text fontSize="md" fontWeight="700" color="text.heading" mb={1}>
          Salary template is not available
        </Text>
        <Text fontSize="sm" color="text.muted" mb={4}>
          Configure an active salary template before creating employee salary structures.
        </Text>
        <PrimaryButton
          size="sm"
          onClick={() => {
            window.location.assign("/admin/settings");
          }}
        >
          Open Salary Configuration
        </PrimaryButton>
      </SectionCard>
    );
  }

  const stepStatuses: Array<"done" | "active" | "pending"> = [
    hasEmployee ? "done" : "active",
    hasEmployee && hasCtcInput ? "done" : hasEmployee ? "active" : "pending",
    preview ? "done" : hasEmployee && hasCtcInput ? "active" : "pending",
    preview && (overrideEnabled || customComponents.length > 0) ? "done" : preview ? "active" : "pending",
    preview ? "active" : "pending",
  ];
  const customizedFromTemplate = (
    overrideEnabled
    && Object.values(componentOverrideEnabled).some(Boolean)
  ) || customComponents.length > 0;

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="700">{existingId ? "Edit Salary Structure" : "Create Salary Structure"}</Text>
        <SecondaryButton size="sm" onClick={onCancel}>Back to List</SecondaryButton>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 5 }} spacing={2} mb={4}>
        {[
          "Select Employee",
          "Enter Annual CTC",
          "Auto-Generate Structure",
          "Review / Override Components",
          "Review & Save",
        ].map((label, index) => (
          <Box key={label} border="1px solid" borderColor="surface.border" borderRadius="xl" px={3} py={2.5} bg="white">
            <Text fontSize="10px" color="text.muted" textTransform="uppercase" letterSpacing="widest">
              Step {index + 1}
            </Text>
            <Text fontSize="xs" fontWeight="700" color={stepStatuses[index] === "pending" ? "text.muted" : "text.heading"}>
              {label}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <Flex gap={4} direction={{ base: "column", xl: "row" }} align="start">
        <Box flex={1} minW={0}>
          <SectionCard mb={4}>
            <GuidedStepHeader
              step={1}
              title="Select Employee"
              subtitle="Pick the employee whose salary structure you want to build."
              status={stepStatuses[0]}
            />
            <EmployeeSelector value={selectedUserId} onChange={setSelectedUserId} />
            {loadingExisting ? (
              <HStack spacing={2} mt={2}>
                <Spinner size="sm" color="brand.400" />
                <Text fontSize="xs" color="text.muted">
                  Loading existing salary structure...
                </Text>
              </HStack>
            ) : hasEmployee ? (
              <Badge borderRadius="full" colorScheme={existingId ? "blue" : "green"} textTransform="none">
                {existingId ? "Existing structure loaded for editing" : "New structure will be created"}
              </Badge>
            ) : null}
          </SectionCard>

          <SectionCard mb={4}>
            <GuidedStepHeader
              step={2}
              title="Salary Structure Base"
              subtitle="Annual CTC is the primary input. Monthly CTC and components are auto-derived."
              status={stepStatuses[1]}
            />
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
              <Field label="Annual CTC" required>
                <InputGroup>
                  <InputLeftElement pointerEvents="none" color="text.muted" h="100%" fontSize="sm">
                    INR
                  </InputLeftElement>
                  <StyledInput
                    type="number"
                    pl={8}
                    value={annualCtc}
                    onChange={(e) => setAnnualCtc(e.target.value)}
                    borderColor={Number(annualCtc || 0) > 0 ? "brand.300" : undefined}
                    bg="white"
                  />
                </InputGroup>
                <Text fontSize="xs" color="text.muted" mt={1}>
                  Primary driver for all salary calculations.
                </Text>
              </Field>
              <Field label="Monthly CTC (Auto-calculated)">
                <StyledInput
                  type="number"
                  value={monthlyCtc}
                  onChange={(e) => {
                    setMonthlyEdited(true);
                    setMonthlyCtc(e.target.value);
                  }}
                  isReadOnly={!overrideEnabled}
                  bg={!overrideEnabled ? "gray.50" : "white"}
                />
                <Text fontSize="xs" color="text.muted" mt={1}>
                  {!overrideEnabled
                    ? "Auto-calculated from Annual CTC. Enable manual overrides to edit."
                    : "Override mode enabled. You can edit Monthly CTC manually."}
                </Text>
              </Field>
              <Field label="Salary Template">
                <StyledInput isReadOnly value={config.defaultTemplateName || ""} bg="gray.50" />
                <Text fontSize="xs" color="text.muted" mt={1}>
                  Applied template version: {config.version}
                </Text>
              </Field>
              <Field label="Tax Regime">
                <StyledSelect value={taxRegime} onChange={(e) => setTaxRegime(e.target.value)}>
                  <option value="New">New</option>
                  <option value="Old">Old</option>
                </StyledSelect>
              </Field>
              <Field label="Effective From">
                <StyledInput type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </Field>
              <Field label="Allow manual overrides">
                <HStack spacing={2} mt={1.5}>
                  <Switch
                    isChecked={overrideEnabled}
                    onChange={(e) => setOverrideEnabled(e.target.checked)}
                    colorScheme="brand"
                  />
                  <Text fontSize="sm" color="text.muted">
                    {overrideEnabled ? "Manual overrides enabled" : "Template-driven auto mode"}
                  </Text>
                </HStack>
              </Field>
            </SimpleGrid>
            <Field label="Notes">
              <Input mt={2} value={notes} onChange={(e) => setNotes(e.target.value)} borderRadius="lg" />
            </Field>
          </SectionCard>

          <SectionCard mb={4}>
            <GuidedStepHeader
              step={3}
              title="Auto-Generated Structure"
              subtitle="The system calculates monthly split, earnings, deductions, and statutory values automatically."
              status={stepStatuses[2]}
            />
            <AutoCalculationBanner
              hasEmployee={hasEmployee}
              hasCtc={hasCtcInput}
              isAutoCalculating={isAutoCalculating}
              lastPreviewAt={lastPreviewAt}
              autoPreviewError={autoPreviewError}
              onRecalculate={() => { void runPreview(true); }}
              previewing={previewing}
            />
          </SectionCard>

          <SectionCard mb={4}>
            <GuidedStepHeader
              step={4}
              title="Review / Override Components"
              subtitle="See component-wise source and override only fields allowed by template."
              status={stepStatuses[3]}
            />
            {activeComponents.length ? (
              <Flex direction="column" gap={3}>
                {activeComponents.map((component) => {
                  const code = component.componentCode;
                  const manualEnabled = componentOverrideEnabled[code] ?? false;
                  return (
                    <ComponentOverrideRow
                      key={code}
                      component={component}
                      enabled={componentStates[code] ?? component.defaultEnabled}
                      onEnabledChange={(next) => setComponentStates((prev) => ({ ...prev, [code]: next }))}
                      allowManualOverride={component.editableForEmployee}
                      manualOverrideEnabled={manualEnabled}
                      onManualOverrideChange={(next) => {
                        setComponentOverrideEnabled((prev) => ({ ...prev, [code]: next }));
                        if (next) {
                          if (!componentOverrides[code] && previewComponentMap[code]?.amount != null) {
                            setComponentOverrides((prev) => ({ ...prev, [code]: String(previewComponentMap[code].amount) }));
                          }
                        } else {
                          setComponentOverrides((prev) => {
                            const nextOverrides = { ...prev };
                            delete nextOverrides[code];
                            return nextOverrides;
                          });
                        }
                      }}
                      overrideValue={componentOverrides[code] || ""}
                      onOverrideValueChange={(value) => setComponentOverrides((prev) => ({ ...prev, [code]: value }))}
                      onClearOverride={() => {
                        setComponentOverrideEnabled((prev) => ({ ...prev, [code]: false }));
                        setComponentOverrides((prev) => {
                          const nextOverrides = { ...prev };
                          delete nextOverrides[code];
                          return nextOverrides;
                        });
                      }}
                      previewAmount={previewComponentMap[code]?.amount}
                      overrideModeEnabled={overrideEnabled}
                      invalidOverride={invalidOverrideCodes.includes(code)}
                    />
                  );
                })}
              </Flex>
            ) : (
              <Text fontSize="sm" color="text.muted">
                No active salary components found in the selected template.
              </Text>
            )}

            <Box mt={4} border="1px solid" borderColor="surface.border" borderRadius="xl" p={3.5} bg="surface.bg">
              <Flex justify="space-between" align={{ base: "start", md: "center" }} gap={2} direction={{ base: "column", md: "row" }}>
                <Box>
                  <Text fontSize="sm" fontWeight="700" color="text.heading">
                    Additional custom components
                  </Text>
                  <Text fontSize="xs" color="text.muted">
                    Add one-off earning or deduction adjustments if needed.
                  </Text>
                </Box>
                <HStack spacing={2}>
                  <SecondaryButton size="xs" onClick={() => setShowCustomComponents((prev) => !prev)}>
                    {showCustomComponents ? "Hide" : "Show"}
                  </SecondaryButton>
                  <SecondaryButton
                    size="xs"
                    leftIcon={<Plus size={14} />}
                    onClick={() => {
                      setShowCustomComponents(true);
                      setCustomComponents((prev) => [...prev, { ...emptyCustom }]);
                    }}
                  >
                    Add
                  </SecondaryButton>
                </HStack>
              </Flex>

              {showCustomComponents ? (
                <Flex direction="column" gap={2} mt={3}>
                  {customComponents.map((row, idx) => (
                    <Flex key={idx} gap={2} align="center" flexWrap="wrap">
                      <Box flex={2} minW="180px">
                        <StyledInput
                          value={row.componentName}
                          placeholder="Component name"
                          onChange={(e) => setCustomComponents((prev) => prev.map((item, i) => (i === idx ? { ...item, componentName: e.target.value } : item)))}
                        />
                      </Box>
                      <Box flex={1} minW="140px">
                        <StyledSelect
                          value={row.category}
                          onChange={(e) => setCustomComponents((prev) => prev.map((item, i) => (i === idx ? { ...item, category: e.target.value as "EARNING" | "DEDUCTION" } : item)))}
                        >
                          <option value="EARNING">Earning</option>
                          <option value="DEDUCTION">Deduction</option>
                        </StyledSelect>
                      </Box>
                      <Box flex={1} minW="140px">
                        <StyledInput
                          type="number"
                          value={row.amount}
                          placeholder="Amount"
                          onChange={(e) => setCustomComponents((prev) => prev.map((item, i) => (i === idx ? { ...item, amount: e.target.value } : item)))}
                        />
                      </Box>
                      <IconButton
                        aria-label="Remove custom component"
                        icon={<Trash2 size={14} />}
                        size="sm"
                        variant="ghost"
                        color="red.500"
                        onClick={() => setCustomComponents((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    </Flex>
                  ))}
                  {customComponents.length === 0 ? (
                    <Text fontSize="sm" color="text.muted">
                      No custom components added.
                    </Text>
                  ) : null}
                </Flex>
              ) : null}
            </Box>

            <Box mt={3} border="1px solid" borderColor="surface.border" borderRadius="xl" p={3.5} bg="surface.bg">
              <Flex justify="space-between" align={{ base: "start", md: "center" }} gap={2} direction={{ base: "column", md: "row" }}>
                <Box>
                  <Text fontSize="sm" fontWeight="700" color="text.heading">
                    Employee Banking Details
                  </Text>
                  <Text fontSize="xs" color="text.muted">
                    Add the selected employee&apos;s salary credit account information.
                  </Text>
                </Box>
                <HStack spacing={2}>
                  <SecondaryButton
                    size="xs"
                    leftIcon={<Mail size={13} />}
                    onClick={sendBankingDetailsLink}
                    isLoading={sendingBankingLink}
                    isDisabled={!selectedUserId}
                  >
                    Send employee link
                  </SecondaryButton>
                  <SecondaryButton
                    size="xs"
                    leftIcon={<RefreshCw size={13} />}
                    onClick={refreshBankingDetails}
                    isLoading={refreshingBanking}
                    isDisabled={!selectedUserId}
                  >
                    Refresh details
                  </SecondaryButton>
                  <SecondaryButton size="xs" onClick={() => setShowBankingInfo((prev) => !prev)}>
                    {showBankingInfo ? "Hide" : "Show"}
                  </SecondaryButton>
                </HStack>
              </Flex>
              {showBankingInfo ? (
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mt={3}>
                  <Field label="Account Holder Name"><StyledInput placeholder="Name as per bank account" value={banking.accountHolderName} onChange={(e) => setBanking((p) => ({ ...p, accountHolderName: e.target.value }))} /></Field>
                  <Field label="Bank Name"><StyledInput placeholder="Bank name" value={banking.bankName} onChange={(e) => setBanking((p) => ({ ...p, bankName: e.target.value }))} /></Field>
                  <Field label="Account Number"><StyledInput inputMode="numeric" placeholder="Bank account number" value={banking.accountNumber} onChange={(e) => setBanking((p) => ({ ...p, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 30) }))} /></Field>
                  <Field label="IFSC Code"><StyledInput maxLength={11} placeholder="e.g. HDFC0001234" value={banking.ifscCode} onChange={(e) => setBanking((p) => ({ ...p, ifscCode: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() }))} /></Field>
                  <Field label="Banking Mobile Number"><StyledInput inputMode="numeric" placeholder="Registered mobile number" value={banking.mobileNumber} onChange={(e) => setBanking((p) => ({ ...p, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 15) }))} /></Field>
                  <Field label="Branch Name"><StyledInput value={banking.branchName} onChange={(e) => setBanking((p) => ({ ...p, branchName: e.target.value }))} /></Field>
                  <Field label="PAN Number"><StyledInput value={banking.panNumber} onChange={(e) => setBanking((p) => ({ ...p, panNumber: e.target.value.toUpperCase() }))} /></Field>
                  <Field label="UAN Number"><StyledInput value={banking.uanNumber} onChange={(e) => setBanking((p) => ({ ...p, uanNumber: e.target.value.replace(/\D/g, "") }))} /></Field>
                </SimpleGrid>
              ) : null}
            </Box>
          </SectionCard>

          <SectionCard mb={4}>
            <GuidedStepHeader
              step={5}
              title="Review Final Structure"
              subtitle="Live summary updates instantly based on CTC and overrides."
              status={stepStatuses[4]}
            />
            {preview ? (
              <>
                <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} spacing={3}>
                  <SummaryTile title="Gross Earnings" value={formatCurrency(preview.summary.grossSalary)} />
                  <SummaryTile title="Employee Deductions" value={formatCurrency(preview.summary.employeeDeductions)} />
                  <SummaryTile title="Net Pay" value={formatCurrency(preview.summary.netPay)} />
                  <SummaryTile title="Employer Contribution" value={formatCurrency(preview.summary.employerContributions)} />
                  <SummaryTile title="Total Employer Cost" value={formatCurrency(preview.summary.employerCostImpact)} />
                </SimpleGrid>

                <Flex justify="space-between" mt={3} align="center" gap={2} flexWrap="wrap">
                  <Text fontSize="xs" color="text.muted">
                    Salary Template: {preview.appliedTemplateName} (v{preview.appliedConfigVersion})
                  </Text>
                  {customizedFromTemplate ? (
                    <Badge borderRadius="full" colorScheme="orange" textTransform="none">
                      Customized from template defaults
                    </Badge>
                  ) : (
                    <Badge borderRadius="full" colorScheme="green" textTransform="none">
                      Template auto defaults
                    </Badge>
                  )}
                </Flex>

                <Divider my={4} />

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <Box>
                    <Text fontSize="sm" fontWeight="700" mb={2}>Earnings Breakdown</Text>
                    {preview.earnings.map((item) => (
                      <Flex key={`earning-${item.componentCode}`} justify="space-between" py={1.5} borderBottom="1px solid" borderColor="gray.100">
                        <Box>
                          <Text fontSize="sm">{item.componentName}</Text>
                          <Text fontSize="xs" color="text.muted">
                            {item.isOverride ? "Manual override applied" : "Calculated from template"}
                          </Text>
                        </Box>
                        <Text fontSize="sm" fontWeight="700">{formatCurrency(item.amount)}</Text>
                      </Flex>
                    ))}
                  </Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="700" mb={2}>Deductions Breakdown</Text>
                    {preview.deductions.map((item) => (
                      <Flex key={`deduction-${item.componentCode}`} justify="space-between" py={1.5} borderBottom="1px solid" borderColor="gray.100">
                        <Box>
                          <Text fontSize="sm">{item.componentName}</Text>
                          <Text fontSize="xs" color="text.muted">
                            {item.sourceType === "AUTO_STATUTORY" ? "Statutory deduction" : item.isOverride ? "Manual override applied" : "Calculated from template"}
                          </Text>
                        </Box>
                        <Text fontSize="sm" fontWeight="700">{formatCurrency(item.amount)}</Text>
                      </Flex>
                    ))}
                  </Box>
                </SimpleGrid>

                {preview.statutoryBreakdowns.length ? (
                  <>
                    <Divider my={4} />
                    <Box>
                      <Text fontSize="sm" fontWeight="700" mb={2}>Statutory Breakdown</Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                        {preview.statutoryBreakdowns.map((item, idx) => (
                          <Flex key={`${item.statutoryType}-${idx}`} justify="space-between" border="1px solid" borderColor="surface.border" borderRadius="lg" px={3} py={2}>
                            <Box>
                              <Text fontSize="sm" fontWeight="600">{item.componentName}</Text>
                              <Text fontSize="xs" color="text.muted">
                                {item.statutoryType} - {item.componentSide}
                              </Text>
                            </Box>
                            <Text fontSize="sm" fontWeight="700">{formatCurrency(item.amount)}</Text>
                          </Flex>
                        ))}
                      </SimpleGrid>
                    </Box>
                  </>
                ) : null}
              </>
            ) : (
              <Box border="1px dashed" borderColor="surface.border" borderRadius="lg" p={4}>
                <Text fontSize="sm" fontWeight="700" color="text.heading" mb={1}>
                  Final summary will appear here
                </Text>
                <Text fontSize="xs" color="text.muted">
                  Select an employee and enter Annual CTC to generate earnings, deductions, net pay, and employer cost.
                </Text>
              </Box>
            )}
          </SectionCard>
        </Box>

        <Box w={{ base: "100%", xl: "360px" }} position={{ xl: "sticky" }} top={{ xl: "84px" }} alignSelf="flex-start">
          <LiveSalarySummary
            preview={preview}
            emptyHint="Once Annual CTC is entered, this panel will show live totals automatically."
          />
          <SectionCard mt={4}>
            <Text fontSize="sm" fontWeight="700" color="text.heading" mb={1}>
              Save Action
            </Text>
            <Text fontSize="xs" color="text.muted" mb={3}>
              {invalidOverrideCodes.length
                ? "Fix invalid manual overrides before saving."
                : "Your latest preview values will be persisted to employee salary structure."}
            </Text>
            <VStack align="stretch" spacing={2}>
              <SecondaryButton
                size="sm"
                leftIcon={<RefreshCw size={14} />}
                isLoading={previewing}
                onClick={() => { void runPreview(true); }}
              >
                Refresh Preview
              </SecondaryButton>
              <PrimaryButton
                size="sm"
                isLoading={saving}
                isDisabled={!hasEmployee || !hasCtcInput || invalidOverrideCodes.length > 0}
                onClick={saveStructure}
              >
                {existingId ? "Update Salary Structure" : "Save Salary Structure"}
              </PrimaryButton>
              <SecondaryButton size="sm" onClick={onCancel}>Cancel</SecondaryButton>
            </VStack>
          </SectionCard>
        </Box>
      </Flex>

      <Box
        mt={4}
        position="sticky"
        bottom={0}
        zIndex={6}
        bg="whiteAlpha.900"
        backdropFilter="blur(8px)"
        border="1px solid"
        borderColor="surface.border"
        borderRadius="xl"
        p={3}
      >
        <Flex justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap={2}>
          <Box>
            <Text fontSize="sm" fontWeight="700" color="text.heading">
              {existingId ? "Editing salary structure" : "Creating new salary structure"}
            </Text>
            <Text fontSize="xs" color="text.muted">
              {hasEmployee
                ? hasCtcInput
                  ? "Auto-calculation is active. Save when the final summary looks correct."
                  : "Enter Annual CTC to start automatic split calculation."
                : "Select an employee to begin."}
            </Text>
          </Box>
          <HStack spacing={2}>
            <SecondaryButton
              size="sm"
              leftIcon={<RefreshCw size={14} />}
              isLoading={previewing}
              onClick={() => { void runPreview(true); }}
            >
              Recalculate
            </SecondaryButton>
            <PrimaryButton
              size="sm"
              isLoading={saving}
              isDisabled={!hasEmployee || !hasCtcInput || invalidOverrideCodes.length > 0}
              onClick={saveStructure}
            >
              {existingId ? "Update" : "Save"}
            </PrimaryButton>
          </HStack>
        </Flex>
      </Box>
    </Box>
  );
}

export default function SalaryBankingPage() {
  const toast = useToast();
  const viewModal = useDisclosure();
  const [view, setView] = useState<PageView>("list");
  const [rows, setRows] = useState<EmployeeSalaryStructureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<EmployeeSalaryStructureRow | null>(null);
  const [viewRow, setViewRow] = useState<EmployeeSalaryStructureRow | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await salaryStructureApi.list();
      setRows(res.data);
    } catch {
      toast({ title: "Failed to load salary structures", status: "error", duration: 3000, isClosable: true });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = rows.filter((row) => {
    const q = search.toLowerCase();
    return row.employeeName.toLowerCase().includes(q) || row.employeeCode.toLowerCase().includes(q) || row.email.toLowerCase().includes(q) || row.appliedTemplateName.toLowerCase().includes(q);
  });

  const columns: Column<EmployeeSalaryStructureRow>[] = [
    { key: "employeeCode", header: "Emp ID", width: "110px", render: (row) => <Text fontSize="sm" fontWeight="700" color="brand.500">{row.employeeCode}</Text> },
    { key: "employeeName", header: "Employee", render: (row) => <Box><Text fontSize="sm" fontWeight="600">{row.employeeName}</Text><Text fontSize="xs" color="text.muted">{row.email}</Text></Box> },
    { key: "template", header: "Template", render: (row) => <Box><Text fontSize="sm" fontWeight="600">{row.appliedTemplateName}</Text><Text fontSize="xs" color="text.muted">Version {row.appliedConfigVersion}</Text></Box> },
    { key: "monthlyCtc", header: "Monthly CTC", render: (row) => <Text fontSize="sm">{formatCurrency(row.monthlyCtc)}</Text> },
    { key: "netPay", header: "Net Pay", render: (row) => <Text fontSize="sm" fontWeight="700" color="green.600">{formatCurrency(Number(row.summary?.netPay || 0))}</Text> },
    { key: "employerCost", header: "Employer Cost", render: (row) => <Text fontSize="sm" fontWeight="700" color="blue.600">{formatCurrency(Number(row.summary?.employerCostImpact || 0))}</Text> },
    { key: "actions", header: "Actions", width: "110px", render: (row) => <HStack spacing={1}><IconButton aria-label="view" icon={<Eye size={16} />} size="sm" variant="ghost" onClick={() => { setViewRow(row); viewModal.onOpen(); }} /><IconButton aria-label="edit" icon={<Edit2 size={16} />} size="sm" variant="ghost" onClick={() => { setEditRow(row); setView("edit"); }} /></HStack> },
  ];

  if (view === "add") {
    return (
      <Box>
        <PageHeader title="Salary & Banking" subtitle="Generate salary structures from organization-level salary settings." />
        <SalaryStructureForm onCancel={() => setView("list")} onDone={() => { setView("list"); fetchRows(); }} />
      </Box>
    );
  }

  if (view === "edit" && editRow) {
    return (
      <Box>
        <PageHeader title="Salary & Banking" subtitle="Update employee salary structure and banking details." />
        <SalaryStructureForm initialUserId={editRow.employeeId} onCancel={() => { setEditRow(null); setView("list"); }} onDone={() => { setEditRow(null); setView("list"); fetchRows(); }} />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Salary & Banking"
        subtitle="Auto-fill earnings, statutory deductions and net pay from organization defaults."
        actions={<PrimaryButton size="sm" leftIcon={<Plus size={16} />} onClick={() => setView("add")}>Configure Salary</PrimaryButton>}
      />

      <SectionCard>
        <Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap={3} mb={4}>
          <InputGroup maxW={{ base: "100%", md: "340px" }}>
            <InputLeftElement pointerEvents="none"><Search size={16} color="gray" /></InputLeftElement>
            <Input placeholder="Search by employee, code, email, template" size="md" borderRadius="lg" fontSize="sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </InputGroup>
          <Text fontSize="sm" color="text.muted">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</Text>
        </Flex>
        <DataTable columns={columns} data={filtered} keyField="id" emptyMessage={loading ? "Loading..." : "No salary structure found."} />
      </SectionCard>

      <ViewModal row={viewRow} isOpen={viewModal.isOpen} onClose={viewModal.onClose} />
    </Box>
  );
}
