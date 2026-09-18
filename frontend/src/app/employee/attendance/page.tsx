"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  HStack,
  Input,
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
  Text,
  Textarea,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { Calendar, CalendarPlus, ChevronLeft, ChevronRight, FilePenLine, LogIn, LogOut, MapPin, RefreshCw, Sparkles, Timer } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import PunchCameraModal from "@/components/attendance/PunchCameraModal";
import {
  attendanceApi,
  type AttendanceAccessMode,
  type AttendanceDayDetailsResponse,
  type AttendanceRecord,
  type AttendanceStatusType,
  type MonthlyAttendanceResponse,
  type TodayAttendanceResponse,
} from "@/api/attendance.api";

const STATUS_STYLE: Record<AttendanceStatusType, { bg: string; color: string; label: string }> = {
  PRESENT: { bg: "#EAF8F0", color: "#0F7A46", label: "Present" },
  LATE: { bg: "#FFF9E8", color: "#9C6A06", label: "Late" },
  ABSENT: { bg: "#FEECEE", color: "#B73A50", label: "Absent" },
  HALF_DAY: { bg: "#FFF5E8", color: "#AD6A08", label: "Half Day" },
  LEAVE: { bg: "#EEF2FF", color: "#4052B3", label: "Leave" },
  HOLIDAY: { bg: "#EAF8EE", color: "#1F8A45", label: "Holiday" },
  WEEK_OFF: { bg: "#F3EEFF", color: "#6B46C1", label: "Weekly Off" },
  NOT_STARTED: { bg: "#F6F8FC", color: "#65748B", label: "Not Started" },
  MISSED_CHECK_IN: { bg: "#FEECEE", color: "#B73A50", label: "Missed In" },
  PERMISSION: { bg: "#EAF6FF", color: "#1E70AF", label: "Permission" },
  REGULARIZED: { bg: "#FFF5EA", color: "#9A5D24", label: "Regularized" },
  LOP: { bg: "#FCEEF2", color: "#AE2747", label: "LOP" },
  MISSING_PUNCH: { bg: "#FFF3E8", color: "#C7671B", label: "Missing Punch" },
  EARLY_OUT: { bg: "#FFF4EA", color: "#BE6C25", label: "Early Out" },
  OVERTIME: { bg: "#EAFBF5", color: "#138866", label: "Overtime" },
};

type CalendarCellVisual = {
  bg: string;
  codeColor: string;
  dateColor: string;
};

const NEUTRAL_CELL_STYLE: CalendarCellVisual = {
  bg: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
  codeColor: "#94A3B8",
  dateColor: "#64748B",
};

const MUTED_CELL_STYLE: CalendarCellVisual = {
  bg: "linear-gradient(180deg, #FAFBFF 0%, #F6F8FC 100%)",
  codeColor: "#CBD5E1",
  dateColor: "#94A3B8",
};

const STATUS_CELL_STYLE: Record<AttendanceStatusType, CalendarCellVisual> = {
  PRESENT: {
    bg: "linear-gradient(160deg, #F1FCF5 0%, #E3F7EC 100%)",
    codeColor: "#0F8A4B",
    dateColor: "#0F8A4B",
  },
  ABSENT: {
    bg: "linear-gradient(160deg, #FFF5F6 0%, #FDE8EC 100%)",
    codeColor: "#C23A4A",
    dateColor: "#C23A4A",
  },
  WEEK_OFF: {
    bg: "linear-gradient(160deg, #F7F4FF 0%, #EFE8FF 100%)",
    codeColor: "#6A42C2",
    dateColor: "#6A42C2",
  },
  HOLIDAY: {
    bg: "linear-gradient(160deg, #F2FBF4 0%, #E4F7E9 100%)",
    codeColor: "#1E8E3E",
    dateColor: "#1E8E3E",
  },
  LEAVE: {
    bg: "linear-gradient(160deg, #F1F4FF 0%, #E7ECFF 100%)",
    codeColor: "#3D55B8",
    dateColor: "#3D55B8",
  },
  HALF_DAY: {
    bg: "linear-gradient(160deg, #FFF9EE 0%, #FFF1DD 100%)",
    codeColor: "#B76A00",
    dateColor: "#B76A00",
  },
  LOP: {
    bg: "linear-gradient(160deg, #FFF5F7 0%, #FEE8ED 100%)",
    codeColor: "#B63B4F",
    dateColor: "#B63B4F",
  },
  MISSING_PUNCH: {
    bg: "linear-gradient(160deg, #FFF8EF 0%, #FFEFD9 100%)",
    codeColor: "#C7681B",
    dateColor: "#C7681B",
  },
  REGULARIZED: {
    bg: "linear-gradient(160deg, #FFF8EE 0%, #FEEFD9 100%)",
    codeColor: "#A26424",
    dateColor: "#A26424",
  },
  PERMISSION: {
    bg: "linear-gradient(160deg, #F1FAFF 0%, #E4F3FF 100%)",
    codeColor: "#1C74B7",
    dateColor: "#1C74B7",
  },
  LATE: {
    bg: "linear-gradient(160deg, #FFFBEE 0%, #FFF6D8 100%)",
    codeColor: "#A97800",
    dateColor: "#A97800",
  },
  EARLY_OUT: {
    bg: "linear-gradient(160deg, #FFF7F0 0%, #FFECDD 100%)",
    codeColor: "#C86A2A",
    dateColor: "#C86A2A",
  },
  OVERTIME: {
    bg: "linear-gradient(160deg, #F0FCF7 0%, #E2F8EE 100%)",
    codeColor: "#108A68",
    dateColor: "#108A68",
  },
  MISSED_CHECK_IN: {
    bg: "linear-gradient(160deg, #FFF5F6 0%, #FDE8EC 100%)",
    codeColor: "#C23A4A",
    dateColor: "#C23A4A",
  },
  NOT_STARTED: {
    bg: "linear-gradient(160deg, #FAFBFF 0%, #F4F7FC 100%)",
    codeColor: "#94A3B8",
    dateColor: "#94A3B8",
  },
};

const REGULARIZATION_TYPES = [
  "MISSING_PUNCH_IN",
  "MISSING_PUNCH_OUT",
  "LATE_PUNCH",
  "EARLY_OUT",
  "GEOFENCE_FAILURE",
  "INCORRECT_STATUS",
  "OTHER",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type FinalDisplayStatus =
  | "PRESENT"
  | "HALF_DAY"
  | "LOP"
  | "LEAVE"
  | "HOLIDAY"
  | "WEEK_OFF"
  | "NOT_STARTED";

const DISPLAY_STATUS_CODE_MAP: Partial<Record<FinalDisplayStatus, string>> = {
  PRESENT: "P",
  WEEK_OFF: "WO",
  HOLIDAY: "H",
  LOP: "LOP",
  HALF_DAY: "HD",
  NOT_STARTED: "NS",
  LEAVE: "L",
};

const LEGEND_ITEMS: Array<{ code: string; label: string; status: AttendanceStatusType }> = [
  { code: "P", label: "Present", status: "PRESENT" },
  { code: "HD", label: "Half Day", status: "HALF_DAY" },
  { code: "LOP", label: "Loss Of Pay", status: "LOP" },
  { code: "WO", label: "Weekly Off", status: "WEEK_OFF" },
  { code: "H", label: "Holiday", status: "HOLIDAY" },
  { code: "CL", label: "Casual Leave", status: "LEAVE" },
  { code: "SL", label: "Sick Leave", status: "LEAVE" },
  { code: "EL", label: "Emergency Leave", status: "LEAVE" },
  { code: "L", label: "Leave", status: "LEAVE" },
  { code: "LT", label: "Late (Insight)", status: "LATE" },
];

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMinutes(total: number): string {
  if (!total) return "-";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatAccessMode(mode?: AttendanceAccessMode): string {
  if (!mode) return "-";
  return mode.replace(/_/g, " ");
}

function getLeaveCode(record: AttendanceRecord): string {
  const leaveType = String(record?.derivedSummary?.leaveType ?? "").toUpperCase();
  if (leaveType === "CL") return "CL";
  if (leaveType === "SL") return "SL";
  if (leaveType === "EL") return "EL";
  if (leaveType === "LOP") return "LOP";
  return "L";
}

function getLeaveCellStyle(record: AttendanceRecord): CalendarCellVisual {
  const leaveType = String(record?.derivedSummary?.leaveType ?? "").toUpperCase();
  if (leaveType === "CL") {
    return { bg: "#EAF5FF", codeColor: "#2D6FA3", dateColor: "#2D6FA3" };
  }
  if (leaveType === "SL") {
    return { bg: "#EEF1FF", codeColor: "#4054B2", dateColor: "#4054B2" };
  }
  if (leaveType === "LOP") {
    return STATUS_CELL_STYLE.LOP;
  }
  return STATUS_CELL_STYLE.LEAVE;
}

function resolveFinalDisplayStatus(
  record: AttendanceRecord,
  date: string,
  todayDate: string,
): FinalDisplayStatus {
  if (record.dayType === "PRE_JOINING") return "NOT_STARTED";
  if (record.dayType === "HOLIDAY" || record.status === "HOLIDAY") return "HOLIDAY";
  if (record.dayType === "WEEK_OFF" || record.status === "WEEK_OFF") return "WEEK_OFF";
  if (record.dayType === "LEAVE" || record.status === "LEAVE") {
    const leaveType = String(record?.derivedSummary?.leaveType ?? "").toUpperCase();
    return leaveType === "LOP" ? "LOP" : "LEAVE";
  }

  if (date > todayDate) return "NOT_STARTED";

  // Attendance status is finalized by the server (including policy changes,
  // permissions, regularization and admin overrides). Recomputing it in the
  // browser caused employee and admin calendars to show different dates.
  if (record.status === "PRESENT") return "PRESENT";
  if (record.status === "HALF_DAY") return "HALF_DAY";
  if (record.status === "LOP" || record.status === "ABSENT") return "LOP";
  if (["LATE", "MISSED_CHECK_IN", "MISSING_PUNCH", "EARLY_OUT"].includes(record.status)) return "HALF_DAY";
  if (["PERMISSION", "REGULARIZED", "OVERTIME"].includes(record.status)) return "PRESENT";
  if (record.status === "NOT_STARTED") return "LOP";
  return "NOT_STARTED";
}

function getStatusCode(
  displayStatus: FinalDisplayStatus,
  record: AttendanceRecord,
  isCurrentDate: boolean,
): string {
  if (displayStatus === "LEAVE") return getLeaveCode(record);
  if (displayStatus === "NOT_STARTED" && !isCurrentDate) return "";
  return DISPLAY_STATUS_CODE_MAP[displayStatus] ?? "";
}

async function getCoordinates(): Promise<{ latitude?: number; longitude?: number }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return {};
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => resolve({}),
      { timeout: 7000, maximumAge: 20000 },
    );
  });
}

export default function EmployeeAttendancePage() {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [todayState, setTodayState] = useState<TodayAttendanceResponse | null>(null);
  const [monthly, setMonthly] = useState<MonthlyAttendanceResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<AttendanceDayDetailsResponse | null>(null);
  const [activeMonth, setActiveMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));

  const regularizationModal = useDisclosure();
  const permissionModal = useDisclosure();
  const punchCamera = useDisclosure();

  const [regularizationForm, setRegularizationForm] = useState({
    date: toDateInput(new Date()),
    requestType: "MISSING_PUNCH_OUT" as (typeof REGULARIZATION_TYPES)[number],
    requestedInTime: "",
    requestedOutTime: "",
    reason: "",
  });
  const [permissionForm, setPermissionForm] = useState({
    date: toDateInput(new Date()),
    fromTime: "",
    toTime: "",
    reason: "",
  });

  const loadSelectedDay = useCallback(async (date: string) => {
    const details = await attendanceApi.getMyDayAttendance(date);
    setSelectedDay(details);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [state, monthData] = await Promise.all([
        attendanceApi.getMyState(),
        attendanceApi.getMyMonthlyAttendance(activeMonth.year, activeMonth.month),
      ]);
      setTodayState(state);
      setMonthly(monthData);

      const dateToLoad = selectedDate || toDateInput(new Date());
      await loadSelectedDay(dateToLoad);
    } catch {
      toast({
        title: "Failed to load attendance",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  }, [activeMonth.month, activeMonth.year, loadSelectedDay, selectedDate, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const submitPunch = async (photo?: File) => {
    if (!todayState) return;
    setSubmitting(true);
    try {
      const coords = await getCoordinates();
      const hasLocation = coords.latitude != null && coords.longitude != null;
      await attendanceApi.punchAction({
        punchType: todayState.nextPunchType,
        ...coords,
        remarks: hasLocation ? undefined : "Remote punch from attendance page",
        photo,
      });
      toast({
        title: todayState.nextPunchType === "CHECK_IN" ? "Punch in successful" : "Punch out successful",
        status: "success",
        duration: 2200,
        isClosable: true,
        position: "top-right",
      });
      punchCamera.onClose();
      await loadAll();
    } catch (err: any) {
      toast({
        title: "Punch failed",
        description: err?.message || "Unable to complete punch action",
        status: "error",
        duration: 3500,
        isClosable: true,
        position: "top-right",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePunch = () => {
    if (todayState?.nextPunchType === "CHECK_IN") {
      punchCamera.onOpen();
      return;
    }
    void submitPunch();
  };

  const handleRegularizationSubmit = async () => {
    if (!regularizationForm.reason.trim()) return;
    setSubmitting(true);
    try {
      await attendanceApi.createRegularization({
        date: regularizationForm.date,
        requestType: regularizationForm.requestType,
        requestedInTime: regularizationForm.requestedInTime
          ? new Date(`${regularizationForm.date}T${regularizationForm.requestedInTime}`).toISOString()
          : undefined,
        requestedOutTime: regularizationForm.requestedOutTime
          ? new Date(`${regularizationForm.date}T${regularizationForm.requestedOutTime}`).toISOString()
          : undefined,
        reason: regularizationForm.reason,
      });
      toast({
        title: "Regularization request submitted",
        status: "success",
        duration: 2500,
        isClosable: true,
        position: "top-right",
      });
      regularizationModal.onClose();
      setRegularizationForm((prev) => ({ ...prev, requestedInTime: "", requestedOutTime: "", reason: "" }));
      await loadAll();
    } catch (err: any) {
      toast({
        title: "Failed to submit regularization",
        description: err?.message || "Please try again",
        status: "error",
        duration: 3500,
        isClosable: true,
        position: "top-right",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermissionSubmit = async () => {
    if (!permissionForm.reason.trim() || !permissionForm.fromTime || !permissionForm.toTime) return;
    setSubmitting(true);
    try {
      await attendanceApi.createPermission(permissionForm);
      toast({
        title: "Permission request submitted",
        status: "success",
        duration: 2500,
        isClosable: true,
        position: "top-right",
      });
      permissionModal.onClose();
      setPermissionForm((prev) => ({ ...prev, fromTime: "", toTime: "", reason: "" }));
      await loadAll();
    } catch (err: any) {
      toast({
        title: "Failed to submit permission",
        description: err?.message || "Please try again",
        status: "error",
        duration: 3500,
        isClosable: true,
        position: "top-right",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const calendarCells = useMemo(() => {
    if (!monthly) return [] as Array<{ date: string; record: AttendanceRecord | null }>;
    const firstDay = new Date(monthly.year, monthly.month - 1, 1).getDay();
    const totalDays = new Date(monthly.year, monthly.month, 0).getDate();
    const byDate = new Map(monthly.days.map((d) => [d.date, d]));
    const rows: Array<{ date: string; record: AttendanceRecord | null }> = [];
    for (let i = 0; i < firstDay; i++) rows.push({ date: "", record: null });
    for (let day = 1; day <= totalDays; day++) {
      const date = toDateInput(new Date(monthly.year, monthly.month - 1, day));
      rows.push({ date, record: byDate.get(date) ?? null });
    }
    return rows;
  }, [monthly]);

  const todayDate = useMemo(() => toDateInput(new Date()), []);

  const resolveCellDisplay = useCallback(
    (date: string, record: AttendanceRecord | null) => {
      const joiningDate = monthly?.context?.joiningDate ?? null;
      const isBeforeJoining = Boolean(joiningDate && date < joiningDate);
      const isFutureDate = date > todayDate;
      const isCurrentDate = date === todayDate;

      if (isBeforeJoining || record?.dayType === "PRE_JOINING") {
        return {
          code: "",
          style: STATUS_STYLE.NOT_STARTED,
          cellVisual: MUTED_CELL_STYLE,
          isMuted: true,
          isNeutral: true,
          isBeforeJoining: true,
        };
      }

      if (!record) {
        return {
          code: "",
          style: STATUS_STYLE.NOT_STARTED,
          cellVisual: isFutureDate ? MUTED_CELL_STYLE : NEUTRAL_CELL_STYLE,
          isMuted: isFutureDate,
          isNeutral: true,
          isBeforeJoining: false,
        };
      }

      const finalStatus = resolveFinalDisplayStatus(
        record,
        date,
        todayDate,
      );

      if (finalStatus === "NOT_STARTED" && !isCurrentDate) {
        return {
          code: "",
          style: STATUS_STYLE.NOT_STARTED,
          cellVisual: MUTED_CELL_STYLE,
          isMuted: true,
          isNeutral: true,
          isBeforeJoining: false,
        };
      }

      const statusStyle = STATUS_STYLE[finalStatus] ?? STATUS_STYLE.NOT_STARTED;
      const statusCode = getStatusCode(finalStatus, record, isCurrentDate);
      const cellVisual =
        finalStatus === "LEAVE"
          ? getLeaveCellStyle(record)
          : STATUS_CELL_STYLE[finalStatus] ?? NEUTRAL_CELL_STYLE;
      return {
        code: statusCode,
        style: statusStyle,
        cellVisual,
        isMuted: false,
        isNeutral: statusCode.length === 0,
        isBeforeJoining: false,
      };
    },
    [monthly?.context?.joiningDate, todayDate],
  );

  const summaryItems = useMemo(() => {
    if (!monthly) return [] as Array<{ key: AttendanceStatusType; label: string; count: number; style: { bg: string; color: string } }>;

    const counts: Record<AttendanceStatusType, number> = {
      PRESENT: 0,
      HALF_DAY: 0,
      LOP: 0,
      LEAVE: 0,
      HOLIDAY: 0,
      WEEK_OFF: 0,
      LATE: 0,
      ABSENT: 0,
      NOT_STARTED: 0,
      MISSED_CHECK_IN: 0,
      PERMISSION: 0,
      REGULARIZED: 0,
      MISSING_PUNCH: 0,
      EARLY_OUT: 0,
      OVERTIME: 0,
    };

    for (const day of monthly.days) {
      const finalStatus = resolveFinalDisplayStatus(day, day.date, todayDate);
      if (finalStatus !== "NOT_STARTED") {
        counts[finalStatus] += 1;
      }

      if (day.lateMinutes > 0 && !["LEAVE", "HOLIDAY", "WEEK_OFF"].includes(finalStatus)) {
        counts.LATE += 1;
      }
    }

    const ordered: AttendanceStatusType[] = [
      "PRESENT",
      "HALF_DAY",
      "LOP",
      "LEAVE",
      "HOLIDAY",
      "WEEK_OFF",
      "LATE",
    ];

    return ordered
      .map((key) => ({
        key,
        label: STATUS_STYLE[key].label,
        count: counts[key],
        style: { bg: STATUS_STYLE[key].bg, color: STATUS_STYLE[key].color },
      }))
      .filter((item) => item.count > 0);
  }, [monthly, todayDate]);

  const selectedRecord = selectedDay?.attendance ?? null;
  const selectedDisplayStatus =
    selectedRecord && monthly
      ? resolveFinalDisplayStatus(selectedRecord, selectedRecord.date, todayDate)
      : "NOT_STARTED";
  const selectedStyle = STATUS_STYLE[selectedDisplayStatus];
  const isPreJoining = selectedRecord?.dayType === "PRE_JOINING";
  const actionEligibility = selectedDay?.actionEligibility;
  const canApplyLeaveFromAttendance =
    Boolean(selectedRecord) &&
    !isPreJoining &&
    selectedRecord?.dayType !== "LEAVE" &&
    selectedRecord?.dayType !== "HOLIDAY" &&
    selectedRecord?.dayType !== "WEEK_OFF";

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="420px">
        <Spinner size="lg" color="brand.400" />
      </Flex>
    );
  }

  return (
    <Box>
      <PunchCameraModal
        isOpen={punchCamera.isOpen}
        onClose={punchCamera.onClose}
        onConfirm={submitPunch}
        isSubmitting={submitting}
      />
      <PageHeader title="Attendance" subtitle="Punch in, review your month, and manage attendance requests." />

      <SectionCard
        title="Monthly Attendance"
        actions={
          <HStack spacing={{ base: 0, sm: 2 }}>
            <Button
              size="xs"
              variant="ghost"
              aria-label="Previous month"
              onClick={() =>
                setActiveMonth((prev) =>
                  prev.month === 1 ? { year: prev.year - 1, month: 12 } : { year: prev.year, month: prev.month - 1 },
                )
              }
            >
              <ChevronLeft size={14} />
            </Button>
            <Text fontSize={{ base: "xs", sm: "sm" }} fontWeight="700" minW={{ base: "105px", sm: "150px" }} textAlign="center">
              {MONTH_NAMES[activeMonth.month - 1]} {activeMonth.year}
            </Text>
            <Button
              size="xs"
              variant="ghost"
              aria-label="Next month"
              onClick={() =>
                setActiveMonth((prev) =>
                  prev.month === 12 ? { year: prev.year + 1, month: 1 } : { year: prev.year, month: prev.month + 1 },
                )
              }
            >
              <ChevronRight size={14} />
            </Button>
          </HStack>
        }
      >
        <SimpleGrid columns={{ base: 2, md: 4, xl: 8 }} spacing={2.5} mb={4}>
          {summaryItems.map((item) => (
            <Box
              key={item.key}
              border="1px solid"
              borderColor="surface.border"
              borderRadius="xl"
              px={3}
              py={2.5}
              bg="white"
              boxShadow="0 8px 22px -16px rgba(73, 64, 111, 0.35)"
            >
              <Text fontSize="10px" textTransform="uppercase" letterSpacing="0.5px" color="text.muted">{item.label}</Text>
              <Badge mt={1.5} bg={item.style.bg} color={item.style.color} borderRadius="full" px={2.5} py={0.5}>
                {item.count}
              </Badge>
            </Box>
          ))}
        </SimpleGrid>

        <Grid
          templateColumns="repeat(7, minmax(0, 1fr))"
          gap={{ base: 1, md: 1.5 }}
          bg="linear-gradient(180deg, #F7F6FD 0%, #F0EDF9 100%)"
          border="1px solid"
          borderColor="#E4DEEF"
          borderRadius="2xl"
          p={{ base: 1.5, md: 2 }}
          boxShadow="0 18px 32px -24px rgba(77, 59, 113, 0.45)"
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <Flex
              key={d}
              bg="whiteAlpha.900"
              borderRadius="lg"
              py={{ base: 1.5, md: 2 }}
              justify="center"
              border="1px solid"
              borderColor="#EBE7F4"
            >
              <Text textAlign="center" fontSize={{ base: "10px", md: "xs" }} color="#5F6281" fontWeight="700" letterSpacing="0.2px">
                <Text as="span" display={{ base: "inline", sm: "none" }}>{d.slice(0, 1)}</Text>
                <Text as="span" display={{ base: "none", sm: "inline" }}>{d}</Text>
              </Text>
            </Flex>
          ))}

          {calendarCells.map((cell, index) => {
            if (!cell.date) return <Box key={`blank-${index}`} minH={{ base: "54px", md: "88px" }} borderRadius="lg" bg="transparent" />;

            const rec = cell.record;
            const isSelected = selectedDate === cell.date;
            const display = resolveCellDisplay(cell.date, rec);

            return (
              <Box
                key={cell.date}
                minH={{ base: "54px", md: "88px" }}
                border="1px solid"
                borderColor={isSelected ? "brand.500" : "#EBE6F5"}
                bg={display.cellVisual.bg}
                borderRadius="lg"
                px={{ base: 1, md: 2.5 }}
                py={{ base: 1, md: 2 }}
                position="relative"
                role="button"
                onClick={async () => {
                  setSelectedDate(cell.date);
                  setRegularizationForm((p) => ({ ...p, date: cell.date }));
                  setPermissionForm((p) => ({ ...p, date: cell.date }));
                  await loadSelectedDay(cell.date);
                }}
                _hover={{
                  borderColor: "brand.300",
                  transform: "translateY(-1px)",
                  boxShadow: "0 12px 26px -20px rgba(95, 75, 139, 0.7)",
                }}
                transition="all 0.16s ease"
                opacity={display.isMuted ? 0.65 : 1}
                boxShadow={
                  isSelected
                    ? "0 0 0 1px rgba(11,114,231,0.35), 0 14px 28px -20px rgba(11,114,231,0.7)"
                    : "0 6px 18px -18px rgba(73, 64, 111, 0.55)"
                }
              >
                <Text
                  position="absolute"
                  top={{ base: "4px", md: "7px" }}
                  left={{ base: "6px", md: "9px" }}
                  fontSize={{ base: "9px", md: "xs" }}
                  fontWeight="800"
                  letterSpacing="0.2px"
                  color={display.cellVisual.dateColor}
                >
                  {new Date(`${cell.date}T00:00:00`).getDate()}
                </Text>

                <Flex align="center" justify="center" h="100%" minH={{ base: "42px", md: "66px" }}>
                  <Text
                    fontSize={{ base: display.code.length >= 3 ? "10px" : "xs", md: display.code.length >= 3 ? "sm" : "md" }}
                    fontWeight="800"
                    letterSpacing="0.45px"
                    color={display.code ? display.cellVisual.codeColor : "transparent"}
                  >
                    {display.code}
                  </Text>
                </Flex>
              </Box>
            );
          })}
        </Grid>

        <HStack mt={4} spacing={2} flexWrap="wrap">
          {LEGEND_ITEMS.map((item) => (
            <Badge
              key={`${item.code}-${item.label}`}
              bg={STATUS_STYLE[item.status].bg}
              color={STATUS_STYLE[item.status].color}
              borderRadius="full"
              border="1px solid"
              borderColor="surface.border"
              px={2.5}
              py={1.5}
              fontSize="10px"
              letterSpacing="0.2px"
            >
              {item.code} - {item.label}
            </Badge>
          ))}
        </HStack>
      </SectionCard>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4} mt={4}>
        <GridItem colSpan={{ base: 1, xl: 2 }} order={{ base: 2, xl: 1 }}>
          <SectionCard title="Selected Day Details" position="relative" _before={{ content: '""', position: "absolute", top: 0, left: 5, right: 5, h: "3px", bgGradient: "linear(to-r, brand.400, accent.400)", borderRadius: "full" }}>
            {!selectedRecord ? (
              <Text fontSize="sm" color="text.muted">Select a day in the calendar to view details.</Text>
            ) : (
              <Flex direction="column" gap={3}>
                <Flex gap={2} align="center" flexWrap="wrap">
                  <Text fontSize="sm" fontWeight="700">{selectedRecord.date}</Text>
                  <Badge bg={selectedStyle.bg} color={selectedStyle.color}>{selectedStyle.label}</Badge>
                  {selectedDay?.dayContext && (
                    <Badge variant="outline" borderColor="surface.border">{selectedDay.dayContext.label}</Badge>
                  )}
                </Flex>

                {selectedDay?.dayContext?.description && (
                  <Text fontSize="xs" color="text.muted">{selectedDay.dayContext.description}</Text>
                )}

                <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
                  <Stat label="First In" value={formatTime(selectedRecord.firstCheckInAt)} />
                  <Stat label="Last Out" value={formatTime(selectedRecord.lastCheckOutAt)} />
                  <Stat label="Active" value={formatMinutes(selectedRecord.totalWorkMinutes)} />
                  <Stat label="Break" value={formatMinutes(selectedRecord.totalBreakMinutes)} />
                  <Stat label="Late By" value={formatMinutes(selectedRecord.lateMinutes)} />
                  <Stat label="Overtime" value={formatMinutes(selectedRecord.overtimeMinutes)} />
                  <Stat label="Missing Punch" value={selectedRecord.missingPunch ? "Yes" : "No"} />
                  <Stat label="Access Mode" value={formatAccessMode(selectedDay?.accessPolicy?.attendanceMode)} />
                </SimpleGrid>

                <Box>
                  <Text fontSize="xs" color="text.muted" mb={1}>Punch Timeline</Text>
                  {selectedDay?.punches.length ? (
                    <Flex direction="column" gap={1.5}>
                      {selectedDay?.punches.map((p, idx) => (
                        <Grid
                          key={`${p.id}-${idx}`}
                          templateColumns={{ base: "1fr auto", sm: "1fr auto auto" }}
                          gap={{ base: 1, sm: 4 }}
                          alignItems="center"
                          border="1px solid"
                          borderColor="surface.border"
                          bg="surface.bg"
                          borderRadius="md"
                          px={3}
                          py={2.5}
                          fontSize="xs"
                        >
                          <Text fontWeight="700">{p.type === "CHECK_IN" ? "Punch In" : "Punch Out"}</Text>
                          <Text fontWeight="600">{formatTime(p.time)}</Text>
                          <Text gridColumn={{ base: "1 / -1", sm: "auto" }} color={p.isInsideOffice ? "green.600" : "orange.600"}>
                            {p.isInsideOffice ? "Inside" : "Remote/Outside"}
                          </Text>
                        </Grid>
                      ))}
                    </Flex>
                  ) : (
                    <Text fontSize="xs" color="text.muted">No punches recorded.</Text>
                  )}
                </Box>

                {!isPreJoining && !actionEligibility?.hideActions ? (
                  <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={2} pt={2}>
                    {canApplyLeaveFromAttendance && (
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<CalendarPlus size={15} />}
                        w="100%"
                        onClick={() => router.push(`/employee/leave?applyLeave=1&date=${selectedRecord?.date}&mode=FULL_DAY`)}
                      >
                        Apply Leave
                      </Button>
                    )}
                    {actionEligibility?.canRequestRegularization && (
                      <Button size="sm" variant="outline" leftIcon={<FilePenLine size={15} />} w="100%" onClick={regularizationModal.onOpen}>
                        Request Regularization
                      </Button>
                    )}
                    {actionEligibility?.canRequestPermission && (
                      <Button size="sm" variant="outline" leftIcon={<Timer size={15} />} w="100%" onClick={permissionModal.onOpen}>
                        Request Permission
                      </Button>
                    )}
                    {actionEligibility?.existingRegularization && (
                      <Badge colorScheme={actionEligibility.existingRegularization.status === "APPROVED" ? "green" : actionEligibility.existingRegularization.status === "REJECTED" ? "red" : "yellow"}>
                        Regularization {actionEligibility.existingRegularization.status}
                      </Badge>
                    )}
                    {actionEligibility?.existingPermission && (
                      <Badge colorScheme={actionEligibility.existingPermission.status === "APPROVED" ? "green" : actionEligibility.existingPermission.status === "REJECTED" ? "red" : "yellow"}>
                        Permission {actionEligibility.existingPermission.status}
                      </Badge>
                    )}
                  </SimpleGrid>
                ) : (
                  <Text fontSize="xs" color="text.muted">
                    {isPreJoining ? "No actions available before joining date." : "No action required for this day."}
                  </Text>
                )}
              </Flex>
            )}
          </SectionCard>
        </GridItem>

        <GridItem order={{ base: 1, xl: 2 }}>
          <SectionCard
            title="Today’s Punch"
            bg="linear-gradient(180deg, #FFFFFF 0%, #F7FBFF 100%)"
            borderColor="brand.100"
            shadow="0 18px 42px -28px rgba(11,114,231,0.55)"
            actions={<Flex w={8} h={8} borderRadius="xl" align="center" justify="center" bg="brand.50" color="brand.500"><Sparkles size={16} /></Flex>}
          >
            <Flex direction="column" gap={3}>
              <Flex gap={2.5} align="flex-start" bg="white" border="1px solid" borderColor="surface.border" borderRadius="xl" p={3}>
                <Flex w={8} h={8} flexShrink={0} borderRadius="lg" align="center" justify="center" bg="accent.50" color="accent.600"><Calendar size={16} /></Flex>
                <Box>
                  <Text fontSize="10px" textTransform="uppercase" letterSpacing="0.6px" color="text.muted" fontWeight="700">Status</Text>
                  <Text fontSize="sm" color="text.body" fontWeight="600">{todayState?.reasonMessage}</Text>
                </Box>
              </Flex>

              <SimpleGrid columns={2} spacing={2}>
                <Stat label="First In" value={formatTime(todayState?.attendance?.firstCheckInAt ?? null)} />
                <Stat label="Last Out" value={formatTime(todayState?.attendance?.lastCheckOutAt ?? null)} />
              </SimpleGrid>

              <HStack spacing={2} fontSize="xs" color="text.muted" flexWrap="wrap">
                <HStack spacing={1}><MapPin size={13} /><Text>{formatAccessMode(todayState?.accessPolicy?.attendanceMode)}</Text></HStack>
                <HStack spacing={1}><Timer size={13} /><Text>Grace {todayState?.lateGraceMinutes}m</Text></HStack>
              </HStack>

              <Button
                leftIcon={todayState?.nextPunchType === "CHECK_IN" ? <LogIn size={15} /> : <LogOut size={15} />}
                bg={todayState?.nextPunchType === "CHECK_IN" ? "brand.500" : "#1D4ED8"}
                color="white"
                h="48px"
                borderRadius="xl"
                boxShadow="0 12px 24px -14px rgba(11,114,231,0.8)"
                _hover={{ opacity: 0.94, transform: "translateY(-1px)" }}
                onClick={handlePunch}
                isLoading={submitting}
                isDisabled={!todayState?.canPunchToday}
              >
                {!todayState ? "Attendance unavailable" : todayState.nextPunchType === "CHECK_IN" ? "Punch In" : "Punch Out"}
              </Button>

              <Button variant="ghost" leftIcon={<RefreshCw size={15} />} onClick={loadAll}>Refresh attendance</Button>
            </Flex>
          </SectionCard>
        </GridItem>
      </SimpleGrid>

      <Modal isOpen={regularizationModal.isOpen} onClose={regularizationModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">Regularization Request</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction="column" gap={3}>
              <Input type="date" value={regularizationForm.date} onChange={(e) => setRegularizationForm((p) => ({ ...p, date: e.target.value }))} />
              <Select value={regularizationForm.requestType} onChange={(e) => setRegularizationForm((p) => ({ ...p, requestType: e.target.value as (typeof REGULARIZATION_TYPES)[number] }))}>
                {REGULARIZATION_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replace(/_/g, " ")}</option>
                ))}
              </Select>
              <SimpleGrid columns={2} spacing={2}>
                <Input type="time" value={regularizationForm.requestedInTime} onChange={(e) => setRegularizationForm((p) => ({ ...p, requestedInTime: e.target.value }))} />
                <Input type="time" value={regularizationForm.requestedOutTime} onChange={(e) => setRegularizationForm((p) => ({ ...p, requestedOutTime: e.target.value }))} />
              </SimpleGrid>
              <Textarea rows={3} value={regularizationForm.reason} placeholder="Reason" onChange={(e) => setRegularizationForm((p) => ({ ...p, reason: e.target.value }))} />
            </Flex>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={regularizationModal.onClose}>Cancel</Button>
            <Button bg="brand.500" color="white" _hover={{ bg: "brand.600" }} onClick={handleRegularizationSubmit} isLoading={submitting}>
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={permissionModal.isOpen} onClose={permissionModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">Permission Request</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction="column" gap={3}>
              <Input type="date" value={permissionForm.date} onChange={(e) => setPermissionForm((p) => ({ ...p, date: e.target.value }))} />
              <SimpleGrid columns={2} spacing={2}>
                <Input type="time" value={permissionForm.fromTime} onChange={(e) => setPermissionForm((p) => ({ ...p, fromTime: e.target.value }))} />
                <Input type="time" value={permissionForm.toTime} onChange={(e) => setPermissionForm((p) => ({ ...p, toTime: e.target.value }))} />
              </SimpleGrid>
              <Textarea rows={3} value={permissionForm.reason} placeholder="Reason" onChange={(e) => setPermissionForm((p) => ({ ...p, reason: e.target.value }))} />
            </Flex>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={permissionModal.onClose}>Cancel</Button>
            <Button bg="brand.500" color="white" _hover={{ bg: "brand.600" }} onClick={handlePermissionSubmit} isLoading={submitting}>
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const hasValue = value !== "-";
  return (
    <Box
      border="1px solid"
      borderColor={hasValue ? "#D7E6F4" : "surface.border"}
      borderRadius="xl"
      px={{ base: 3, md: 3.5 }}
      py={{ base: 2.5, md: 3 }}
      bg={hasValue ? "linear-gradient(145deg, #FFFFFF 0%, #F8FBFF 100%)" : "white"}
      minH={{ base: "72px", md: "78px" }}
      boxShadow={hasValue ? "0 8px 20px -18px rgba(8,43,76,0.5)" : "none"}
    >
      <Text fontSize="10px" textTransform="uppercase" letterSpacing="0.45px" color="text.muted" fontWeight="600">{label}</Text>
      <Text fontSize={{ base: "md", md: "sm" }} mt={1} fontWeight="800" color={hasValue ? "text.heading" : "text.muted"} lineHeight="1.25" wordBreak="break-word">{value}</Text>
    </Box>
  );
}
