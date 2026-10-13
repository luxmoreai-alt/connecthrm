"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Box, Button, Flex, HStack, SimpleGrid, Spinner, Text, useToast } from "@chakra-ui/react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Moon, Sunrise } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { shiftApi, type EmployeeShiftWeek } from "@/api/shift.api";

function mondayKey(date = new Date()) {
  const value = new Date(date); value.setHours(0, 0, 0, 0);
  const day = value.getDay(); value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function moveWeek(value: string, amount: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + amount * 7); return mondayKey(date); }
function localDateKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export default function EmployeeShiftsPage() {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(mondayKey);
  const [data, setData] = useState<EmployeeShiftWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await shiftApi.getMyWeek(weekStart)); }
    catch (error) { toast({ title: "Could not load your shifts", description: error instanceof Error ? error.message : "Please try again", status: "error" }); }
    finally { setLoading(false); }
  }, [toast, weekStart]);
  useEffect(() => { void load(); }, [load]);

  const today = localDateKey();
  return <Box>
    <PageHeader title="My Shifts" subtitle="Your weekly shift chart and working hours." actions={<HStack><Button aria-label="Previous week" variant="outline" onClick={() => setWeekStart(moveWeek(weekStart, -1))}><ChevronLeft size={18} /></Button><Button variant="outline" onClick={() => setWeekStart(mondayKey())}>This week</Button><Button aria-label="Next week" variant="outline" onClick={() => setWeekStart(moveWeek(weekStart, 1))}><ChevronRight size={18} /></Button></HStack>} />
    {loading ? <Flex minH="360px" align="center" justify="center"><Spinner size="lg" color="brand.500" /></Flex> : data && <>
      <SectionCard mb={5}>
        <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} gap={3}>
          <Flex align="center" gap={3}><Flex w="44px" h="44px" bg="brand.50" color="brand.500" borderRadius="xl" align="center" justify="center"><CalendarDays size={22} /></Flex><Box><Text fontWeight="800">{new Date(`${data.weekStart}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – {new Date(`${data.weekEnd}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text><Text fontSize="sm" color="text.muted">{data.employee.department} · {data.employee.designation}</Text></Box></Flex>
          <Badge px={3} py={1.5} borderRadius="full" colorScheme="blue">{data.assignments.filter((item) => item.shift).length} shifts allocated</Badge>
        </Flex>
      </SectionCard>
      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        {data.assignments.map((day) => {
          const date = new Date(`${day.date}T12:00:00`); const isToday = day.date === today;
          return <Box key={day.date} bg="white" border="1px solid" borderColor={isToday ? "brand.400" : "surface.border"} borderRadius="xl" overflow="hidden" boxShadow={isToday ? "0 8px 24px rgba(11,114,231,.13)" : "sm"}>
            <Box h="5px" bg={day.shift?.color || "gray.200"} />
            <Box p={5}>
              <Flex justify="space-between" align="start" mb={5}><Box><Text fontSize="xs" textTransform="uppercase" color="text.muted" fontWeight="700">{date.toLocaleDateString("en-IN", { weekday: "long" })}</Text><Text fontSize="2xl" fontWeight="800">{date.getDate()}</Text><Text fontSize="sm" color="text.muted">{date.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</Text></Box>{isToday && <Badge colorScheme="blue">Today</Badge>}</Flex>
              {day.shift ? <Box><Flex align="center" gap={2} mb={2} color="text.heading">{day.shift.isNightShift ? <Moon size={19} /> : <Sunrise size={19} />}<Text fontWeight="800" fontSize="lg">{day.shift.name}</Text></Flex><Flex align="center" gap={2} color="text.muted"><Clock3 size={16} /><Text fontWeight="600">{day.shift.startTime.slice(0, 5)} – {day.shift.endTime.slice(0, 5)}</Text></Flex>{day.note && <Box mt={4} bg="gray.50" borderRadius="lg" p={3}><Text fontSize="xs" color="text.muted">Note</Text><Text fontSize="sm">{day.note}</Text></Box>}</Box> : <Flex minH="66px" bg="gray.50" borderRadius="lg" align="center" justify="center"><Text color="text.muted" fontWeight="600">Off / Not allocated</Text></Flex>}
            </Box>
          </Box>;
        })}
      </SimpleGrid>
      {data.employee.defaultShiftSchedule && <Text mt={5} fontSize="sm" color="text.muted">Profile shift schedule: {data.employee.defaultShiftSchedule}</Text>}
    </>}
  </Box>;
}
