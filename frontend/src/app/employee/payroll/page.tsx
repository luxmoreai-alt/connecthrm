"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Box,
  SimpleGrid,
  Flex,
  Text,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Divider,
  useDisclosure,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { Wallet, Download, FileText, Calendar, Eye, TrendingUp, TrendingDown } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { StyledSelect } from "@/components/ui/FormHelpers";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { payrollApi, type PayrollRecordType } from "@/api";

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const FULL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const currentYear = new Date().getFullYear();

export default function EmployeePayrollPage() {
  const [year, setYear] = useState(currentYear);
  const [records, setRecords] = useState<PayrollRecordType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PayrollRecordType | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    payrollApi
      .myPayslips(year)
      .then(setRecords)
      .catch((err: any) => {
        setRecords([]);
        setLoadError(err?.message || "Could not load your payslips. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [year]);

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      await payrollApi.downloadMyPayslipPdf(id);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, status: "error", duration: 3500, isClosable: true });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleView = (record: PayrollRecordType) => {
    setSelected(record);
    onOpen();
  };

  const columns = useMemo<Column<PayrollRecordType>[]>(
    () => [
      {
        key: "month",
        header: "Period",
        render: (row) => (
          <Flex align="center" gap={2}>
            <Flex w={8} h={8} borderRadius="lg" bg="brand.50" align="center" justify="center">
              <Calendar size={14} color="#0B72E7" />
            </Flex>
            <Text fontSize="sm" fontWeight="600" color="text.heading">
              {MONTHS[row.month - 1]} {row.year}
            </Text>
          </Flex>
        ),
      },
      {
        key: "workingDays" as any,
        header: "Paid Days",
        render: (row) => (
          <Text fontSize="sm" fontWeight="500">
            {row.payableDays} <Text as="span" fontSize="xs" color="text.muted">/ {row.workingDays}</Text>
          </Text>
        ),
      },
      {
        key: "grossEarnings",
        header: "Gross",
        render: (row) => (
          <Text fontSize="sm" color="#0D7C47" fontWeight="600">₹{row.grossEarnings.toLocaleString("en-IN")}</Text>
        ),
      },
      {
        key: "totalDeductions",
        header: "Deductions",
        render: (row) => (
          <Text fontSize="sm" color="#C41E3A" fontWeight="600">
            -₹{row.totalDeductions.toLocaleString("en-IN")}
          </Text>
        ),
      },
      {
        key: "netPay",
        header: "Net Pay",
        render: (row) => (
          <Text fontWeight="700" color="text.heading" fontSize="sm">
            ₹{row.netPay.toLocaleString("en-IN")}
          </Text>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => <StatusBadge status={row.status as any} />,
      },
      {
        key: "actions" as any,
        header: "",
        width: "140px",
        render: (row) => (
          <Flex gap={1}>
            <Tooltip label="View payslip details" hasArrow>
              <Box>
                <SecondaryButton size="xs" leftIcon={<Eye size={12} />} onClick={() => handleView(row)}>
                  View
                </SecondaryButton>
              </Box>
            </Tooltip>
            {row.hasPayslip && (
              <Tooltip label="Download payslip PDF" hasArrow>
                <Box>
                  <PrimaryButton
                    size="xs"
                    leftIcon={<Download size={12} />}
                    onClick={() => handleDownload(row.id)}
                    isLoading={downloadingId === row.id}
                    loadingText="..."
                  >
                    PDF
                  </PrimaryButton>
                </Box>
              </Tooltip>
            )}
          </Flex>
        ),
      },
    ],
    [],
  );

  const totalPaid = records.reduce((s, r) => s + r.netPay, 0);
  const totalGross = records.reduce((s, r) => s + r.grossEarnings, 0);
  const totalDeductions = records.reduce((s, r) => s + r.totalDeductions, 0);

  return (
    <Box>
      <PageHeader title="Payroll" subtitle="View your salary details and payslips" />

      <Flex gap={3} mb={5} align="center">
        <Text fontSize="sm" fontWeight="600" color="text.heading">Year:</Text>
        <StyledSelect w="120px" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </StyledSelect>
      </Flex>

      {/* Summary */}
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
        <Box bg="white" borderRadius="xl" p={5} border="1px solid" borderColor="surface.border" shadow="card">
          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="sm" color="text.muted" fontWeight="500">Total Payslips</Text>
              <Text fontSize="xl" fontWeight="700" color="text.heading" mt={1}>{records.length}</Text>
            </Box>
            <Flex w={10} h={10} borderRadius="lg" bg="#EDE9F5" align="center" justify="center">
              <FileText size={20} color="#0B72E7" />
            </Flex>
          </Flex>
        </Box>
        <Box bg="white" borderRadius="xl" p={5} border="1px solid" borderColor="surface.border" shadow="card">
          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="sm" color="text.muted" fontWeight="500">Total Earnings</Text>
              <Text fontSize="xl" fontWeight="700" color="#0D7C47" mt={1}>₹{totalGross.toLocaleString("en-IN")}</Text>
            </Box>
            <Flex w={10} h={10} borderRadius="lg" bg="#E6F9F0" align="center" justify="center">
              <TrendingUp size={20} color="#0D7C47" />
            </Flex>
          </Flex>
        </Box>
        <Box bg="white" borderRadius="xl" p={5} border="1px solid" borderColor="surface.border" shadow="card">
          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="sm" color="text.muted" fontWeight="500">Total Deductions</Text>
              <Text fontSize="xl" fontWeight="700" color="#C41E3A" mt={1}>₹{totalDeductions.toLocaleString("en-IN")}</Text>
            </Box>
            <Flex w={10} h={10} borderRadius="lg" bg="#FEF2F2" align="center" justify="center">
              <TrendingDown size={20} color="#C41E3A" />
            </Flex>
          </Flex>
        </Box>
        <Box bg="white" borderRadius="xl" p={5} border="1px solid" borderColor="surface.border" shadow="card">
          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="sm" color="text.muted" fontWeight="500">Net Received</Text>
              <Text fontSize="xl" fontWeight="700" color="text.heading" mt={1}>₹{totalPaid.toLocaleString("en-IN")}</Text>
            </Box>
            <Flex w={10} h={10} borderRadius="lg" bg="#FFF4E5" align="center" justify="center">
              <Wallet size={20} color="#B25E09" />
            </Flex>
          </Flex>
        </Box>
      </SimpleGrid>

      <SectionCard title={`Payslips — ${year}`} noPadding>
        <Box p={5}>
          {loading ? (
            <Flex justify="center" py={10}><Spinner color="brand.500" /></Flex>
          ) : loadError ? (
            <Flex direction="column" align="center" py={12} textAlign="center">
              <Text fontWeight="600" color="red.600" mb={1}>Payslips could not be loaded</Text>
              <Text color="text.muted" fontSize="sm">{loadError}</Text>
            </Flex>
          ) : records.length === 0 ? (
            <Flex direction="column" align="center" py={12} textAlign="center">
              <Flex w={14} h={14} borderRadius="2xl" bg="brand.50" align="center" justify="center" mb={4}>
                <Wallet size={24} color="#0B72E7" />
              </Flex>
              <Text fontWeight="600" color="text.heading" mb={1}>No Payslips Yet</Text>
              <Text color="text.muted" fontSize="sm">Your payslips for {year} will appear here after HR releases them.</Text>
            </Flex>
          ) : (
            <DataTable<PayrollRecordType> columns={columns} data={records} keyField="id" />
          )}
        </Box>
      </SectionCard>

      {/* Payslip Detail Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md" fontWeight="700">
            Payslip — {selected ? `${FULL_MONTHS[selected.month - 1]} ${selected.year}` : ""}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selected && (
              <Box>
                {/* Attendance */}
                <SimpleGrid columns={6} spacing={2} mb={4}>
                  {[
                    { label: "Working", value: selected.workingDays },
                    { label: "Eligible", value: selected.eligibleWorkingDays },
                    { label: "Present", value: selected.presentDays },
                    { label: "Leave", value: selected.leaveDays },
                    { label: "LOP", value: selected.lopDays },
                    { label: "Paid", value: selected.payableDays },
                  ].map((a) => (
                    <Box key={a.label} textAlign="center" p={2} bg="surface.bg" borderRadius="md">
                      <Text fontSize="lg" fontWeight="700" color="text.heading">{a.value}</Text>
                      <Text fontSize="xs" color="text.muted">{a.label}</Text>
                    </Box>
                  ))}
                </SimpleGrid>

                <Divider mb={4} />

                {/* Earnings */}
                <Text fontSize="sm" fontWeight="700" color="#0D7C47" mb={2}>Earnings</Text>
                {(selected.earnings || []).map((e, i) => (
                  <Flex key={i} justify="space-between" py={1}>
                    <Text fontSize="sm" color="text.muted">{e.name}</Text>
                    <Text fontSize="sm" fontWeight="600">₹{e.amount.toLocaleString("en-IN")}</Text>
                  </Flex>
                ))}
                <Flex justify="space-between" py={1} mt={1} borderTop="1px solid" borderColor="green.200">
                  <Text fontSize="sm" fontWeight="700" color="#0D7C47">Gross Earnings</Text>
                  <Text fontSize="sm" fontWeight="700" color="#0D7C47">₹{selected.grossEarnings.toLocaleString("en-IN")}</Text>
                </Flex>

                <Divider my={3} />

                {/* Deductions */}
                <Text fontSize="sm" fontWeight="700" color="#C41E3A" mb={2}>Deductions</Text>
                {(selected.deductions || []).map((d, i) => (
                  <Flex key={i} justify="space-between" py={1}>
                    <Text fontSize="sm" color="text.muted">{d.name}</Text>
                    <Text fontSize="sm" fontWeight="600">₹{d.amount.toLocaleString("en-IN")}</Text>
                  </Flex>
                ))}
                <Flex justify="space-between" py={1} mt={1} borderTop="1px solid" borderColor="red.200">
                  <Text fontSize="sm" fontWeight="700" color="#C41E3A">Total Deductions</Text>
                  <Text fontSize="sm" fontWeight="700" color="#C41E3A">₹{selected.totalDeductions.toLocaleString("en-IN")}</Text>
                </Flex>

                <Divider my={3} />

                {/* Net Pay */}
                <Flex justify="space-between" p={3} bg="surface.bg" borderRadius="lg">
                  <Text fontSize="md" fontWeight="700" color="brand.600">Net Pay</Text>
                  <Text fontSize="lg" fontWeight="800" color="brand.600">₹{selected.netPay.toLocaleString("en-IN")}</Text>
                </Flex>

                {selected.hasPayslip && (
                  <PrimaryButton
                    mt={4}
                    size="sm"
                    leftIcon={<Download size={14} />}
                    onClick={() => handleDownload(selected.id)}
                    isLoading={downloadingId === selected.id}
                    loadingText="Downloading..."
                    w="full"
                  >
                    Download Payslip PDF
                  </PrimaryButton>
                )}
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
