"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, HStack, Input, InputGroup,
  InputLeftElement, Select, SimpleGrid, Spinner, Text, Textarea, useToast,
} from "@chakra-ui/react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Save, Search, Users } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { shiftApi, type AdminShiftEmployee, type AdminShiftWeek, type SaveShiftDay } from "@/api/shift.api";

function mondayKey(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = value.getDay();
  value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function moveWeek(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount * 7);
  return mondayKey(date);
}

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

function weekLabel(start: string, end?: string) {
  if (!end) return "";
  const options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  return `${new Date(`${start}T12:00:00`).toLocaleDateString("en-IN", options)} – ${new Date(`${end}T12:00:00`).toLocaleDateString("en-IN", options)}`;
}

export default function AdminShiftsPage() {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(mondayKey);
  const [data, setData] = useState<AdminShiftWeek | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<SaveShiftDay[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickShiftId, setQuickShiftId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await shiftApi.getAdminWeek(weekStart);
      setData(result);
      setSelectedId((current) => current && result.employees.some((item) => item.id === current) ? current : result.employees[0]?.id || "");
    } catch (error) {
      toast({ title: "Could not load shifts", description: error instanceof Error ? error.message : "Please try again", status: "error" });
    } finally { setLoading(false); }
  }, [toast, weekStart]);

  useEffect(() => { void load(); }, [load]);
  const selected = data?.employees.find((employee) => employee.id === selectedId) || null;
  useEffect(() => {
    if (!selected) { setDraft([]); return; }
    setDraft(selected.assignments.map((item) => ({ date: item.date, shiftId: item.shift?.id || null, note: item.note })));
  }, [selected]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data?.employees.filter((item) => !term || `${item.name} ${item.empId || ""} ${item.department}`.toLowerCase().includes(term)) || [];
  }, [data, search]);

  const updateDay = (index: number, values: Partial<SaveShiftDay>) =>
    setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));

  const applyQuickShift = (weekdaysOnly: boolean) => {
    if (!quickShiftId) return;
    setDraft((current) => current.map((item, index) => index < 5 || !weekdaysOnly ? { ...item, shiftId: quickShiftId } : item));
  };

  const save = async () => {
    if (!selected || !data) return;
    setSaving(true);
    try {
      await shiftApi.saveEmployeeWeek(selected.id, data.weekStart, draft);
      toast({ title: "Shift allocation saved", status: "success" });
      await load();
    } catch (error) {
      toast({ title: "Could not save shifts", description: error instanceof Error ? error.message : "Please try again", status: "error" });
    } finally { setSaving(false); }
  };

  return (
    <Box>
      <PageHeader title="Shift Allocation" subtitle="Plan and publish weekly shifts for every employee." actions={
        <HStack>
          <Button leftIcon={<ChevronLeft size={17} />} variant="outline" onClick={() => setWeekStart(moveWeek(weekStart, -1))}>Previous</Button>
          <Button variant="outline" onClick={() => setWeekStart(mondayKey())}>This week</Button>
          <Button rightIcon={<ChevronRight size={17} />} variant="outline" onClick={() => setWeekStart(moveWeek(weekStart, 1))}>Next</Button>
        </HStack>
      } />
      <Flex align="center" gap={2} mb={5} color="text.muted"><CalendarDays size={18} /><Text fontWeight="700">{weekLabel(data?.weekStart || weekStart, data?.weekEnd)}</Text></Flex>
      {loading ? <Flex minH="360px" align="center" justify="center"><Spinner color="brand.500" size="lg" /></Flex> : (
        <Flex gap={5} align="stretch" direction={{ base: "column", lg: "row" }}>
          <SectionCard title="Employees" w={{ base: "100%", lg: "310px" }} flexShrink={0} noPadding>
            <Box p={4} borderBottom="1px solid" borderColor="surface.border">
              <InputGroup><InputLeftElement><Search size={17} /></InputLeftElement><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee" /></InputGroup>
            </Box>
            <Box maxH={{ base: "270px", lg: "610px" }} overflowY="auto">
              {filtered.map((employee) => {
                const count = employee.assignments.filter((item) => item.shift).length;
                return <Flex key={employee.id} p={4} gap={3} cursor="pointer" borderLeft="4px solid" borderColor={selectedId === employee.id ? "brand.500" : "transparent"} bg={selectedId === employee.id ? "brand.50" : "white"} borderBottom="1px solid" borderBottomColor="surface.border" onClick={() => setSelectedId(employee.id)}>
                  <Flex w="38px" h="38px" bg="blue.50" color="brand.500" borderRadius="full" align="center" justify="center"><Users size={18} /></Flex>
                  <Box minW={0} flex={1}><Text fontWeight="700" noOfLines={1}>{employee.name}</Text><Text fontSize="xs" color="text.muted" noOfLines={1}>{employee.empId || "No ID"} · {employee.department || "No department"}</Text></Box>
                  <Badge alignSelf="center" colorScheme={count === 7 ? "green" : count ? "blue" : "gray"}>{count}/7</Badge>
                </Flex>;
              })}
              {!filtered.length && <Text p={6} color="text.muted" textAlign="center">No employees found.</Text>}
            </Box>
          </SectionCard>

          <SectionCard title={selected ? selected.name : "Weekly allocation"} flex={1} actions={<Button leftIcon={<RefreshCw size={16} />} variant="ghost" onClick={() => void load()}>Refresh</Button>}>
            {!selected ? <Text color="text.muted">Select an employee to allocate shifts.</Text> : <>
              <Flex mb={5} gap={3} wrap="wrap" align="end">
                <FormControl maxW="260px"><FormLabel fontSize="sm">Quick assign</FormLabel><Select value={quickShiftId} onChange={(event) => setQuickShiftId(event.target.value)} placeholder="Choose a shift">{data?.definitions.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} ({shift.startTime.slice(0, 5)}–{shift.endTime.slice(0, 5)})</option>)}</Select></FormControl>
                <Button onClick={() => applyQuickShift(true)} isDisabled={!quickShiftId}>Apply Mon–Fri</Button>
                <Button onClick={() => applyQuickShift(false)} isDisabled={!quickShiftId}>Apply all days</Button>
                <Button variant="ghost" colorScheme="red" onClick={() => setDraft((current) => current.map((item) => ({ ...item, shiftId: null, note: "" })))}>Clear week</Button>
              </Flex>
              {selected.defaultShiftSchedule && <Text fontSize="sm" color="text.muted" mb={4}>Employee profile shift: <Text as="span" fontWeight="700">{selected.defaultShiftSchedule}</Text></Text>}
              <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
                {draft.map((day, index) => {
                  const shift = data?.definitions.find((item) => item.id === day.shiftId);
                  return <Box key={day.date} border="1px solid" borderColor="surface.border" borderRadius="xl" p={4} borderTop="4px solid" borderTopColor={shift?.color || "gray.200"}>
                    <Flex justify="space-between" align="center" mb={3}><Text fontWeight="800">{dayLabel(day.date)}</Text>{shift?.isNightShift && <Badge colorScheme="purple">Night</Badge>}</Flex>
                    <FormControl mb={3}><FormLabel fontSize="xs">Assigned shift</FormLabel><Select value={day.shiftId || ""} onChange={(event) => updateDay(index, { shiftId: event.target.value || null })}><option value="">Off / Not allocated</option>{data?.definitions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}</option>)}</Select></FormControl>
                    <FormControl><FormLabel fontSize="xs">Note (optional)</FormLabel><Textarea rows={2} value={day.note || ""} onChange={(event) => updateDay(index, { note: event.target.value })} placeholder="Handover or special instruction" /></FormControl>
                  </Box>;
                })}
              </SimpleGrid>
              <Flex justify="flex-end" mt={6}><Button colorScheme="blue" leftIcon={<Save size={17} />} isLoading={saving} onClick={() => void save()}>Save weekly shifts</Button></Flex>
            </>}
          </SectionCard>
        </Flex>
      )}
    </Box>
  );
}
