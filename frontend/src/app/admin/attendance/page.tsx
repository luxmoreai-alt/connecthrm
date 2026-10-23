"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Spinner,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  Tabs,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { Check, Eye, Pencil, RefreshCcw, Search, X } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import {
  attendanceApi,
  type AdminAttendanceDayDetailsResponse,
  type AdminAttendanceRecord,
  type AdminAttendanceResponse,
  type AttendanceStatusType,
  type EmployeeAttendanceAccessOverride,
  type MonthlyAttendanceResponse,
  type PermissionRequest,
  type RegularizationRequest,
} from "@/api/attendance.api";
import { employeeApi } from "@/api/employee.api";
import { getAssetUrl } from "@/lib/api";

const STATUS_COLORS: Record<AttendanceStatusType, { bg: string; color: string; label: string }> = {
  PRESENT: { bg: "#E6F9F0", color: "#0D7C47", label: "Present" },
  LATE: { bg: "#FFF8E1", color: "#9E6A00", label: "Late" },
  ABSENT: { bg: "#FEE7E7", color: "#C41E3A", label: "Absent" },
  HALF_DAY: { bg: "#FFF3E0", color: "#A76200", label: "Half Day" },
  LEAVE: { bg: "#EDF0FF", color: "#3A4AB1", label: "Leave" },
  HOLIDAY: { bg: "#ECF7EC", color: "#1E8E3E", label: "Holiday" },
  WEEK_OFF: { bg: "#F3EEFF", color: "#6A42C2", label: "Week Off" },
  NOT_STARTED: { bg: "#F5F7FB", color: "#62708B", label: "Not Started" },
  MISSED_CHECK_IN: { bg: "#FFEAE6", color: "#BF3D1F", label: "Missed In" },
  PERMISSION: { bg: "#EAF7FF", color: "#0B68A6", label: "Permission" },
  REGULARIZED: { bg: "#FFF5EB", color: "#A45B1A", label: "Regularized" },
  LOP: { bg: "#FDECEC", color: "#AE1F44", label: "LOP" },
  MISSING_PUNCH: { bg: "#FFF0ED", color: "#C4472A", label: "Missing Punch" },
  EARLY_OUT: { bg: "#FFF3E0", color: "#B36B00", label: "Early Out" },
  OVERTIME: { bg: "#EAFBF5", color: "#0C8A61", label: "Overtime" },
};

const SUMMARY_STATUSES: AttendanceStatusType[] = [
  "PRESENT",
  "LATE",
  "HALF_DAY",
  "LOP",
  "LEAVE",
  "WEEK_OFF",
  "HOLIDAY",
  "NOT_STARTED",
];

const FILTER_STATUSES: AttendanceStatusType[] = [
  "PRESENT",
  "LATE",
  "HALF_DAY",
  "LOP",
  "LEAVE",
  "WEEK_OFF",
  "HOLIDAY",
  "NOT_STARTED",
  "PERMISSION",
  "REGULARIZED",
];

const DEFAULT_OVERRIDE_FORM = {
  overrideMode: "ORG_DEFAULT" as "ORG_DEFAULT" | "GEO_FENCE_ONLY" | "REMOTE_ALLOWED" | "HYBRID",
  geoFenceExempt: false,
  remotePunchAllowed: "INHERIT" as "INHERIT" | "YES" | "NO",
  reason: "",
  effectiveFrom: "",
  effectiveUntil: "",
  active: true,
};

function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatMinutes(total: number): string {
  if (!total) return "-";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDateLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function requestBadge(status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED") {
  if (status === "APPROVED") return { bg: "#EAF8F0", color: "#0F7A46" };
  if (status === "REJECTED") return { bg: "#FDECEC", color: "#AE1F44" };
  if (status === "CANCELLED") return { bg: "#F4F6FA", color: "#5D6983" };
  return { bg: "#FFF8E1", color: "#9E6A00" };
}

function AdminTab({ label, count }: { label: string; count: number }) {
  return (
    <Tab
      border="1px solid"
      borderColor="surface.border"
      borderRadius="full"
      px={3}
      py={1.5}
      fontSize="sm"
      fontWeight="600"
      gap={2}
      _selected={{ bg: "brand.500", color: "white", borderColor: "brand.500" }}
      _focusVisible={{ boxShadow: "none" }}
    >
      <Text>{label}</Text>
      <Badge borderRadius="full" px={2} bg="whiteAlpha.700" color="currentColor">{count}</Badge>
    </Tab>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box border="1px solid" borderColor="surface.border" borderRadius="md" px={2.5} py={2}>
      <Text fontSize="10px" textTransform="uppercase" color="text.muted">{label}</Text>
      <Text fontSize="sm" fontWeight="700">{value}</Text>
    </Box>
  );
}

export default function AdminAttendancePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");

  const [data, setData] = useState<AdminAttendanceResponse | null>(null);
  const [regularizations, setRegularizations] = useState<RegularizationRequest[]>([]);
  const [regularizationStatus, setRegularizationStatus] = useState<"ALL" | RegularizationRequest["status"]>("ALL");
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  const [accessOverrides, setAccessOverrides] = useState<EmployeeAttendanceAccessOverride[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<Array<{ userId: string; firstName: string; lastName: string; empId: string | null }>>([]);

  const [selectedRecord, setSelectedRecord] = useState<AdminAttendanceRecord | null>(null);
  const [dayDetailDate, setDayDetailDate] = useState(date);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [dayDetail, setDayDetail] = useState<AdminAttendanceDayDetailsResponse | null>(null);
  const [monthly, setMonthly] = useState<MonthlyAttendanceResponse | null>(null);
  const [monthlyEmployeeName, setMonthlyEmployeeName] = useState("");
  const [selectedRegularization, setSelectedRegularization] = useState<RegularizationRequest | null>(null);

  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatusType>("PRESENT");
  const [overrideReason, setOverrideReason] = useState("");
  const [manualCheckIn, setManualCheckIn] = useState("");
  const [manualCheckOut, setManualCheckOut] = useState("");
  const [manualStatus, setManualStatus] = useState<AttendanceStatusType | "">("");
  const [manualReason, setManualReason] = useState("");

  const [overrideEmployeeId, setOverrideEmployeeId] = useState("");
  const [overridePolicyForm, setOverridePolicyForm] = useState(DEFAULT_OVERRIDE_FORM);

  const overrideModal = useDisclosure();
  const manualModal = useDisclosure();
  const monthlyModal = useDisclosure();
  const dayDetailDrawer = useDisclosure();
  const accessOverrideModal = useDisclosure();
  const regularizationDetailModal = useDisclosure();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [attendance, pending, regularizationHistory, overrides] = await Promise.all([
        attendanceApi.getAdminAttendance(date, statusFilter || undefined, search || undefined, department || undefined),
        attendanceApi.getAdminPendingRequests(),
        attendanceApi.getAdminRegularizations(),
        attendanceApi.listEmployeeAccessOverrides(),
      ]);
      setData(attendance);
      setRegularizations(regularizationHistory);
      setPendingPermissions(pending.permissions);
      setAccessOverrides(overrides);
    } catch {
      toast({ title: "Failed to load attendance data", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [date, department, search, statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    employeeApi.dropdown().then(setEmployeeOptions).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!overrideEmployeeId) return;
    attendanceApi.getEmployeeAccessOverride(overrideEmployeeId).then((res) => {
      if (!res.override) {
        setOverridePolicyForm(DEFAULT_OVERRIDE_FORM);
        return;
      }
      setOverridePolicyForm({
        overrideMode: (res.override.overrideMode as typeof DEFAULT_OVERRIDE_FORM.overrideMode) || "ORG_DEFAULT",
        geoFenceExempt: Boolean(res.override.geoFenceExempt),
        remotePunchAllowed: res.override.remotePunchAllowed == null ? "INHERIT" : res.override.remotePunchAllowed ? "YES" : "NO",
        reason: res.override.reason || "",
        effectiveFrom: res.override.effectiveFrom || "",
        effectiveUntil: res.override.effectiveUntil || "",
        active: Boolean(res.override.active),
      });
    }).catch(() => undefined);
  }, [overrideEmployeeId]);

  const summaryCards = useMemo(() => {
    const summary = data?.summary ?? {};
    return SUMMARY_STATUSES.map((k) => ({ key: k, count: summary[k] ?? 0, style: STATUS_COLORS[k] }));
  }, [data]);

  const tabCounts = useMemo(() => ({
    register: data?.records.length ?? 0,
    regularizations: regularizations.length,
    permissions: pendingPermissions.length,
    overrides: accessOverrides.length,
  }), [accessOverrides.length, data?.records.length, pendingPermissions.length, regularizations.length]);

  const visibleRegularizations = useMemo(
    () => regularizationStatus === "ALL"
      ? regularizations
      : regularizations.filter((request) => request.status === regularizationStatus),
    [regularizationStatus, regularizations],
  );

  const refresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const openDayDetail = async (employeeId: string, targetDate: string, row?: AdminAttendanceRecord) => {
    setDayDetailDate(targetDate);
    setSelectedRecord(row ?? null);
    setDayDetailLoading(true);
    dayDetailDrawer.onOpen();
    try {
      const detail = await attendanceApi.getAdminEmployeeDay(employeeId, targetDate);
      setDayDetail(detail);
      if (!row) {
        setSelectedRecord({
          ...detail.attendance,
          employeeName: detail.employee.name,
          employeeCode: detail.employee.employeeCode,
          email: detail.employee.email,
          department: detail.employee.department,
          designation: detail.employee.designation,
        });
      }
    } catch {
      toast({ title: "Failed to load employee day details", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setDayDetailLoading(false);
    }
  };

  const openMonthly = async (row: AdminAttendanceRecord) => {
    try {
      const d = new Date(`${date}T00:00:00`);
      const res = await attendanceApi.getAdminEmployeeMonthly(row.employeeId, d.getFullYear(), d.getMonth() + 1);
      setMonthly(res);
      setMonthlyEmployeeName(row.employeeName);
      monthlyModal.onOpen();
    } catch {
      toast({ title: "Failed to load monthly summary", status: "error", duration: 2500, isClosable: true, position: "top-right" });
    }
  };

  const handleOverride = async () => {
    if (!selectedRecord || !overrideReason.trim()) return;
    setActionLoading(true);
    try {
      await attendanceApi.overrideStatus(selectedRecord.employeeId, { date: dayDetailDate, status: overrideStatus, reason: overrideReason });
      overrideModal.onClose();
      setOverrideReason("");
      await refresh();
      if (dayDetailDrawer.isOpen) await openDayDetail(selectedRecord.employeeId, dayDetailDate, selectedRecord);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualEntry = async () => {
    if (!selectedRecord) return;
    setActionLoading(true);
    try {
      await attendanceApi.manualEntry(selectedRecord.employeeId, {
        date: dayDetailDate,
        firstCheckInAt: manualCheckIn ? new Date(`${dayDetailDate}T${manualCheckIn}`).toISOString() : undefined,
        lastCheckOutAt: manualCheckOut ? new Date(`${dayDetailDate}T${manualCheckOut}`).toISOString() : undefined,
        status: manualStatus || undefined,
        reason: manualReason || undefined,
      });
      manualModal.onClose();
      setManualCheckIn("");
      setManualCheckOut("");
      setManualStatus("");
      setManualReason("");
      await refresh();
      if (dayDetailDrawer.isOpen) await openDayDetail(selectedRecord.employeeId, dayDetailDate, selectedRecord);
    } finally {
      setActionLoading(false);
    }
  };

  const reviewRegularization = async (id: string, approved: boolean) => {
    setActionLoading(true);
    try {
      await attendanceApi.reviewRegularization(id, { approved });
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  const openRegularizationDetails = (request: RegularizationRequest) => {
    setSelectedRegularization(request);
    regularizationDetailModal.onOpen();
  };

  const reviewPermission = async (id: string, approved: boolean) => {
    setActionLoading(true);
    try {
      await attendanceApi.reviewPermission(id, { approved });
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  const saveAccessOverride = async () => {
    if (!overrideEmployeeId) return;
    setActionLoading(true);
    try {
      await attendanceApi.saveEmployeeAccessOverride(overrideEmployeeId, {
        overrideMode: overridePolicyForm.overrideMode,
        geoFenceExempt: overridePolicyForm.geoFenceExempt,
        remotePunchAllowed: overridePolicyForm.remotePunchAllowed === "INHERIT" ? null : overridePolicyForm.remotePunchAllowed === "YES",
        reason: overridePolicyForm.reason || undefined,
        effectiveFrom: overridePolicyForm.effectiveFrom || undefined,
        effectiveUntil: overridePolicyForm.effectiveUntil || undefined,
        active: overridePolicyForm.active,
      });
      accessOverrideModal.onClose();
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <Flex justify="center" align="center" minH="420px"><Spinner size="lg" color="brand.400" /></Flex>;
  }

  return (
    <Box>
      <PageHeader title="Attendance Management" subtitle="Daily register, approvals, and employee timeline controls" />

      <SectionCard noPadding mb={4}>
        <Flex p={4} gap={3} flexWrap="wrap" align="center" justify="space-between">
          <HStack spacing={3} flexWrap="wrap">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} maxW="170px" />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="All statuses" maxW="180px">
              {FILTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_COLORS[s].label}</option>)}
            </Select>
            <InputGroup maxW="240px">
              <InputLeftElement pointerEvents="none"><Search size={14} /></InputLeftElement>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" />
            </InputGroup>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" maxW="170px" />
          </HStack>
          <HStack>
            <Button size="sm" variant="ghost" onClick={() => { setStatusFilter(""); setSearch(""); setDepartment(""); }}>Reset</Button>
            <Button size="sm" variant="outline" leftIcon={<RefreshCcw size={14} />} onClick={refresh} isLoading={refreshing}>Refresh</Button>
          </HStack>
        </Flex>
      </SectionCard>

      <SimpleGrid columns={{ base: 2, md: 4, xl: 8 }} spacing={3} mb={4}>
        {summaryCards.map((item) => (
          <Box key={item.key} border="1px solid" borderColor="surface.border" borderRadius="xl" p={3} bg="white">
            <Text fontSize="10px" textTransform="uppercase" color="text.muted">{item.style.label}</Text>
            <Badge mt={1.5} bg={item.style.bg} color={item.style.color} borderRadius="full">{item.count}</Badge>
          </Box>
        ))}
      </SimpleGrid>

      <SectionCard noPadding>
        <Tabs isLazy variant="unstyled">
          <TabList px={4} pt={4} gap={2} flexWrap="wrap">
            <AdminTab label="Daily Register" count={tabCounts.register} />
            <AdminTab label="Regularization History" count={tabCounts.regularizations} />
            <AdminTab label="Pending Permissions" count={tabCounts.permissions} />
            <AdminTab label="Access Overrides" count={tabCounts.overrides} />
          </TabList>
          <TabPanels>
            <TabPanel pt={4}>
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead><Tr><Th>Employee</Th><Th>Dept</Th><Th>In</Th><Th>Out</Th><Th>Active</Th><Th>Break</Th><Th>Late</Th><Th>Early Out</Th><Th>OT</Th><Th>Status</Th><Th textAlign="right">Actions</Th></Tr></Thead>
                  <Tbody>
                    {(data?.records ?? []).length === 0 ? (
                      <Tr><Td colSpan={11} textAlign="center" py={7}><Text color="text.muted" fontSize="sm">No records found.</Text></Td></Tr>
                    ) : (
                      (data?.records ?? []).map((r) => {
                        const s = STATUS_COLORS[r.status] || STATUS_COLORS.NOT_STARTED;
                        return (
                          <Tr key={`${r.employeeId}-${r.date}`}>
                            <Td><Text fontWeight="700">{r.employeeName}</Text><Text fontSize="xs" color="text.muted">{r.employeeCode || "-"}</Text></Td>
                            <Td><Text fontSize="sm">{r.department || "-"}</Text><Text fontSize="xs" color="text.muted">{r.designation || "-"}</Text></Td>
                            <Td>{formatTime(r.firstCheckInAt)}</Td>
                            <Td>{formatTime(r.lastCheckOutAt)}</Td>
                            <Td><Text fontWeight="600">{formatMinutes(r.totalWorkMinutes)}</Text></Td>
                            <Td>{formatMinutes(r.totalBreakMinutes)}</Td>
                            <Td>{formatMinutes(r.lateMinutes)}</Td>
                            <Td>{formatMinutes(r.earlyOutMinutes)}</Td>
                            <Td>{formatMinutes(r.overtimeMinutes)}</Td>
                            <Td><Badge bg={s.bg} color={s.color} borderRadius="full">{s.label}</Badge></Td>
                            <Td textAlign="right">
                              <HStack spacing={1} justify="flex-end">
                                <IconButton aria-label="View" icon={<Eye size={14} />} size="xs" variant="ghost" onClick={() => openDayDetail(r.employeeId, date, r)} />
                                <IconButton aria-label="Override" icon={<Pencil size={14} />} size="xs" variant="ghost" onClick={() => { setSelectedRecord(r); setDayDetailDate(date); setOverrideStatus(r.status); setOverrideReason(""); overrideModal.onOpen(); }} />
                                <Button size="xs" variant="ghost" onClick={() => { setSelectedRecord(r); setDayDetailDate(date); manualModal.onOpen(); }}>Manual</Button>
                                <Button size="xs" variant="ghost" onClick={() => openMonthly(r)}>Monthly</Button>
                              </HStack>
                            </Td>
                          </Tr>
                        );
                      })
                    )}
                  </Tbody>
                </Table>
              </Box>
            </TabPanel>

            <TabPanel pt={4}>
              <Flex mb={3} justify="space-between" align="center" gap={3} flexWrap="wrap">
                <Text fontSize="sm" color="text.muted">All submitted regularization requests are retained here.</Text>
                <Select
                  size="sm"
                  maxW="190px"
                  value={regularizationStatus}
                  onChange={(e) => setRegularizationStatus(e.target.value as typeof regularizationStatus)}
                  aria-label="Filter regularization history by status"
                >
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </Flex>
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead><Tr><Th>Employee</Th><Th>Date</Th><Th>Type</Th><Th>Requested</Th><Th>Reason</Th><Th>Status</Th><Th textAlign="right">Actions</Th></Tr></Thead>
                  <Tbody>
                    {visibleRegularizations.length === 0 ? <Tr><Td colSpan={7} textAlign="center" py={7}><Text color="text.muted">No regularization requests found.</Text></Td></Tr> : visibleRegularizations.map((r) => {
                      const b = requestBadge(r.status);
                      return (
                        <Tr key={r.id}>
                          <Td>{r.employeeName || r.employeeId}</Td>
                          <Td>{formatDateLabel(r.date)}</Td>
                          <Td>{r.requestType.replace(/_/g, " ")}</Td>
                          <Td>{r.requestedInTime ? formatTime(r.requestedInTime) : "-"} / {r.requestedOutTime ? formatTime(r.requestedOutTime) : "-"}</Td>
                          <Td maxW="340px">
                            <Box as="button" type="button" textAlign="left" w="100%" onClick={() => openRegularizationDetails(r)} _hover={{ color: "brand.600" }}>
                              <Text noOfLines={2}>{r.reason}</Text>
                              <Text fontSize="xs" color="brand.500" fontWeight="600">View full reason</Text>
                            </Box>
                          </Td>
                          <Td><Badge bg={b.bg} color={b.color} borderRadius="full">{r.status}</Badge></Td>
                          <Td textAlign="right">
                            <HStack justify="flex-end" spacing={1}>
                              <IconButton aria-label="View regularization details" icon={<Eye size={14} />} size="xs" variant="ghost" onClick={() => openRegularizationDetails(r)} />
                              {r.status === "PENDING" && <>
                                <Button size="xs" colorScheme="green" leftIcon={<Check size={12} />} onClick={() => reviewRegularization(r.id, true)} isLoading={actionLoading}>Approve</Button>
                                <Button size="xs" colorScheme="red" variant="outline" leftIcon={<X size={12} />} onClick={() => reviewRegularization(r.id, false)} isLoading={actionLoading}>Reject</Button>
                              </>}
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            </TabPanel>

            <TabPanel pt={4}>
              <Table size="sm">
                <Thead><Tr><Th>Employee</Th><Th>Date</Th><Th>From-To</Th><Th>Duration</Th><Th>Reason</Th><Th>Status</Th><Th textAlign="right">Actions</Th></Tr></Thead>
                <Tbody>
                  {pendingPermissions.length === 0 ? <Tr><Td colSpan={7} textAlign="center" py={7}><Text color="text.muted">No pending permissions.</Text></Td></Tr> : pendingPermissions.map((p) => {
                    const b = requestBadge(p.status);
                    return (
                      <Tr key={p.id}>
                        <Td>{p.employeeName || p.employeeId}</Td>
                        <Td>{formatDateLabel(p.date)}</Td>
                        <Td>{p.fromTime} - {p.toTime}</Td>
                        <Td>{formatMinutes(p.totalMinutes)}</Td>
                        <Td><Text noOfLines={2}>{p.reason}</Text></Td>
                        <Td><Badge bg={b.bg} color={b.color} borderRadius="full">{p.status}</Badge></Td>
                        <Td textAlign="right"><HStack justify="flex-end" spacing={1}><IconButton aria-label="View" icon={<Eye size={14} />} size="xs" variant="ghost" onClick={() => openDayDetail(p.employeeId, p.date)} /><Button size="xs" colorScheme="green" leftIcon={<Check size={12} />} onClick={() => reviewPermission(p.id, true)} isLoading={actionLoading}>Approve</Button><Button size="xs" colorScheme="red" variant="outline" leftIcon={<X size={12} />} onClick={() => reviewPermission(p.id, false)} isLoading={actionLoading}>Reject</Button></HStack></Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TabPanel>

            <TabPanel pt={4}>
              <Flex mb={3} justify="flex-end"><Button size="sm" bg="brand.500" color="white" _hover={{ bg: "brand.600" }} onClick={() => { setOverrideEmployeeId(""); setOverridePolicyForm(DEFAULT_OVERRIDE_FORM); accessOverrideModal.onOpen(); }}>Add Override</Button></Flex>
              <Table size="sm">
                <Thead><Tr><Th>Employee</Th><Th>Mode</Th><Th>Remote</Th><Th>Geo Exempt</Th><Th>Start</Th><Th>End</Th><Th>Reason</Th><Th>Active</Th><Th textAlign="right">Actions</Th></Tr></Thead>
                <Tbody>
                  {accessOverrides.length === 0 ? <Tr><Td colSpan={9} textAlign="center" py={7}><Text color="text.muted">No access overrides configured.</Text></Td></Tr> : accessOverrides.map((o) => (
                    <Tr key={o.id}>
                      <Td>{o.employeeName}</Td>
                      <Td>{o.overrideMode.replace(/_/g, " ")}</Td>
                      <Td>{o.remotePunchAllowed == null ? "Inherit" : o.remotePunchAllowed ? "Allowed" : "Blocked"}</Td>
                      <Td>{o.geoFenceExempt ? "Yes" : "No"}</Td>
                      <Td>{o.effectiveFrom || "-"}</Td>
                      <Td>{o.effectiveUntil || "-"}</Td>
                      <Td><Text noOfLines={2}>{o.reason || "-"}</Text></Td>
                      <Td><Badge borderRadius="full" bg={o.active ? "#EEF6FF" : "#F4F6FA"} color={o.active ? "#3B4AA6" : "#62708B"}>{o.active ? "Active" : "Inactive"}</Badge></Td>
                      <Td textAlign="right"><HStack justify="flex-end" spacing={1}><IconButton aria-label="Edit" icon={<Pencil size={14} />} size="xs" variant="ghost" onClick={() => { setOverrideEmployeeId(o.employeeId); accessOverrideModal.onOpen(); }} /><Button size="xs" variant="outline" colorScheme="red" onClick={() => attendanceApi.clearEmployeeAccessOverride(o.employeeId).then(refresh)}>Clear</Button></HStack></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </SectionCard>

      <Modal isOpen={regularizationDetailModal.isOpen} onClose={regularizationDetailModal.onClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">Regularization Request Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedRegularization && (() => {
              const badge = requestBadge(selectedRegularization.status);
              return (
                <Flex direction="column" gap={4}>
                  <Flex justify="space-between" gap={3} align="flex-start">
                    <Box>
                      <Text fontWeight="700">{selectedRegularization.employeeName || selectedRegularization.employeeId}</Text>
                      <Text fontSize="xs" color="text.muted">{selectedRegularization.employeeCode || "No employee code"}</Text>
                    </Box>
                    <Badge bg={badge.bg} color={badge.color} borderRadius="full">{selectedRegularization.status}</Badge>
                  </Flex>
                  <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
                    <Metric label="Attendance Date" value={formatDateLabel(selectedRegularization.date)} />
                    <Metric label="Request Type" value={selectedRegularization.requestType.replace(/_/g, " ")} />
                    <Metric label="Requested In" value={formatTime(selectedRegularization.requestedInTime)} />
                    <Metric label="Requested Out" value={formatTime(selectedRegularization.requestedOutTime)} />
                    <Metric label="Submitted" value={formatDateTime(selectedRegularization.createdAt)} />
                    <Metric label="Reviewed" value={formatDateTime(selectedRegularization.reviewedAt)} />
                  </SimpleGrid>
                  <Box border="1px solid" borderColor="surface.border" borderRadius="xl" p={4}>
                    <Text fontSize="xs" textTransform="uppercase" color="text.muted" mb={2}>Full Reason</Text>
                    <Text whiteSpace="pre-wrap" overflowWrap="anywhere">{selectedRegularization.reason}</Text>
                  </Box>
                  {selectedRegularization.adminRemarks && (
                    <Box border="1px solid" borderColor="surface.border" borderRadius="xl" p={4} bg="gray.50">
                      <Text fontSize="xs" textTransform="uppercase" color="text.muted" mb={2}>Admin Remarks</Text>
                      <Text whiteSpace="pre-wrap" overflowWrap="anywhere">{selectedRegularization.adminRemarks}</Text>
                    </Box>
                  )}
                </Flex>
              );
            })()}
          </ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            {selectedRegularization && <Button size="sm" variant="outline" onClick={() => {
              regularizationDetailModal.onClose();
              openDayDetail(selectedRegularization.employeeId, selectedRegularization.date);
            }}>View Attendance Day</Button>}
            {selectedRegularization?.status === "PENDING" && <>
              <Button size="sm" colorScheme="green" leftIcon={<Check size={14} />} isLoading={actionLoading} onClick={async () => {
                await reviewRegularization(selectedRegularization.id, true);
                regularizationDetailModal.onClose();
              }}>Approve</Button>
              <Button size="sm" colorScheme="red" variant="outline" leftIcon={<X size={14} />} isLoading={actionLoading} onClick={async () => {
                await reviewRegularization(selectedRegularization.id, false);
                regularizationDetailModal.onClose();
              }}>Reject</Button>
            </>}
            <Button size="sm" variant="ghost" onClick={regularizationDetailModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Drawer isOpen={dayDetailDrawer.isOpen} placement="right" size="md" onClose={dayDetailDrawer.onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Employee Day Attendance</DrawerHeader>
          <DrawerBody>
            {dayDetailLoading ? (
              <Flex minH="260px" justify="center" align="center"><Spinner color="brand.500" /></Flex>
            ) : !dayDetail ? (
              <Text color="text.muted">No details.</Text>
            ) : (
              <Flex direction="column" gap={4}>
                <Box border="1px solid" borderColor="surface.border" borderRadius="xl" p={3}>
                  <Text fontWeight="700">{dayDetail.employee.name}</Text>
                  <Text fontSize="xs" color="text.muted">{dayDetail.employee.employeeCode || "-"} • {dayDetail.employee.department || "-"}</Text>
                  <Badge mt={2} borderRadius="full">{formatDateLabel(dayDetail.date)}</Badge>
                </Box>
                <SimpleGrid columns={2} spacing={2}>
                  <Metric label="First In" value={formatTime(dayDetail.attendance.firstCheckInAt)} />
                  <Metric label="Last Out" value={formatTime(dayDetail.attendance.lastCheckOutAt)} />
                  <Metric label="Active" value={formatMinutes(dayDetail.attendance.totalWorkMinutes)} />
                  <Metric label="Break" value={formatMinutes(dayDetail.attendance.totalBreakMinutes)} />
                  <Metric label="Late By" value={formatMinutes(dayDetail.attendance.lateMinutes)} />
                  <Metric label="Early Out" value={formatMinutes(dayDetail.attendance.earlyOutMinutes)} />
                </SimpleGrid>
                <Box border="1px solid" borderColor="surface.border" borderRadius="xl" p={3}>
                  <Text fontSize="xs" textTransform="uppercase" color="text.muted" mb={2}>Punch Timeline</Text>
                  {dayDetail.punches.length === 0 ? (
                    <Text color="text.muted" fontSize="sm">No punches recorded.</Text>
                  ) : (
                    <Flex direction="column" gap={2}>
                      {dayDetail.punches.map((p) => (
                        <HStack key={p.id} justify="space-between" align="center" border="1px solid" borderColor="surface.border" borderRadius="md" px={2.5} py={2}>
                          <HStack spacing={3}>
                            {p.photoUrl ? (
                              <Box as="a" href={getAssetUrl(p.photoUrl)} target="_blank" rel="noreferrer" flexShrink={0}>
                                <Image
                                  src={getAssetUrl(p.photoUrl)}
                                  alt={`${p.type === "CHECK_IN" ? "Punch in" : "Punch out"} verification`}
                                  boxSize="52px"
                                  objectFit="cover"
                                  borderRadius="md"
                                  border="1px solid"
                                  borderColor="surface.border"
                                />
                              </Box>
                            ) : p.type === "CHECK_IN" ? (
                              <Flex boxSize="52px" bg="gray.50" borderRadius="md" align="center" justify="center" flexShrink={0}>
                                <Text fontSize="9px" color="text.muted" textAlign="center">No photo</Text>
                              </Flex>
                            ) : null}
                            <Box>
                              <Text fontSize="sm" fontWeight="600">{p.type === "CHECK_IN" ? "Punch In" : "Punch Out"} {formatTime(p.time)}</Text>
                              {p.photoUrl && <Text fontSize="xs" color="brand.500">Click photo to view</Text>}
                            </Box>
                          </HStack>
                          <Badge borderRadius="full" bg={p.isInsideOffice ? "#EAF8F0" : "#FFF3E8"} color={p.isInsideOffice ? "#0F7A46" : "#C7681B"}>{p.isInsideOffice ? "Inside" : "Remote/Outside"}</Badge>
                        </HStack>
                      ))}
                    </Flex>
                  )}
                </Box>
              </Flex>
            )}
          </DrawerBody>
          <DrawerFooter borderTop="1px solid" borderColor="surface.border">
            <HStack>
              <Button size="sm" variant="outline" onClick={() => selectedRecord && overrideModal.onOpen()} isDisabled={!selectedRecord}>Override Status</Button>
              <Button size="sm" variant="outline" onClick={() => selectedRecord && manualModal.onOpen()} isDisabled={!selectedRecord}>Manual Entry</Button>
            </HStack>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Modal isOpen={overrideModal.isOpen} onClose={overrideModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">Override Attendance</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction="column" gap={3}>
              <Select value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value as AttendanceStatusType)}>
                {FILTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_COLORS[s].label}</option>)}
              </Select>
              <Textarea rows={3} placeholder="Reason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </Flex>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={overrideModal.onClose}>Cancel</Button>
            <Button bg="brand.500" color="white" _hover={{ bg: "brand.600" }} onClick={handleOverride} isLoading={actionLoading}>Save</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={manualModal.isOpen} onClose={manualModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">Manual Entry</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction="column" gap={3}>
              <SimpleGrid columns={2} spacing={2}>
                <Input type="time" value={manualCheckIn} onChange={(e) => setManualCheckIn(e.target.value)} />
                <Input type="time" value={manualCheckOut} onChange={(e) => setManualCheckOut(e.target.value)} />
              </SimpleGrid>
              <Select placeholder="Optional status" value={manualStatus} onChange={(e) => setManualStatus(e.target.value as AttendanceStatusType | "")}>
                {FILTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_COLORS[s].label}</option>)}
              </Select>
              <Textarea rows={3} placeholder="Reason" value={manualReason} onChange={(e) => setManualReason(e.target.value)} />
            </Flex>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={manualModal.onClose}>Cancel</Button>
            <Button bg="brand.500" color="white" _hover={{ bg: "brand.600" }} onClick={handleManualEntry} isLoading={actionLoading}>Save</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={accessOverrideModal.isOpen} onClose={accessOverrideModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">Employee Access Override</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction="column" gap={3}>
              <Select placeholder="Select employee" value={overrideEmployeeId} onChange={(e) => setOverrideEmployeeId(e.target.value)}>
                {employeeOptions.map((emp) => <option key={emp.userId} value={emp.userId}>{emp.firstName} {emp.lastName} {emp.empId ? `(${emp.empId})` : ""}</option>)}
              </Select>
              <Select value={overridePolicyForm.overrideMode} onChange={(e) => setOverridePolicyForm((p) => ({ ...p, overrideMode: e.target.value as typeof p.overrideMode }))}>
                <option value="ORG_DEFAULT">Use Organization Default</option>
                <option value="GEO_FENCE_ONLY">Geo-fence Only</option>
                <option value="REMOTE_ALLOWED">Remote Allowed</option>
                <option value="HYBRID">Hybrid</option>
              </Select>
              <Select value={overridePolicyForm.remotePunchAllowed} onChange={(e) => setOverridePolicyForm((p) => ({ ...p, remotePunchAllowed: e.target.value as typeof p.remotePunchAllowed }))}>
                <option value="INHERIT">Remote Punch: Inherit</option>
                <option value="YES">Remote Punch: Allowed</option>
                <option value="NO">Remote Punch: Blocked</option>
              </Select>
              <HStack justify="space-between"><Text fontSize="sm">Geo-fence exempt</Text><Switch isChecked={overridePolicyForm.geoFenceExempt} onChange={(e) => setOverridePolicyForm((p) => ({ ...p, geoFenceExempt: e.target.checked }))} /></HStack>
              <SimpleGrid columns={2} spacing={2}>
                <Input type="date" value={overridePolicyForm.effectiveFrom} onChange={(e) => setOverridePolicyForm((p) => ({ ...p, effectiveFrom: e.target.value }))} />
                <Input type="date" value={overridePolicyForm.effectiveUntil} onChange={(e) => setOverridePolicyForm((p) => ({ ...p, effectiveUntil: e.target.value }))} />
              </SimpleGrid>
              <Textarea rows={3} placeholder="Reason" value={overridePolicyForm.reason} onChange={(e) => setOverridePolicyForm((p) => ({ ...p, reason: e.target.value }))} />
              <HStack justify="space-between"><Text fontSize="sm">Override Active</Text><Switch isChecked={overridePolicyForm.active} onChange={(e) => setOverridePolicyForm((p) => ({ ...p, active: e.target.checked }))} /></HStack>
            </Flex>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={accessOverrideModal.onClose}>Cancel</Button>
            <Button bg="brand.500" color="white" _hover={{ bg: "brand.600" }} onClick={saveAccessOverride} isLoading={actionLoading} isDisabled={!overrideEmployeeId}>Save</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={monthlyModal.isOpen} onClose={monthlyModal.onClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">{monthlyEmployeeName || "Employee"} Monthly Summary</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {!monthly ? <Spinner size="sm" /> : (
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
                {monthly.metrics && Object.entries(monthly.metrics).map(([key, val]) => (
                  <Box key={key} border="1px solid" borderColor="surface.border" borderRadius="md" px={3} py={2}>
                    <Text fontSize="10px" textTransform="uppercase" color="text.muted">{key.replace(/([A-Z])/g, " $1")}</Text>
                    <Text fontSize="sm" fontWeight="700">{val}</Text>
                  </Box>
                ))}
              </SimpleGrid>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
