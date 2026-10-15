"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  SimpleGrid,
  Spinner,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import {
  sharedDashboardApi,
  type HolidayCalendarEntry,
  type WorkdayUpdate,
} from "@/api/profile.api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function EmployeeHolidayCalendarPage() {
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<HolidayCalendarEntry[]>([]);
  const [workdayUpdates, setWorkdayUpdates] = useState<WorkdayUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const loadCalendar = useCallback(async () => {
    try {
      setLoading(true);
      const [calendar, updates] = await Promise.all([
        sharedDashboardApi.getHolidayCalendar(year),
        sharedDashboardApi.getWorkdayUpdates(year),
      ]);
      setHolidays(calendar);
      setWorkdayUpdates(updates);
    } catch (error: any) {
      setHolidays([]);
      toast({
        title: "Could not load the holiday calendar",
        description: error?.message,
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, year]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const holidaysByMonth = useMemo(() => {
    const grouped = Array.from({ length: 12 }, () => [] as HolidayCalendarEntry[]);
    holidays.forEach((holiday) => {
      const monthIndex = Number(holiday.date.slice(5, 7)) - 1;
      if (monthIndex >= 0 && monthIndex < 12) grouped[monthIndex].push(holiday);
    });
    return grouped;
  }, [holidays]);

  const upcomingCount = holidays.filter((holiday) => holiday.date >= today).length;

  return (
    <Box>
      <PageHeader
        title="Holiday Calendar"
        subtitle="National, Central Government, Tamil Nadu, and organization-approved holidays"
        actions={
          <Flex align="center" gap={2}>
            <Button
              size="sm"
              variant="outline"
              aria-label="Previous year"
              onClick={() => setYear((value) => value - 1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="outline" minW="86px" onClick={() => setYear(currentYear)}>
              {year}
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Next year"
              onClick={() => setYear((value) => value + 1)}
            >
              <ChevronRight size={16} />
            </Button>
          </Flex>
        }
      />

      <Alert status="info" borderRadius="xl" mb={5} alignItems="flex-start">
        <AlertIcon mt={0.5} />
        <AlertDescription fontSize="sm">
          This calendar is based on Government of India/Central Government and Tamil Nadu Government holidays. The organization may add, remove, or change holidays according to business requirements. Employees should follow the latest calendar displayed here.
        </AlertDescription>
      </Alert>

      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4} mb={5}>
        <Box bg="white" border="1px solid" borderColor="surface.border" borderRadius="xl" p={4}>
          <Text fontSize="xs" color="text.muted" fontWeight="700" textTransform="uppercase">Total Holidays</Text>
          <Text fontSize="2xl" color="text.heading" fontWeight="800">{holidays.length}</Text>
        </Box>
        <Box bg="white" border="1px solid" borderColor="surface.border" borderRadius="xl" p={4}>
          <Text fontSize="xs" color="text.muted" fontWeight="700" textTransform="uppercase">Upcoming in {year}</Text>
          <Text fontSize="2xl" color="brand.500" fontWeight="800">{year === currentYear ? upcomingCount : holidays.length}</Text>
        </Box>
      </SimpleGrid>

      {workdayUpdates.length > 0 && (
        <Box mb={5}>
          <SectionCard title="Workday Updates" actions={<Badge colorScheme="purple">Important</Badge>}>
            <VStack spacing={3} align="stretch">
              {workdayUpdates.map((update) => (
                <Flex key={update.id} gap={3} p={3} borderRadius="xl" bg={update.type === "WORKING_DAY" ? "green.50" : "orange.50"} border="1px solid" borderColor={update.type === "WORKING_DAY" ? "green.200" : "orange.200"}>
                  <Box flex={1}>
                    <Flex align="center" gap={2} flexWrap="wrap">
                      <Text fontWeight="800" color="text.heading">{new Date(`${update.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Text>
                      <Badge colorScheme={update.type === "WORKING_DAY" ? "green" : "orange"}>{update.type === "WORKING_DAY" ? "Working Day" : "Non-working Day"}</Badge>
                    </Flex>
                    <Text mt={1} fontSize="sm" color="text.body">Reason: {update.reason}</Text>
                  </Box>
                </Flex>
              ))}
            </VStack>
          </SectionCard>
        </Box>
      )}

      {loading ? (
        <Flex justify="center" py={20}><Spinner size="lg" color="brand.500" /></Flex>
      ) : holidays.length === 0 ? (
        <SectionCard title={`${year} Holidays`}>
          <Flex direction="column" align="center" py={12} color="text.muted">
            <CalendarDays size={38} />
            <Text mt={3} fontWeight="600">No holidays are configured for {year}.</Text>
          </Flex>
        </SectionCard>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4} alignItems="start">
          {MONTHS.map((month, monthIndex) => (
            <SectionCard
              key={month}
              title={month}
              actions={<Badge colorScheme={holidaysByMonth[monthIndex].length ? "blue" : "gray"}>{holidaysByMonth[monthIndex].length}</Badge>}
            >
              {holidaysByMonth[monthIndex].length === 0 ? (
                <Text fontSize="sm" color="text.muted" py={4} textAlign="center">No holidays</Text>
              ) : (
                <VStack spacing={2} align="stretch">
                  {holidaysByMonth[monthIndex].map((holiday) => {
                    const date = new Date(`${holiday.date}T00:00:00`);
                    const isToday = holiday.date === today;
                    const isPast = year === currentYear && holiday.date < today;
                    return (
                      <Flex
                        key={holiday.id}
                        align="center"
                        gap={3}
                        p={3}
                        borderRadius="xl"
                        bg={isToday ? "green.50" : "surface.bg"}
                        border="1px solid"
                        borderColor={isToday ? "green.200" : "surface.border"}
                        opacity={isPast ? 0.72 : 1}
                      >
                        <Flex
                          direction="column"
                          align="center"
                          justify="center"
                          w={11}
                          h={11}
                          borderRadius="lg"
                          bg="white"
                          border="1px solid"
                          borderColor="surface.border"
                          flexShrink={0}
                        >
                          <Text fontSize="lg" fontWeight="800" color="brand.500" lineHeight="1">{date.getDate()}</Text>
                          <Text fontSize="9px" color="text.muted" fontWeight="700">{holiday.dayName.slice(0, 3)}</Text>
                        </Flex>
                        <Box flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="700" color="text.heading">{holiday.name}</Text>
                          <Text fontSize="xs" color="text.muted">{holiday.dayName}</Text>
                        </Box>
                        {isToday && <Badge colorScheme="green">Today</Badge>}
                      </Flex>
                    );
                  })}
                </VStack>
              )}
            </SectionCard>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
