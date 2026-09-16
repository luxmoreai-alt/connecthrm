"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
  Spinner,
  Text,
  useToast,
} from "@chakra-ui/react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, RefreshCw, Search } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import {
  attendanceApi,
  type AdminAttendanceDayDetailsResponse,
  type AttendanceRecord,
  type AttendanceStatusType,
  type MonthlyAttendanceResponse,
} from "@/api/attendance.api";
import { employeeApi } from "@/api/employee.api";
import type { DropdownEmployee } from "@/types";

const STATUS_STYLE: Record<AttendanceStatusType, { label: string; code: string; bg: string; color: string }> = {
  PRESENT: { label: "Present", code: "P", bg: "#E7F8EF", color: "#087443" },
  LATE: { label: "Late", code: "LT", bg: "#FFF5D8", color: "#8B6200" },
  ABSENT: { label: "Absent", code: "A", bg: "#FDECEC", color: "#AE1F44" },
  HALF_DAY: { label: "Half Day", code: "HD", bg: "#FFF0DF", color: "#A55A00" },
  LEAVE: { label: "Leave", code: "L", bg: "#EDF0FF", color: "#3A4AB1" },
  HOLIDAY: { label: "Holiday", code: "H", bg: "#EAF6EA", color: "#25763A" },
  WEEK_OFF: { label: "Week Off", code: "WO", bg: "#F2ECFF", color: "#6840BA" },
  NOT_STARTED: { label: "Not Started", code: "", bg: "#F6F8FB", color: "#768197" },
  MISSED_CHECK_IN: { label: "Missed In", code: "MI", bg: "#FFEAE6", color: "#B43A20" },
  PERMISSION: { label: "Permission", code: "PM", bg: "#EAF7FF", color: "#0B68A6" },
  REGULARIZED: { label: "Regularized", code: "R", bg: "#FFF5EB", color: "#A45B1A" },
  LOP: { label: "LOP", code: "LOP", bg: "#FDECEC", color: "#AE1F44" },
  MISSING_PUNCH: { label: "Missing Punch", code: "MP", bg: "#FFF0ED", color: "#C4472A" },
  EARLY_OUT: { label: "Early Out", code: "EO", bg: "#FFF3E0", color: "#B36B00" },
  OVERTIME: { label: "Overtime", code: "OT", bg: "#EAFBF5", color: "#0C8A61" },
};

const LEGEND_STATUSES: AttendanceStatusType[] = [
  "PRESENT",
  "HALF_DAY",
  "LOP",
  "LEAVE",
  "HOLIDAY",
  "WEEK_OFF",
];

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMinutes(value: number) {
  if (!value) return "-";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function resolveStatus(record: AttendanceRecord, today: string): AttendanceStatusType {
  if (record.dayType === "PRE_JOINING" || record.date > today) return "NOT_STARTED";
  if (record.dayType === "HOLIDAY") return "HOLIDAY";
  if (record.dayType === "WEEK_OFF") return "WEEK_OFF";
  if (record.dayType === "LEAVE") {
    return String(record.derivedSummary?.leaveType ?? "").toUpperCase() === "LOP" ? "LOP" : "LEAVE";
  }
  if (Number(record.lateMinutes || 0) > 0) return "HALF_DAY";
  if (record.status === "NOT_STARTED" && record.date <= today) return "LOP";
  return record.status;
}

function MetricCard({ label, value, bg, color }: { label: string; value: number; bg: string; color: string }) {
  return (
    <Box border="1px solid" borderColor="surface.border" borderRadius="xl" p={4} bg="white">
      <Flex align="center" justify="space-between">
        <Text fontSize="xs" fontWeight="700" color="text.muted" textTransform="uppercase">{label}</Text>
        <Flex minW={8} h={8} px={2} borderRadius="lg" align="center" justify="center" bg={bg} color={color} fontWeight="800">
          {value}
        </Flex>
      </Flex>
    </Box>
  );
}

export default function AdminAttendanceCalendarPage() {
  const toast = useToast();
  const [employees, setEmployees] = useState<DropdownEmployee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [monthly, setMonthly] = useState<MonthlyAttendanceResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<AdminAttendanceDayDetailsResponse | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);

  useEffect(() => {
    employeeApi.dropdown()
      .then((rows) => {
        setEmployees(rows);
        setEmployeeId((current) => current || rows[0]?.userId || "");
      })
      .catch(() => toast({ title: "Failed to load employees", status: "error", position: "top-right" }))
      .finally(() => setLoadingEmployees(false));
  }, [toast]);

  const loadMonth = useCallback(async () => {
    if (!employeeId) {
      setMonthly(null);
      return;
    }
    setLoading(true);
    setSelectedDay(null);
    try {
      const data = await attendanceApi.getAdminEmployeeMonthly(employeeId, month.year, month.month);
      setMonthly(data);
    } catch (error: any) {
      toast({
        title: "Failed to load attendance calendar",
        description: error?.message || "Please try again",
        status: "error",
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  }, [employeeId, month.month, month.year, toast]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const changeMonth = (offset: number) => {
    const next = new Date(month.year, month.month - 1 + offset, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  const openDay = async (date: string) => {
    if (!employeeId) return;
    setLoadingDay(true);
    try {
      setSelectedDay(await attendanceApi.getAdminEmployeeDay(employeeId, date));
    } catch (error: any) {
      toast({ title: "Failed to load day details", description: error?.message, status: "error", position: "top-right" });
    } finally {
      setLoadingDay(false);
    }
  };

  const selectedEmployee = employees.find((employee) => employee.userId === employeeId);
  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [employee.empId, employee.firstName, employee.lastName]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [employeeSearch, employees]);
  const currentDay = useMemo(todayKey, []);
  const monthLabel = useMemo(
    () => new Date(month.year, month.month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    [month.month, month.year],
  );

  const cells = useMemo(() => {
    if (!monthly) return [] as Array<{ date: string; day: number; record: AttendanceRecord | null }>;
    const firstWeekday = new Date(monthly.year, monthly.month - 1, 1).getDay();
    const daysInMonth = new Date(monthly.year, monthly.month, 0).getDate();
    const records = new Map(monthly.days.map((day) => [day.date, day]));
    const result: Array<{ date: string; day: number; record: AttendanceRecord | null }> = [];
    for (let blank = 0; blank < firstWeekday; blank++) result.push({ date: "", day: 0, record: null });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = dateKey(monthly.year, monthly.month, day);
      result.push({ date, day, record: records.get(date) ?? null });
    }
    return result;
  }, [monthly]);

  const counts = useMemo(() => {
    const result: Record<AttendanceStatusType, number> = Object.fromEntries(
      Object.keys(STATUS_STYLE).map((key) => [key, 0]),
    ) as Record<AttendanceStatusType, number>;
    monthly?.days.forEach((day) => {
      const status = resolveStatus(day, currentDay);
      if (status !== "NOT_STARTED") result[status] += 1;
    });
    return result;
  }, [currentDay, monthly]);

  return (
    <Box>
      <PageHeader
        title="Attendance Calendar"
        subtitle="Review each employee's daily attendance status and monthly Present/LOP totals."
        actions={<Button leftIcon={<RefreshCw size={15} />} variant="outline" onClick={loadMonth} isLoading={loading}>Refresh</Button>}
      />

      <SectionCard mb={5}>
        <Flex gap={4} direction={{ base: "column", md: "row" }} align={{ md: "end" }}>
          <Box flex="1" maxW={{ md: "460px" }}>
            <Text fontSize="xs" fontWeight="700" color="text.muted" mb={1.5}>EMPLOYEE</Text>
            <InputGroup size="sm" mb={2}>
              <InputLeftElement pointerEvents="none"><Search size={15} color="#A0AEC0" /></InputLeftElement>
              <Input
                placeholder="Search employee by name or ID..."
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
                borderRadius="md"
                borderColor="surface.border"
              />
            </InputGroup>
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              isDisabled={loadingEmployees}
              placeholder={loadingEmployees ? "Loading employees..." : "Select employee"}
            >
              {filteredEmployees.map((employee) => (
                <option value={employee.userId} key={employee.userId}>
                  {employee.empId} - {employee.firstName} {employee.lastName}
                </option>
              ))}
            </Select>
          </Box>
          <HStack>
            <Button aria-label="Previous month" variant="outline" px={3} onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></Button>
            <Flex minW="180px" h="40px" px={4} border="1px solid" borderColor="surface.border" borderRadius="md" align="center" justify="center" fontWeight="700">
              {monthLabel}
            </Flex>
            <Button aria-label="Next month" variant="outline" px={3} onClick={() => changeMonth(1)}><ChevronRight size={18} /></Button>
          </HStack>
        </Flex>
      </SectionCard>

      {employeeId && (
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={5}>
          <MetricCard label="Present Days" value={counts.PRESENT} bg={STATUS_STYLE.PRESENT.bg} color={STATUS_STYLE.PRESENT.color} />
          <MetricCard label="LOP Days" value={counts.LOP + counts.ABSENT} bg={STATUS_STYLE.LOP.bg} color={STATUS_STYLE.LOP.color} />
          <MetricCard label="Half Days" value={counts.HALF_DAY} bg={STATUS_STYLE.HALF_DAY.bg} color={STATUS_STYLE.HALF_DAY.color} />
          <MetricCard label="Leave Days" value={counts.LEAVE} bg={STATUS_STYLE.LEAVE.bg} color={STATUS_STYLE.LEAVE.color} />
        </SimpleGrid>
      )}

      <SectionCard
        title={selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} · ${monthLabel}` : monthLabel}
        actions={
          <HStack spacing={2} flexWrap="wrap">
            {LEGEND_STATUSES.map((status) => (
              <Badge key={status} bg={STATUS_STYLE[status].bg} color={STATUS_STYLE[status].color} px={2} py={1} borderRadius="md">
                {STATUS_STYLE[status].code} {STATUS_STYLE[status].label}
              </Badge>
            ))}
          </HStack>
        }
      >
        {loading ? (
          <Flex minH="340px" align="center" justify="center"><Spinner color="brand.500" /></Flex>
        ) : !employeeId ? (
          <Flex minH="260px" direction="column" align="center" justify="center" color="text.muted">
            <CalendarDays size={34} />
            <Text mt={3}>Select an employee to view attendance.</Text>
          </Flex>
        ) : (
          <Box overflowX="auto">
            <Box minW="700px">
              <SimpleGrid columns={7} spacing={2} mb={2}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <Text key={day} py={2} textAlign="center" fontSize="xs" fontWeight="800" color="text.muted">{day}</Text>
                ))}
              </SimpleGrid>
              <SimpleGrid columns={7} spacing={2}>
                {cells.map((cell, index) => {
                  if (!cell.date) return <Box key={`blank-${index}`} minH="88px" />;
                  const status = cell.record ? resolveStatus(cell.record, currentDay) : "NOT_STARTED";
                  const style = STATUS_STYLE[status];
                  const isSelected = selectedDay?.date === cell.date;
                  return (
                    <Box
                      as="button"
                      type="button"
                      key={cell.date}
                      minH="88px"
                      p={2.5}
                      textAlign="left"
                      border="1px solid"
                      borderColor={isSelected ? "brand.400" : cell.date === currentDay ? "brand.200" : "surface.border"}
                      borderRadius="lg"
                      bg={status === "NOT_STARTED" ? "#FAFBFD" : style.bg}
                      opacity={cell.date > currentDay ? 0.6 : 1}
                      transition="all .15s ease"
                      _hover={{ borderColor: "brand.300", transform: "translateY(-1px)" }}
                      onClick={() => void openDay(cell.date)}
                    >
                      <Flex justify="space-between" align="start">
                        <Text fontSize="sm" fontWeight="800" color={status === "NOT_STARTED" ? "text.muted" : style.color}>{cell.day}</Text>
                        {style.code && <Text fontSize="10px" fontWeight="900" color={style.color}>{style.code}</Text>}
                      </Flex>
                      <Text mt={4} fontSize="10px" fontWeight="700" color={style.color} noOfLines={1}>
                        {status === "NOT_STARTED" ? "" : style.label}
                      </Text>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>
          </Box>
        )}
      </SectionCard>

      {(loadingDay || selectedDay) && (
        <SectionCard mt={5} title={selectedDay ? `Day Details · ${new Date(`${selectedDay.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}` : "Day Details"}>
          {loadingDay ? <Spinner size="sm" /> : selectedDay && (
            <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
              {[
                ["Status", STATUS_STYLE[resolveStatus(selectedDay.attendance, currentDay)].label],
                ["First In", formatTime(selectedDay.attendance.firstCheckInAt)],
                ["Last Out", formatTime(selectedDay.attendance.lastCheckOutAt)],
                ["Worked", formatMinutes(selectedDay.attendance.totalWorkMinutes)],
                ["Late By", formatMinutes(selectedDay.attendance.lateMinutes)],
              ].map(([label, value]) => (
                <Box key={label} border="1px solid" borderColor="surface.border" borderRadius="lg" p={3}>
                  <HStack color="text.muted" spacing={1.5}><Clock3 size={13} /><Text fontSize="10px" fontWeight="700">{label}</Text></HStack>
                  <Text mt={1} fontSize="sm" fontWeight="800" color="text.heading">{value}</Text>
                </Box>
              ))}
            </SimpleGrid>
          )}
        </SectionCard>
      )}
    </Box>
  );
}
