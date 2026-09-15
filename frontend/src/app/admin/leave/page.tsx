"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  SimpleGrid,
  Spinner,
  useToast,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Select,
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Textarea,
  InputGroup,
  InputLeftElement,
} from "@chakra-ui/react";
import {
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Search,
  AlertTriangle,
  Eye,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import {
  leaveApi,
  type LeaveRequestRecord,
  type LeaveType,
  type LeaveStatusType,
} from "@/api/leave.api";

type TabKey = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
const TABS: TabKey[] = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

const STATUS_COLORS: Record<LeaveStatusType, { bg: string; color: string }> = {
  PENDING: { bg: "#FEF9EC", color: "#92640D" },
  APPROVED: { bg: "#E6F9F0", color: "#0D7C47" },
  REJECTED: { bg: "#FEF0F0", color: "#C41E3A" },
  CANCELLED: { bg: "#F5F7FB", color: "#6B7A99" },
};

export default function AdminLeavePage() {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isReasonOpen,
    onOpen: onReasonOpen,
    onClose: onReasonClose,
  } = useDisclosure();

  const [requests, setRequests] = useState<LeaveRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("PENDING");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");

  // Action modal
  const [selectedReq, setSelectedReq] = useState<LeaveRequestRecord | null>(null);
  const [reasonRequest, setReasonRequest] = useState<LeaveRequestRecord | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "override">("approve");
  const [actionRemarks, setActionRemarks] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<LeaveStatusType>("APPROVED");
  const [overrideType, setOverrideType] = useState<LeaveType>("CL");
  const [approveType, setApproveType] = useState<LeaveType>("CL");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const statusFilter = activeTab === "ALL" ? undefined : activeTab;
      const typeFilter = filterType === "ALL" ? undefined : filterType;
      const res = await leaveApi.getAdminRequests({
        status: statusFilter as LeaveStatusType | undefined,
        leaveType: typeFilter as LeaveType | undefined,
        search: searchQuery || undefined,
      });
      setRequests(res.requests);
    } catch {
      toast({ title: "Failed to load leave requests", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterType, searchQuery, toast]);

  useEffect(() => {
    setLoading(true);
    fetchRequests();
  }, [fetchRequests]);

  // Stats
  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "PENDING").length;
    const approved = requests.filter((r) => r.status === "APPROVED").length;
    const rejected = requests.filter((r) => r.status === "REJECTED").length;
    return { pending, approved, rejected, total: requests.length };
  }, [requests]);

  const openAction = (req: LeaveRequestRecord, action: "approve" | "reject" | "override") => {
    setSelectedReq(req);
    setActionType(action);
    setActionRemarks("");
    setOverrideStatus("APPROVED");
    const defaultTreatment = (req.suggestedLeaveType ?? req.approvedLeaveType ?? req.leaveType) as LeaveType;
    setOverrideType(defaultTreatment);
    setApproveType(defaultTreatment);
    onOpen();
  };

  const openReason = (req: LeaveRequestRecord) => {
    setReasonRequest(req);
    onReasonOpen();
  };

  const handleAction = async () => {
    if (!selectedReq) return;
    setActionLoading(true);
    try {
      if (actionType === "approve") {
        await leaveApi.approveRequest(selectedReq.id, {
          remarks: actionRemarks || undefined,
          approvedLeaveType: approveType,
        });
      } else if (actionType === "reject") {
        await leaveApi.rejectRequest(selectedReq.id, actionRemarks || undefined);
      } else {
        await leaveApi.overrideRequest(selectedReq.id, {
          status: overrideStatus,
          remarks: actionRemarks || undefined,
          approvedLeaveType: overrideType,
        });
      }
      toast({
        title: actionType === "approve" ? "Leave approved" : actionType === "reject" ? "Leave rejected" : "Leave overridden",
        status: "success",
        duration: 2000,
        isClosable: true,
        position: "top-right",
      });
      onClose();
      await fetchRequests();
    } catch (err: any) {
      toast({ title: err?.message || "Action failed", status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && requests.length === 0) {
    return (
      <Box>
        <PageHeader title="Leave Management" subtitle="Review and manage leave requests" />
        <Flex justify="center" py={20}><Spinner size="lg" color="brand.400" /></Flex>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader title="Leave Management" subtitle="Review and manage leave requests" />

      {/* Summary Cards */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <StatCard icon={<Clock size={18} />} label="Pending" value={stats.pending} color="#92640D" bg="#FEF9EC" />
        <StatCard icon={<CheckCircle size={18} />} label="Approved" value={stats.approved} color="#0D7C47" bg="#E6F9F0" />
        <StatCard icon={<XCircle size={18} />} label="Rejected" value={stats.rejected} color="#C41E3A" bg="#FEE7E7" />
        <StatCard icon={<FileText size={18} />} label="Total" value={stats.total} color="#0B72E7" bg="#EDE9F5" />
      </SimpleGrid>

      <SectionCard noPadding>
        {/* Tabs */}
        <HStack spacing={0} px={5} pt={4} pb={0} borderBottom="1px solid" borderColor="surface.border">
          {TABS.map((tab) => (
            <Button
              key={tab}
              variant="ghost"
              size="sm"
              fontWeight="600"
              fontSize="sm"
              borderRadius="0"
              borderBottom="2px solid"
              borderColor={activeTab === tab ? "brand.400" : "transparent"}
              color={activeTab === tab ? "brand.400" : "text.muted"}
              _hover={{ color: "brand.400" }}
              onClick={() => setActiveTab(tab)}
              pb={3}
              px={4}
            >
              {tab === "ALL" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </Button>
          ))}
        </HStack>

        {/* Filters */}
        <Flex px={5} py={3} gap={3} borderBottom="1px solid" borderColor="surface.border" flexWrap="wrap">
          <InputGroup maxW="260px" size="sm">
            <InputLeftElement pointerEvents="none">
              <Search size={14} color="#A0AEC0" />
            </InputLeftElement>
            <Input
              placeholder="Search employee..."
              borderRadius="lg"
              bg="surface.bg"
              border="1px solid"
              borderColor="surface.border"
              fontSize="sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>
          <Select
            maxW="160px" size="sm" borderRadius="lg" bg="surface.bg" border="1px solid" borderColor="surface.border" fontSize="sm"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="ALL">All Types</option>
            <option value="CL">Casual Leave</option>
            <option value="SL">Sick Leave</option>
            <option value="EL">Emergency Leave</option>
            <option value="LOP">LOP</option>
            <option value="PERMISSION">Permission</option>
          </Select>
        </Flex>

        {/* Table */}
        <Box overflowX="auto" p={5} pt={0}>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Employee</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Requested / Final</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Mode</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Date / Range</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Days/Hrs</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Status</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Applied</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Reason</Th>
                <Th fontSize="xs" color="text.muted" fontWeight="600" textTransform="uppercase" borderColor="surface.border">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {requests.length === 0 ? (
                <Tr>
                  <Td colSpan={9} textAlign="center" py={10}>
                    <Text color="text.muted" fontSize="sm">No leave requests found</Text>
                  </Td>
                </Tr>
              ) : (
                requests.map((req) => {
                  const sc = STATUS_COLORS[req.status];
                  return (
                    <Tr key={req.id} _hover={{ bg: "surface.bg" }}>
                      <Td borderColor="surface.border">
                        <Text fontSize="sm" fontWeight="600" color="text.heading">{req.employeeName ?? "—"}</Text>
                        <Text fontSize="xs" color="text.muted">{req.employeeCode ?? ""}</Text>
                        {req.inProbation && (
                          <Badge bg="#FEF9EC" color="#92640D" fontSize="2xs" px={1.5} borderRadius="full" mt={0.5}>
                            <Flex align="center" gap={1}><AlertTriangle size={10} /> Probation</Flex>
                          </Badge>
                        )}
                      </Td>
                      <Td borderColor="surface.border">
                        <Badge px={2} py={0.5} borderRadius="full" bg="#EDE9F5" color="#0B72E7" fontSize="xs" fontWeight="600">
                          {req.requestedLeaveType}
                        </Badge>
                        <Text fontSize="2xs" color="text.muted" mt={1}>
                          Final: {req.approvedLeaveType ?? req.suggestedLeaveType ?? "-"}
                        </Text>
                      </Td>
                      <Td fontSize="xs" color="text.body" borderColor="surface.border">
                        {req.requestMode.replace("_", " ")}
                      </Td>
                      <Td fontSize="sm" color="text.body" borderColor="surface.border">
                        {formatDateRange(req)}
                      </Td>
                      <Td fontSize="sm" color="text.body" borderColor="surface.border">
                        {req.totalHours ? `${req.totalHours}h` : req.totalDays ? `${req.totalDays}d` : "—"}
                      </Td>
                      <Td borderColor="surface.border">
                        <Badge px={2} py={0.5} borderRadius="full" bg={sc.bg} color={sc.color} fontSize="xs" fontWeight="600">
                          {req.status}
                        </Badge>
                      </Td>
                      <Td fontSize="sm" color="text.body" borderColor="surface.border">
                        {new Date(req.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Td>
                      <Td fontSize="xs" color="text.muted" borderColor="surface.border" maxW="160px">
                        <Text noOfLines={2}>{req.reason}</Text>
                        <Button
                          size="xs"
                          variant="link"
                          colorScheme="blue"
                          leftIcon={<Eye size={13} />}
                          mt={1}
                          onClick={() => openReason(req)}
                        >
                          View full reason
                        </Button>
                        {req.treatmentNote && (
                          <Text noOfLines={2} mt={1} color="orange.700">
                            {req.treatmentNote}
                          </Text>
                        )}
                      </Td>
                      <Td borderColor="surface.border" minW="230px">
                        {req.status === "PENDING" && (
                          <HStack spacing={2} mb={2}>
                            <Button size="xs" colorScheme="green" variant="solid" leftIcon={<CheckCircle size={13} />} onClick={() => openAction(req, "approve")}>
                              Approve
                            </Button>
                            <Button size="xs" colorScheme="red" variant="outline" leftIcon={<XCircle size={13} />} onClick={() => openAction(req, "reject")}>
                              Reject
                            </Button>
                          </HStack>
                        )}
                        <Button size="xs" variant="outline" colorScheme="blue" leftIcon={<AlertTriangle size={13} />} onClick={() => openAction(req, "override")}>
                          Override
                        </Button>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </Table>
        </Box>
      </SectionCard>

      {/* Full leave reason */}
      <Modal
        isOpen={isReasonOpen}
        onClose={onReasonClose}
        isCentered
        size="lg"
        onCloseComplete={() => setReasonRequest(null)}
      >
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader borderBottom="1px solid" borderColor="surface.border" fontSize="md" fontWeight="700">
            Leave reason
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody py={5}>
            {reasonRequest && (
              <Flex direction="column" gap={3}>
                <Box>
                  <Text fontSize="sm" fontWeight="600" color="text.heading">
                    {reasonRequest.employeeName ?? "Employee"}
                  </Text>
                  <Text fontSize="xs" color="text.muted">
                    {reasonRequest.requestedLeaveType} · {formatDateRange(reasonRequest)}
                  </Text>
                </Box>
                <Box bg="surface.bg" borderRadius="lg" p={4}>
                  <Text whiteSpace="pre-wrap" fontSize="sm" color="text.body">
                    {reasonRequest.reason}
                  </Text>
                </Box>
                {reasonRequest.treatmentNote && (
                  <Box>
                    <Text fontSize="xs" fontWeight="600" color="text.muted" textTransform="uppercase" mb={1}>
                      Treatment note
                    </Text>
                    <Text whiteSpace="pre-wrap" fontSize="sm" color="orange.700">
                      {reasonRequest.treatmentNote}
                    </Text>
                  </Box>
                )}
              </Flex>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onReasonClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Action Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader borderBottom="1px solid" borderColor="surface.border" fontSize="md" fontWeight="700">
            {actionType === "approve" ? "Approve Leave" : actionType === "reject" ? "Reject Leave" : "Override Leave"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody py={5}>
            {selectedReq && (
              <Flex direction="column" gap={4}>
                <Box bg="surface.bg" borderRadius="lg" p={3}>
                  <Text fontSize="sm" fontWeight="600" color="text.heading">{selectedReq.employeeName}</Text>
                  <Text fontSize="xs" color="text.muted">
                    {selectedReq.leaveType} · {selectedReq.requestMode.replace("_", " ")} · {formatDateRange(selectedReq)}
                  </Text>
                  <Text fontSize="xs" color="text.muted" mt={1}>Reason: {selectedReq.reason}</Text>
                </Box>

                {actionType === "override" && (
                  <>
                    <Box>
                      <Text fontSize="sm" fontWeight="600" color="text.heading" mb={1}>Override Status</Text>
                      <Select
                        size="sm" borderRadius="lg" bg="surface.bg" border="1px solid" borderColor="surface.border" fontSize="sm"
                        value={overrideStatus}
                        onChange={(e) => setOverrideStatus(e.target.value as LeaveStatusType)}
                      >
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="CANCELLED">Cancelled</option>
                      </Select>
                    </Box>
                    <Box>
                      <Text fontSize="sm" fontWeight="600" color="text.heading" mb={1}>Override Leave Type</Text>
                      <Select
                        size="sm" borderRadius="lg" bg="surface.bg" border="1px solid" borderColor="surface.border" fontSize="sm"
                        value={overrideType}
                        onChange={(e) => setOverrideType(e.target.value as LeaveType)}
                      >
                        {selectedReq?.requestMode === "PERMISSION" ? (
                          <option value="PERMISSION">Permission</option>
                        ) : (
                          <>
                            <option value="CL">Casual Leave</option>
                            <option value="SL">Sick Leave</option>
                            <option value="EL">Emergency Leave</option>
                            <option value="LOP">Loss of Pay</option>
                          </>
                        )}
                      </Select>
                    </Box>
                  </>
                )}

                {actionType === "approve" && (
                  <Box>
                    <Text fontSize="sm" fontWeight="600" color="text.heading" mb={1}>Final Treatment</Text>
                    <Select
                      size="sm" borderRadius="lg" bg="surface.bg" border="1px solid" borderColor="surface.border" fontSize="sm"
                      value={approveType}
                      onChange={(e) => setApproveType(e.target.value as LeaveType)}
                    >
                      {selectedReq?.requestMode === "PERMISSION" ? (
                        <option value="PERMISSION">Permission</option>
                      ) : (
                        <>
                          <option value="CL">Casual Leave</option>
                          <option value="SL">Sick Leave</option>
                          <option value="EL">Emergency Leave</option>
                          <option value="LOP">Loss of Pay</option>
                        </>
                      )}
                    </Select>
                    {selectedReq?.treatmentNote && (
                      <Text fontSize="xs" color="orange.700" mt={1}>{selectedReq.treatmentNote}</Text>
                    )}
                  </Box>
                )}

                <Box>
                  <Text fontSize="sm" fontWeight="600" color="text.heading" mb={1}>Remarks (optional)</Text>
                  <Textarea
                    size="sm" borderRadius="lg" bg="surface.bg" border="1px solid" borderColor="surface.border" fontSize="sm"
                    rows={3}
                    placeholder="Add remarks..."
                    value={actionRemarks}
                    onChange={(e) => setActionRemarks(e.target.value)}
                    maxLength={500}
                  />
                </Box>
              </Flex>
            )}
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="surface.border" gap={2}>
            <Button size="sm" variant="ghost" onClick={onClose} borderRadius="lg">Cancel</Button>
            <Button
              size="sm"
              borderRadius="lg"
              isLoading={actionLoading}
              onClick={handleAction}
              colorScheme={actionType === "approve" ? "green" : actionType === "reject" ? "red" : "brand"}
            >
              {actionType === "approve" ? "Approve" : actionType === "reject" ? "Reject" : "Override"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

// ── Helpers ──

function StatCard({ icon, label, value, color, bg }: {
  icon: React.ReactNode; label: string; value: number; color: string; bg: string;
}) {
  return (
    <Box bg="white" borderRadius="xl" p={4} border="1px solid" borderColor="surface.border" shadow="card">
      <Flex align="center" gap={2} mb={2}>
        <Flex w={7} h={7} borderRadius="lg" bg={bg} align="center" justify="center" color={color}>
          {icon}
        </Flex>
        <Text fontSize="xs" fontWeight="600" textTransform="uppercase" color="text.muted">{label}</Text>
      </Flex>
      <Text fontSize="xl" fontWeight="700" color="text.heading">{value}</Text>
    </Box>
  );
}

function formatDateRange(rec: LeaveRequestRecord): string {
  if (rec.requestMode === "FULL_DAY") {
    if (rec.startDate === rec.endDate) {
      return rec.startDate
        ? new Date(rec.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "—";
    }
    const s = rec.startDate ? new Date(rec.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    const e = rec.endDate ? new Date(rec.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    return `${s} – ${e}`;
  }
  if (rec.requestMode === "HALF_DAY") {
    const d = rec.date ? new Date(rec.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
    return `${d} (${rec.halfDaySession})`;
  }
  const d = rec.date ? new Date(rec.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
  return `${d} ${rec.fromTime?.slice(0, 5) ?? ""}–${rec.toTime?.slice(0, 5) ?? ""}`;
}
