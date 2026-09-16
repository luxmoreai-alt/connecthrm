"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Flex,
  Text,
  SimpleGrid,
  useToast,
  IconButton,
  HStack,
  Badge,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
} from "@chakra-ui/react";
import { Eye, Plus, Trash2, Download, FileText, Mail, ClipboardList, CheckCircle2, Search, BellRing, ArrowLeft } from "lucide-react";
import { documentsApi, employeeApi } from "@/api";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { Field, StyledSelect } from "@/components/ui/FormHelpers";
import UploadDropzone, { formatBytes } from "@/components/ui/UploadDropzone";
import EmployeeSelector from "@/components/ui/EmployeeSelector";
import { ONBOARDING_DOCUMENTS } from "@/components/employees/OnboardingDocuments";
import type { DocumentRow, DropdownEmployee, EmployeeFromAPI } from "@/types";

/** Server origin (no /api suffix) — used for static file URLs */
const DOCUMENT_TYPES = [
  "Aadhaar Card",
  "PAN Card",
  "Passport",
  "Driving License",
  "Voter ID",
  "Resume",
  "Signed Offer Letter",
  "Signed Appointment Letter",
  "12th or Diploma Certificate",
  "Consolidated Marksheet",
  "Degree or Course Completion Certificate",
  "Previous 3 Months Payslips",
  "Previous 3 Months Bank Statements",
  "Relieving Letter",
  "Experience Letter",
  "Salary Certificate",
  "Bank Statement",
  "Educational Certificate",
  "Passport Photo",
  "Other",
];

function getTypeColor(type: string) {
  const map: Record<string, string> = {
    Aadhaar: "blue",
    "PAN Card": "orange",
    Passport: "brand",
    Resume: "teal",
    "Offer Letter": "green",
    "Relieving Letter": "pink",
    "Experience Letter": "cyan",
    Photo: "yellow",
  };
  return map[type] || "gray";
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ── View Modal ─────────────────────────────────────────────────── */
function ViewModal({
  isOpen,
  onClose,
  record,
}: {
  isOpen: boolean;
  onClose: () => void;
  record: DocumentRow | null;
}) {
  const toast = useToast();
  if (!record) return null;
  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <Flex justify="space-between" py={1.5} borderBottom="1px solid" borderColor="gray.50">
      <Text fontSize="sm" color="text.muted" fontWeight="500">{label}</Text>
      <Text fontSize="sm" color="text.body" fontWeight="500">{value || "—"}</Text>
    </Flex>
  );

  const isPreviewable = record.mimeType.startsWith("image/") || record.mimeType === "application/pdf";
  const fileUrl = record.filePath.startsWith("http") ? record.filePath : null;
  const download = async () => {
    try {
      await documentsApi.download(record.id, record.originalName);
    } catch (error: any) {
      toast({ title: "Download failed", description: error?.message, status: "error", duration: 4000, isClosable: true });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader borderBottom="1px solid" borderColor="surface.border">
          <Text fontWeight="700">Document Details</Text>
          <Text fontSize="xs" color="text.muted">{record.empId} · {record.employeeName}</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody py={5}>
          <InfoRow label="Document Type" value={record.documentType} />
          <InfoRow label="Original Name" value={record.originalName} />
          <InfoRow label="Size" value={formatBytes(record.size)} />
          <InfoRow label="MIME Type" value={record.mimeType} />
          <InfoRow label="Uploaded At" value={formatDate(record.createdAt)} />
          <InfoRow label="Employee" value={`${record.employeeName} (${record.empId})`} />
          <InfoRow label="Email" value={record.email} />

          {isPreviewable && fileUrl && (
            <Box mt={4} border="1px solid" borderColor="surface.border" borderRadius="lg" overflow="hidden">
              {record.mimeType.startsWith("image/") ? (
                <Box as="img" src={fileUrl} alt={record.originalName} w="100%" maxH="400px" objectFit="contain" bg="gray.50" />
              ) : (
                <Box as="iframe" src={fileUrl} w="100%" h="400px" />
              )}
            </Box>
          )}

          {isPreviewable && !fileUrl && (
            <Box mt={4} p={4} borderRadius="lg" bg="orange.50" color="orange.700" fontSize="sm">
              This file was uploaded to temporary storage and is no longer available. Delete this record and upload the document again.
            </Box>
          )}

          <Flex mt={4} justify="flex-end">
            <Button
              onClick={download}
              size="sm"
              colorScheme="brand"
              leftIcon={<Download size={14} />}
            >
              Download
            </Button>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/* ── Upload Form ────────────────────────────────────────────────── */
function UploadForm({
  onDone,
  onCancel,
  initialUserId = "",
}: {
  onDone: () => void;
  onCancel: () => void;
  initialUserId?: string;
}) {
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [documentType, setDocumentType] = useState("Other");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const handleUpload = async () => {
    if (!selectedUserId) {
      toast({ title: "Please select an employee", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    if (!files.length) {
      toast({ title: "No files selected", status: "warning", duration: 2000, isClosable: true });
      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      fd.append("documentType", documentType);
      await documentsApi.upload(selectedUserId, fd);
      toast({ title: "Documents uploaded successfully", status: "success", duration: 3000, isClosable: true });
      onDone();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Error", status: "error", duration: 4000, isClosable: true });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="700" color="text.heading">Upload Documents</Text>
        <SecondaryButton size="sm" onClick={onCancel}>Back to List</SecondaryButton>
      </Flex>

      <SectionCard mb={4}>
        <EmployeeSelector value={selectedUserId} onChange={setSelectedUserId} />
      </SectionCard>

      <SectionCard mb={4}>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
          <Field label="Document Type">
            <StyledSelect value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </StyledSelect>
          </Field>
        </SimpleGrid>

        <Field label="Select Files">
          <UploadDropzone files={files} onChange={setFiles} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" maxFiles={20} />
        </Field>
      </SectionCard>

      <SectionCard>
        <Flex justify="flex-end" gap={3}>
          <SecondaryButton size="sm" onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton size="sm" onClick={handleUpload} isLoading={uploading}>Upload Documents</PrimaryButton>
        </Flex>
      </SectionCard>
    </Box>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function DocumentsPage() {
  const [records, setRecords] = useState<DocumentRow[]>([]);
  const [allDocuments, setAllDocuments] = useState<DocumentRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeFromAPI[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<DropdownEmployee | null>(null);
  const [view, setView] = useState<"directory" | "detail" | "upload">("directory");
  const [viewRecord, setViewRecord] = useState<DocumentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendUserId, setSendUserId] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const viewModal = useDisclosure();
  const deleteDisclosure = useDisclosure();
  const sendDisclosure = useDisclosure();
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const fetchRecords = useCallback(async (userId: string) => {
    if (!userId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await documentsApi.getByUserId(userId);
      setRecords(res.data);
    } catch {
      toast({ title: "Failed to load documents", status: "error", duration: 3000, isClosable: true });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchDirectory = useCallback(async () => {
    try {
      setDirectoryLoading(true);
      const [employeeResult, documentResult] = await Promise.all([employeeApi.list(), documentsApi.list()]);
      setEmployees(employeeResult.data);
      setAllDocuments(documentResult.data);
    } catch {
      toast({ title: "Failed to load employee document status", status: "error", duration: 3000, isClosable: true });
    } finally {
      setDirectoryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchRecords(selectedUserId);
  }, [fetchRecords, selectedUserId]);

  useEffect(() => {
    void fetchDirectory();
  }, [fetchDirectory]);

  const isExperienced = selectedEmployee?.employmentType?.trim().toLowerCase() === "experienced";
  const requiredDocuments = ONBOARDING_DOCUMENTS.filter((item) => !item.ifApplicable || isExperienced);
  const pendingDocuments = requiredDocuments.filter(
    (item) => !records.some((record) => record.documentType === item.type),
  );
  const completedDocuments = requiredDocuments.length - pendingDocuments.length;

  const handleView = (row: DocumentRow) => {
    setViewRecord(row);
    viewModal.onOpen();
  };

  const handleDeleteClick = (row: DocumentRow) => {
    setDeleteTarget(row);
    deleteDisclosure.onOpen();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await documentsApi.remove(deleteTarget.id);
      toast({ title: "Document deleted", status: "success", duration: 3000, isClosable: true });
      deleteDisclosure.onClose();
      setDeleteTarget(null);
      fetchRecords(selectedUserId);
      void fetchDirectory();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message || "Error", status: "error", duration: 4000, isClosable: true });
    } finally {
      setDeleting(false);
    }
  };

  const handleUploadDone = () => {
    setView("detail");
    fetchRecords(selectedUserId);
    void fetchDirectory();
  };

  const openEmployeeDocuments = (employee: EmployeeFromAPI) => {
    setSelectedUserId(employee.user.id);
    setSelectedEmployee({
      userId: employee.user.id,
      empId: employee.user.empId || "",
      firstName: employee.user.firstName,
      lastName: employee.user.lastName,
      employmentType: employee.employmentType,
    });
    setSearchQuery("");
    setView("detail");
  };

  const sendDocumentReminder = async (userId: string) => {
    try {
      setSendingLink(true);
      const result = await employeeApi.sendOnboardingLink(userId);
      toast({
        title: "Document reminder sent",
        description: `A reminder was emailed to ${result.email}`,
        status: "success",
      });
    } catch (error: any) {
      toast({ title: "Could not send document reminder", description: error?.message, status: "error" });
    } finally {
      setSendingLink(false);
    }
  };

  const handleDownload = async (row: DocumentRow) => {
    try {
      await documentsApi.download(row.id, row.originalName);
    } catch (error: any) {
      toast({ title: "Download failed", description: error?.message, status: "error", duration: 4000, isClosable: true });
    }
  };

  const sendOnboardingLink = async () => {
    if (!sendUserId) {
      toast({ title: "Select an employee", status: "warning" });
      return;
    }
    try {
      setSendingLink(true);
      const result = await employeeApi.sendOnboardingLink(sendUserId);
      toast({ title: "Onboarding link sent", description: `Email sent to ${result.email}`, status: "success" });
      setSendUserId("");
      sendDisclosure.onClose();
    } catch (error: any) {
      toast({ title: "Could not send onboarding link", description: error?.message, status: "error" });
    } finally {
      setSendingLink(false);
    }
  };

  const filteredRecords = records.filter((record) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [record.empId, record.employeeName, record.email, record.originalName, record.documentType]
      .some((value) => value?.toLowerCase().includes(query));
  });

  const filteredEmployees = employees.filter((employee) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      employee.user.firstName,
      employee.user.lastName,
      employee.user.empId,
      employee.designation,
      employee.department,
    ].some((value) => value?.toLowerCase().includes(query));
  });

  const documentProgress = (employee: EmployeeFromAPI) => {
    const required = ONBOARDING_DOCUMENTS.filter(
      (document) => !document.ifApplicable || employee.employmentType?.trim().toLowerCase() === "experienced",
    );
    const uploaded = allDocuments.filter((document) => document.userId === employee.user.id);
    const completed = required.filter((document) => uploaded.some((uploadedDocument) => uploadedDocument.documentType === document.type)).length;
    return { completed, total: required.length, pending: required.length - completed, uploaded: uploaded.length };
  };

  const columns: Column<DocumentRow>[] = [
    {
      key: "empId",
      header: "Emp ID",
      width: "90px",
      render: (row) => (
        <Text fontWeight="600" fontSize="sm" color="brand.500">{row.empId}</Text>
      ),
    },
    {
      key: "employeeName",
      header: "Employee",
      render: (row) => (
        <Box>
          <Text fontWeight="600" fontSize="sm">{row.employeeName}</Text>
          <Text fontSize="xs" color="text.muted">{row.email}</Text>
        </Box>
      ),
    },
    {
      key: "originalName",
      header: "File Name",
      render: (row) => (
        <HStack spacing={2}>
          <Box color="brand.400"><FileText size={16} /></Box>
          <Box minW={0}>
            <Text fontWeight="600" fontSize="sm" noOfLines={1}>{row.originalName}</Text>
            <Text fontSize="xs" color="text.muted">{formatBytes(row.size)}</Text>
          </Box>
        </HStack>
      ),
    },
    {
      key: "documentType",
      header: "Type",
      width: "140px",
      render: (row) => (
        <Badge variant="subtle" colorScheme={getTypeColor(row.documentType)} fontSize="xs">
          {row.documentType}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Uploaded",
      width: "110px",
      render: (row) => <Text fontSize="sm">{formatDate(row.createdAt)}</Text>,
    },
    {
      key: "actions",
      header: "Actions",
      width: "120px",
      render: (row) => (
        <HStack spacing={1}>
          <IconButton
            aria-label="View"
            icon={<Eye size={16} />}
            size="sm"
            variant="ghost"
            color="text.muted"
            _hover={{ color: "brand.400", bg: "brand.50" }}
            onClick={() => handleView(row)}
          />
          <IconButton
            aria-label="Download"
            icon={<Download size={16} />}
            size="sm"
            variant="ghost"
            color="text.muted"
            _hover={{ color: "green.500", bg: "green.50" }}
            onClick={() => handleDownload(row)}
          />
          <IconButton
            aria-label="Delete"
            icon={<Trash2 size={16} />}
            size="sm"
            variant="ghost"
            color="text.muted"
            _hover={{ color: "red.500", bg: "red.50" }}
            onClick={() => handleDeleteClick(row)}
          />
        </HStack>
      ),
    },
  ];

  if (view === "directory") {
    return (
      <Box>
        <PageHeader
          title="Documents"
          subtitle="Review employee document status and manage uploaded files."
          actions={<HStack>
            <SecondaryButton size="sm" leftIcon={<Mail size={16} />} onClick={sendDisclosure.onOpen}>Send upload link</SecondaryButton>
            <PrimaryButton size="sm" leftIcon={<Plus size={16} />} onClick={() => setView("upload")}>Upload New</PrimaryButton>
          </HStack>}
        />

        <SectionCard>
          <Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap={3} mb={5}>
            <Box>
              <Text fontSize="lg" fontWeight="800" color="text.heading">Employee documents</Text>
              <Text fontSize="sm" color="text.muted">Select an employee to view, upload, download, or manage their documents.</Text>
            </Box>
            <InputGroup maxW={{ base: "100%", md: "340px" }}>
              <InputLeftElement pointerEvents="none"><Search size={16} color="#A0AEC0" /></InputLeftElement>
              <Input
                placeholder="Search name, ID, designation..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                borderRadius="lg"
                bg="surface.bg"
                borderColor="surface.border"
              />
            </InputGroup>
          </Flex>

          {directoryLoading ? (
            <Flex minH="300px" align="center" justify="center"><Spinner color="brand.500" /></Flex>
          ) : filteredEmployees.length === 0 ? (
            <Flex minH="220px" align="center" justify="center" direction="column" color="text.muted">
              <ClipboardList size={34} />
              <Text mt={3} fontWeight="700" color="text.heading">No employees found</Text>
              <Text mt={1} fontSize="sm">Try a different employee name, ID, or designation.</Text>
            </Flex>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
              {filteredEmployees.map((employee) => {
                const progress = documentProgress(employee);
                const isComplete = progress.pending === 0;
                return (
                  <Box key={employee.id} border="1px solid" borderColor="surface.border" borderRadius="xl" p={5} bg="white" transition="all .2s ease" _hover={{ borderColor: "brand.300", boxShadow: "md", transform: "translateY(-2px)" }}>
                    <Flex justify="space-between" gap={3} align="flex-start">
                      <Box minW={0}>
                        <Text fontWeight="800" color="text.heading" noOfLines={1}>{employee.user.firstName} {employee.user.lastName}</Text>
                        <Text fontSize="sm" color="brand.500" fontWeight="600">{employee.user.empId || "Employee ID unavailable"}</Text>
                        <Text mt={1} fontSize="sm" color="text.muted" noOfLines={1}>{employee.designation || "Designation not set"}</Text>
                      </Box>
                      <Badge colorScheme={isComplete ? "green" : "orange"} borderRadius="full" px={2.5} py={1} whiteSpace="nowrap">
                        {isComplete ? "Complete" : `${progress.pending} pending`}
                      </Badge>
                    </Flex>

                    <Box mt={4} p={3} bg={isComplete ? "green.50" : "orange.50"} borderRadius="lg">
                      <Flex justify="space-between" align="center">
                        <Text fontSize="xs" fontWeight="700" color="text.muted" textTransform="uppercase">Required documents</Text>
                        <Text fontSize="sm" fontWeight="800" color={isComplete ? "green.700" : "orange.700"}>{progress.completed}/{progress.total}</Text>
                      </Flex>
                      <Text mt={1} fontSize="xs" color="text.muted">{progress.uploaded} uploaded file{progress.uploaded === 1 ? "" : "s"}</Text>
                    </Box>

                    <PrimaryButton w="100%" mt={4} size="sm" leftIcon={<Eye size={15} />} onClick={() => openEmployeeDocuments(employee)}>
                      View documents
                    </PrimaryButton>
                  </Box>
                );
              })}
            </SimpleGrid>
          )}
        </SectionCard>

        <Modal isOpen={sendDisclosure.isOpen} onClose={sendDisclosure.onClose} isCentered>
          <ModalOverlay />
          <ModalContent borderRadius="xl">
            <ModalHeader>Send onboarding upload link</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text fontSize="sm" color="text.muted" mb={4}>Select an employee. They will receive an email with the personal-details link, complete document checklist, and upload instructions.</Text>
              <EmployeeSelector value={sendUserId} onChange={setSendUserId} />
            </ModalBody>
            <Flex justify="flex-end" gap={3} p={6} pt={4}>
              <SecondaryButton onClick={sendDisclosure.onClose}>Cancel</SecondaryButton>
              <PrimaryButton leftIcon={<Mail size={15} />} onClick={sendOnboardingLink} isLoading={sendingLink}>Send email</PrimaryButton>
            </Flex>
          </ModalContent>
        </Modal>
      </Box>
    );
  }

  if (view === "upload") {
    return (
      <Box>
        <PageHeader title="Documents" subtitle="Upload employee documents." />
        <UploadForm initialUserId={selectedUserId} onDone={handleUploadDone} onCancel={() => setView(selectedUserId ? "detail" : "directory")} />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Documents"
        subtitle="Upload and manage employee documents."
        actions={<HStack>
          <SecondaryButton size="sm" leftIcon={<ArrowLeft size={16} />} onClick={() => { setSearchQuery(""); setView("directory"); }}>All employees</SecondaryButton>
          <SecondaryButton size="sm" leftIcon={<Mail size={16} />} onClick={sendDisclosure.onOpen}>Send upload link</SecondaryButton>
          <PrimaryButton size="sm" leftIcon={<Plus size={16} />} onClick={() => setView("upload")}>Upload New</PrimaryButton>
        </HStack>}
      />

      <SectionCard>
        <Flex
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={3}
          mb={selectedUserId ? 5 : 0}
        >
          <Box flex="1">
            <EmployeeSelector
              value={selectedUserId}
              onChange={setSelectedUserId}
              onEmployeeChange={setSelectedEmployee}
              compact
            />
          </Box>
          {selectedUserId && !loading && (
            <Badge colorScheme="blue" px={3} py={1.5} borderRadius="full">
              {records.length} uploaded
            </Badge>
          )}
        </Flex>

        {!selectedUserId ? (
          <Flex minH="220px" align="center" justify="center" direction="column" textAlign="center" color="text.muted">
            <ClipboardList size={34} />
            <Text mt={3} fontWeight="700" color="text.heading">Select an employee to view documents</Text>
            <Text mt={1} fontSize="sm">Uploaded and pending onboarding documents will appear here.</Text>
          </Flex>
        ) : loading ? (
          <Flex minH="220px" align="center" justify="center"><Spinner color="brand.500" /></Flex>
        ) : (
          <>
            <Box bg={pendingDocuments.length ? "orange.50" : "green.50"} border="1px solid" borderColor={pendingDocuments.length ? "orange.200" : "green.200"} borderRadius="xl" p={{ base: 4, md: 5 }} mb={5}>
              <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} direction={{ base: "column", md: "row" }}>
                <Box>
                  <HStack spacing={2} color={pendingDocuments.length ? "orange.700" : "green.700"}>
                    {pendingDocuments.length ? <ClipboardList size={18} /> : <CheckCircle2 size={18} />}
                    <Text fontWeight="800">{pendingDocuments.length ? `${pendingDocuments.length} required document${pendingDocuments.length === 1 ? "" : "s"} pending` : "All required documents uploaded"}</Text>
                  </HStack>
                  <Text fontSize="sm" color="text.muted" mt={1}>{completedDocuments} of {requiredDocuments.length} required documents completed</Text>
                </Box>
                <Badge colorScheme={pendingDocuments.length ? "orange" : "green"} px={3} py={1.5} borderRadius="full">{completedDocuments}/{requiredDocuments.length} complete</Badge>
              </Flex>
              {pendingDocuments.length > 0 && (
                <Flex mt={4} gap={3} flexWrap="wrap" align="center" justify="space-between">
                  <Flex gap={2} flexWrap="wrap">
                    {pendingDocuments.map((document) => (
                      <Badge key={document.type} bg="white" color="orange.800" border="1px solid" borderColor="orange.200" borderRadius="full" px={3} py={1.5} textTransform="none" fontSize="xs">
                        {document.title}
                      </Badge>
                    ))}
                  </Flex>
                  <SecondaryButton
                    size="sm"
                    leftIcon={<BellRing size={15} />}
                    onClick={() => sendDocumentReminder(selectedUserId)}
                    isLoading={sendingLink}
                  >
                    Send document reminder
                  </SecondaryButton>
                </Flex>
              )}
            </Box>

            <Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap={3} mb={3}>
              <Text fontWeight="800" color="text.heading">Uploaded documents</Text>
              <HStack spacing={3} justify="space-between">
                <InputGroup size="sm" maxW={{ base: "100%", md: "280px" }}>
                  <InputLeftElement pointerEvents="none"><Search size={15} color="#A0AEC0" /></InputLeftElement>
                  <Input
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    borderRadius="lg"
                    bg="surface.bg"
                    borderColor="surface.border"
                  />
                </InputGroup>
                <Text fontSize="sm" color="text.muted" whiteSpace="nowrap">{filteredRecords.length} of {records.length}</Text>
              </HStack>
            </Flex>
            <DataTable
              columns={columns}
              data={filteredRecords}
              keyField="id"
              emptyMessage={searchQuery ? "No documents match your search." : "No documents uploaded for this employee. Click 'Upload New' to add one."}
            />
          </>
        )}
      </SectionCard>

      <ViewModal isOpen={viewModal.isOpen} onClose={viewModal.onClose} record={viewRecord} />

      <Modal isOpen={sendDisclosure.isOpen} onClose={sendDisclosure.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader>Send onboarding upload link</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm" color="text.muted" mb={4}>Select an employee. They will receive an email with the personal-details link, complete document checklist, and upload instructions.</Text>
            <EmployeeSelector value={sendUserId} onChange={setSendUserId} />
          </ModalBody>
          <Flex justify="flex-end" gap={3} p={6} pt={4}>
            <SecondaryButton onClick={sendDisclosure.onClose}>Cancel</SecondaryButton>
            <PrimaryButton leftIcon={<Mail size={15} />} onClick={sendOnboardingLink} isLoading={sendingLink}>Send email</PrimaryButton>
          </Flex>
        </ModalContent>
      </Modal>

      <AlertDialog
        isOpen={deleteDisclosure.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={deleteDisclosure.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="xl">
            <AlertDialogHeader fontSize="lg" fontWeight="700">Delete Document</AlertDialogHeader>
            <AlertDialogBody>
              Are you sure you want to delete <Text as="span" fontWeight="600">{deleteTarget?.originalName}</Text>? This action cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={deleteDisclosure.onClose} size="sm">Cancel</Button>
              <Button colorScheme="red" onClick={handleDeleteConfirm} isLoading={deleting} ml={3} size="sm">Delete</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}
