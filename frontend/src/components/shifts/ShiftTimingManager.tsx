"use client";

import { useEffect, useState } from "react";
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, HStack, Input, Modal,
  ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader,
  ModalOverlay, SimpleGrid, Switch, Text, useToast,
} from "@chakra-ui/react";
import { Clock3, Edit3, Plus } from "lucide-react";
import {
  shiftApi,
  type SaveShiftDefinition,
  type ShiftDefinition,
} from "@/api/shift.api";

const EMPTY_FORM: SaveShiftDefinition = {
  code: "",
  name: "",
  startTime: "09:00",
  endTime: "18:00",
  color: "#0B72E7",
  isNightShift: false,
};

interface ShiftTimingManagerProps {
  isOpen: boolean;
  onClose: () => void;
  definitions: ShiftDefinition[];
  onChanged: () => Promise<void>;
}

export default function ShiftTimingManager({ isOpen, onClose, definitions, onChanged }: ShiftTimingManagerProps) {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SaveShiftDefinition>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (shift: ShiftDefinition) => {
    setEditingId(shift.id);
    setForm({
      code: shift.code,
      name: shift.name,
      startTime: shift.startTime.slice(0, 5),
      endTime: shift.endTime.slice(0, 5),
      color: shift.color,
      isNightShift: shift.isNightShift,
    });
  };

  useEffect(() => {
    if (!isOpen) startNew();
  }, [isOpen]);

  const save = async () => {
    const payload = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim() };
    if (!payload.code || !payload.name) {
      toast({ title: "Code and shift name are required", status: "warning" });
      return;
    }
    if (payload.startTime === payload.endTime) {
      toast({ title: "Start and end times must be different", status: "warning" });
      return;
    }

    setSaving(true);
    try {
      if (editingId) await shiftApi.updateDefinition(editingId, payload);
      else await shiftApi.createDefinition(payload);
      toast({ title: editingId ? "Shift timing updated" : "Shift timing added", status: "success" });
      startNew();
      await onChanged();
    } catch (error) {
      toast({
        title: editingId ? "Could not update shift timing" : "Could not add shift timing",
        description: error instanceof Error ? error.message : "Please try again",
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered scrollBehavior="inside">
      <ModalOverlay bg="rgba(6,31,58,.58)" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="2xl" mx={4}>
        <ModalHeader borderBottom="1px solid" borderColor="surface.border">
          <HStack><Clock3 size={20} /><Text>Manage shift timings</Text></HStack>
        </ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody py={6}>
          <Flex gap={6} direction={{ base: "column", md: "row" }} align="start">
            <Box flex="1" w="full">
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontWeight="800">Available shifts</Text>
                <Button size="sm" leftIcon={<Plus size={15} />} onClick={startNew} variant="outline">Add shift</Button>
              </Flex>
              <Flex direction="column" gap={3} maxH={{ md: "430px" }} overflowY="auto" pr={{ md: 2 }}>
                {definitions.map((shift) => (
                  <Flex
                    key={shift.id}
                    border="1px solid"
                    borderColor={editingId === shift.id ? "brand.400" : "surface.border"}
                    borderLeft="5px solid"
                    borderLeftColor={shift.color}
                    borderRadius="xl"
                    p={3}
                    align="center"
                    gap={3}
                    bg={editingId === shift.id ? "brand.50" : "white"}
                  >
                    <Box flex="1" minW={0}>
                      <HStack mb={1}>
                        <Text fontWeight="800" noOfLines={1}>{shift.name}</Text>
                        {shift.isNightShift && <Badge colorScheme="purple">Night</Badge>}
                      </HStack>
                      <Text fontSize="sm" color="text.muted">
                        {shift.startTime.slice(0, 5)}–{shift.endTime.slice(0, 5)} · {shift.code}
                      </Text>
                    </Box>
                    <Button size="sm" variant="ghost" leftIcon={<Edit3 size={15} />} onClick={() => startEdit(shift)}>Edit</Button>
                  </Flex>
                ))}
              </Flex>
            </Box>

            <Box flex="1" w="full" border="1px solid" borderColor="surface.border" borderRadius="xl" p={5}>
              <Text fontWeight="800" mb={4}>{editingId ? "Edit shift timing" : "Add shift timing"}</Text>
              <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Shift code</FormLabel>
                  <Input maxLength={30} value={form.code} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))} placeholder="GENERAL" />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Shift name</FormLabel>
                  <Input maxLength={100} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="General Shift" />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Start time</FormLabel>
                  <Input type="time" value={form.startTime} onChange={(event) => setForm((value) => ({ ...value, startTime: event.target.value }))} />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">End time</FormLabel>
                  <Input type="time" value={form.endTime} onChange={(event) => setForm((value) => ({ ...value, endTime: event.target.value }))} />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Display color</FormLabel>
                  <HStack>
                    <Input type="color" p={1} w="56px" value={form.color} onChange={(event) => setForm((value) => ({ ...value, color: event.target.value }))} />
                    <Input value={form.color} maxLength={7} onChange={(event) => setForm((value) => ({ ...value, color: event.target.value }))} />
                  </HStack>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Night shift</FormLabel>
                  <HStack h="40px">
                    <Switch isChecked={form.isNightShift} onChange={(event) => setForm((value) => ({ ...value, isNightShift: event.target.checked }))} />
                    <Text fontSize="sm" color="text.muted">Mark as overnight</Text>
                  </HStack>
                </FormControl>
              </SimpleGrid>
              <Flex justify="flex-end" gap={3} mt={5}>
                {editingId && <Button variant="ghost" onClick={startNew} isDisabled={saving}>Cancel edit</Button>}
                <Button colorScheme="blue" leftIcon={editingId ? <Edit3 size={16} /> : <Plus size={16} />} isLoading={saving} onClick={() => void save()}>
                  {editingId ? "Save changes" : "Add shift"}
                </Button>
              </Flex>
            </Box>
          </Flex>
        </ModalBody>
        <ModalFooter borderTop="1px solid" borderColor="surface.border">
          <Button variant="outline" onClick={onClose} isDisabled={saving}>Done</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
