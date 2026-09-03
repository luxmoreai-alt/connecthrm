"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Box, Flex, HStack, SimpleGrid, Spinner, Text, VStack } from "@chakra-ui/react";
import { Calendar, Info, Megaphone, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import StatusBadge from "@/components/ui/StatusBadge";
import DataTable, { type Column } from "@/components/ui/DataTable";
import UpcomingBirthdaysWidget from "@/components/ui/UpcomingBirthdaysWidget";
import UpcomingHolidaysWidget from "@/components/ui/UpcomingHolidaysWidget";
import { dashboardApi, type DashboardSummary } from "@/api";
import type { AttendanceRecord } from "@/types";

const AttendanceChart = dynamic(() => import("@/components/charts/AttendanceChart"), { ssr: false });
const DepartmentChart = dynamic(() => import("@/components/charts/DepartmentChart"), { ssr: false });

const announcementIcons: Record<string, typeof Info> = {
  info: Info,
  holiday: Calendar,
  update: RefreshCw,
  event: Megaphone,
};

const SUMMARY_ORDER = ["Total Employees", "Present Today", "This Month Salary", "Payroll Processed", "Late Arrivals"];

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi
      .getSummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const attendanceColumns = useMemo<Column<AttendanceRecord>[]>(
    () => [
      { key: "id", header: "Emp ID", width: "100px" },
      {
        key: "name",
        header: "Employee",
        render: (row) => (
          <HStack spacing={3} align="center">
            <Avatar
              name={row.name}
              size="xs"
              bg="brand.100"
              color="brand.600"
              border="1px solid"
              borderColor="brand.200"
            />
            <Box minW={0}>
              <Text fontSize="sm" fontWeight="700" color="text.heading" noOfLines={1}>
                {row.name}
              </Text>
              <Text fontSize="xs" color="text.muted" fontWeight="600" noOfLines={1}>
                {row.department || "Department not set"}
              </Text>
            </Box>
          </HStack>
        ),
      },
      {
        key: "checkIn",
        header: "Check In",
        width: "110px",
        render: (row) => (
          <Text fontSize="sm" fontWeight="600" color={row.checkIn === "-" ? "text.muted" : "text.heading"}>
            {row.checkIn}
          </Text>
        ),
      },
      {
        key: "checkOut",
        header: "Check Out",
        width: "110px",
        render: (row) => (
          <Text fontSize="sm" fontWeight="600" color={row.checkOut === "-" ? "text.muted" : "text.heading"}>
            {row.checkOut}
          </Text>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "140px",
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    []
  );

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="420px">
        <Spinner size="xl" color="brand.400" />
      </Flex>
    );
  }

  const kpiMap = new Map((data?.kpiStats ?? []).map((stat) => [stat.label, stat]));
  const kpiStats = SUMMARY_ORDER.map((label) => kpiMap.get(label)).filter(Boolean);
  const recentAttendance = data?.recentAttendance ?? [];
  const announcements = data?.announcements ?? [];

  const breakdown = data?.attendanceBreakdown;
  const attendanceBreakdownItems = [
    { label: "Present", value: breakdown?.present ?? 0, tone: "#0D7C47", bg: "#E6F9F0" },
    { label: "Half Day", value: breakdown?.halfDay ?? 0, tone: "#92640D", bg: "#FEF9EC" },
    { label: "Leave", value: breakdown?.leave ?? 0, tone: "#0B72E7", bg: "#EAF5FF" },
    { label: "LOP", value: breakdown?.lop ?? 0, tone: "#C41E3A", bg: "#FEECEF" },
    { label: "Week Off", value: breakdown?.weekOff ?? 0, tone: "#3A5E8C", bg: "#EDF4FC" },
    { label: "Holiday", value: breakdown?.holiday ?? 0, tone: "#2B7A4B", bg: "#EAF8F0" },
    { label: "Absent", value: breakdown?.absent ?? 0, tone: "#A0332F", bg: "#FDEFED" },
  ];

  const pageDateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle="Live workforce intelligence for today"
        actions={
          <Badge variant="info" px={3} py={1.5} fontSize="xs" fontWeight="700">
            {pageDateLabel}
          </Badge>
        }
      />

      <Box
        p={{ base: 4, md: 5 }}
        borderRadius="3xl"
        border="1px solid"
        borderColor="surface.border"
        bgGradient="linear(to-br, rgba(11,114,231,0.05), rgba(32,201,151,0.03), #ffffff)"
        mb={8}
      >
        <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={5}>
          {kpiStats.map((stat) => (
            <StatCard key={stat!.label} {...stat!} />
          ))}
        </SimpleGrid>
      </Box>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={5} mb={8}>
        <SectionCard
          title="Attendance Trend (14 Days)"
          gridColumn={{ base: "auto", xl: "span 2" }}
          actions={<Badge variant="neutral">Live</Badge>}
        >
          <AttendanceChart data={data?.attendanceTrend} />
        </SectionCard>

        <SectionCard title="Department Headcount" actions={<Badge variant="neutral">Current</Badge>}>
          <DepartmentChart data={data?.departmentData} />
        </SectionCard>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5} mb={8}>
        <SectionCard
          title="Today Attendance Breakdown"
          actions={<Badge variant="neutral">{breakdown?.date ?? "Today"}</Badge>}
        >
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            {attendanceBreakdownItems.map((item) => (
              <Box
                key={item.label}
                p={3}
                borderRadius="xl"
                border="1px solid"
                borderColor="surface.border"
                bg="white"
              >
                <Text fontSize="11px" textTransform="uppercase" letterSpacing="0.06em" color="text.muted" fontWeight="700">
                  {item.label}
                </Text>
                <Text mt={1} fontSize="xl" fontWeight="800" color={item.tone}>
                  {item.value}
                </Text>
                <Box mt={2} h="6px" borderRadius="full" bg={item.bg} />
              </Box>
            ))}
          </SimpleGrid>
        </SectionCard>

        <SectionCard
          title="Announcements"
          actions={<Badge variant="neutral">{announcements.length} items</Badge>}
        >
          {announcements.length === 0 ? (
            <Flex
              border="1px dashed"
              borderColor="surface.border"
              borderRadius="xl"
              py={9}
              px={4}
              justify="center"
              align="center"
              direction="column"
              gap={2}
              bg="surface.bg"
            >
              <Text fontSize="sm" fontWeight="700" color="text.heading">
                No announcements yet
              </Text>
              <Text fontSize="xs" color="text.muted" fontWeight="500">
                Important updates and events will appear here.
              </Text>
            </Flex>
          ) : (
            <VStack spacing={3} align="stretch">
              {announcements.map((a, i) => {
                const Icon = announcementIcons[a.type] ?? Info;
                return (
                  <Flex
                    key={i}
                    align="center"
                    gap={3}
                    p={3}
                    borderRadius="xl"
                    border="1px solid"
                    borderColor="surface.border"
                    bg="white"
                    _hover={{ bg: "brand.50", transform: "translateX(2px)", borderColor: "brand.100" }}
                    transition="all 0.25s cubic-bezier(.4,0,.2,1)"
                  >
                    <Flex
                      w={9}
                      h={9}
                      borderRadius="xl"
                      bgGradient="linear(135deg, #0B72E7, #20C997)"
                      align="center"
                      justify="center"
                      flexShrink={0}
                      shadow="soft"
                    >
                      <Icon size={14} color="white" />
                    </Flex>
                    <Box flex={1}>
                      <Text fontSize="sm" fontWeight="700" color="text.heading">
                        {a.title}
                      </Text>
                      <Text fontSize="xs" color="text.muted" fontWeight="600">
                        {a.date}
                      </Text>
                    </Box>
                  </Flex>
                );
              })}
            </VStack>
          )}
        </SectionCard>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={5} mb={8}>
        <UpcomingBirthdaysWidget />
        <UpcomingHolidaysWidget />
      </SimpleGrid>

      <SectionCard
        title="Recent Attendance"
        actions={<Badge variant="neutral">Today</Badge>}
        noPadding
      >
        <DataTable<AttendanceRecord>
          columns={attendanceColumns}
          data={recentAttendance}
          keyField="id"
          emptyMessage="No attendance records captured for today yet."
        />
      </SectionCard>
    </Box>
  );
}
