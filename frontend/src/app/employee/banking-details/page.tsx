"use client";

import { useEffect, useState } from "react";
import { Alert, AlertIcon, Badge, Box, Flex, SimpleGrid, Spinner, Text, useToast } from "@chakra-ui/react";
import { Banknote, CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { salaryStructureApi } from "@/api";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { PrimaryButton } from "@/components/ui/Buttons";
import { Field, StyledInput } from "@/components/ui/FormHelpers";
import type { EmployeeBankingDetails } from "@/types";

type BankingForm = Omit<EmployeeBankingDetails, "submitted">;

const emptyForm: BankingForm = {
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  mobileNumber: "",
  branchName: "",
  panNumber: "",
  uanNumber: "",
};

export default function EmployeeBankingDetailsPage() {
  const [form, setForm] = useState<BankingForm>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    salaryStructureApi.getMyBankingDetails()
      .then((details) => {
        const { submitted: wasSubmitted, ...values } = details;
        setForm(values);
        setSubmitted(wasSubmitted);
      })
      .catch((error) => toast({ title: "Could not load banking details", description: error?.message, status: "error" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const set = (key: keyof BankingForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const digits = (value: string, length: number) => value.replace(/\D/g, "").slice(0, length);

  const save = async () => {
    if (!/^\d{6,30}$/.test(form.accountNumber)) {
      toast({ title: "Enter a valid bank account number", status: "warning" });
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode)) {
      toast({ title: "Enter a valid IFSC code", description: "Example: HDFC0001234", status: "warning" });
      return;
    }
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(form.panNumber)) {
      toast({ title: "Enter a valid PAN number", status: "warning" });
      return;
    }
    if (form.uanNumber && !/^\d{12}$/.test(form.uanNumber)) {
      toast({ title: "UAN number must contain 12 digits", status: "warning" });
      return;
    }

    setSaving(true);
    try {
      const saved = await salaryStructureApi.saveMyBankingDetails(form);
      const { submitted: wasSubmitted, ...values } = saved;
      setForm(values);
      setSubmitted(wasSubmitted);
      toast({ title: "Banking details saved", description: "HR can now use these details for salary processing.", status: "success" });
    } catch (error: any) {
      toast({ title: "Could not save banking details", description: error?.message, status: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Flex minH="420px" align="center" justify="center"><Spinner size="xl" color="brand.500" /></Flex>;

  return (
    <Box>
      <PageHeader
        title="My banking details"
        subtitle="Add the salary credit account information requested by HR."
        actions={<Badge px={3} py={1.5} colorScheme={submitted ? "green" : "orange"}>{submitted ? "Details submitted" : "Action required"}</Badge>}
      />

      <Alert status="info" borderRadius="xl" mb={5} bg="brand.50" color="brand.800">
        <AlertIcon color="brand.500" />
        <Text fontSize="sm">Enter details only for an account held in your name. Verify the account number and IFSC before saving.</Text>
      </Alert>

      <SectionCard mb={5}>
        <Flex gap={3} align="center" mb={5}>
          <Flex w="42px" h="42px" borderRadius="xl" bg="brand.50" color="brand.600" align="center" justify="center"><Banknote size={21} /></Flex>
          <Box><Text fontWeight="800" color="text.heading">Salary account</Text><Text fontSize="sm" color="text.muted">Your salary credit and statutory identification details</Text></Box>
        </Flex>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
          <Field label="Account holder name" required><StyledInput value={form.accountHolderName} onChange={(e) => set("accountHolderName", e.target.value)} placeholder="Name as per bank account" /></Field>
          <Field label="Bank name" required><StyledInput value={form.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="Bank name" /></Field>
          <Field label="Account number" required><StyledInput inputMode="numeric" value={form.accountNumber} onChange={(e) => set("accountNumber", digits(e.target.value, 30))} placeholder="Bank account number" /></Field>
          <Field label="IFSC code" required><StyledInput maxLength={11} value={form.ifscCode} onChange={(e) => set("ifscCode", e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())} placeholder="HDFC0001234" /></Field>
          <Field label="Banking mobile number" required><StyledInput inputMode="numeric" value={form.mobileNumber} onChange={(e) => set("mobileNumber", digits(e.target.value, 15))} placeholder="Registered mobile number" /></Field>
          <Field label="Branch name" required><StyledInput value={form.branchName} onChange={(e) => set("branchName", e.target.value)} placeholder="Branch name" /></Field>
          <Field label="PAN number" required><StyledInput maxLength={10} value={form.panNumber} onChange={(e) => set("panNumber", e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())} placeholder="ABCDE1234F" /></Field>
          <Field label="UAN number (optional)"><StyledInput inputMode="numeric" value={form.uanNumber} onChange={(e) => set("uanNumber", digits(e.target.value, 12))} placeholder="12-digit UAN" /></Field>
        </SimpleGrid>
      </SectionCard>

      <SectionCard>
        <Flex align={{ base: "stretch", md: "center" }} justify="space-between" direction={{ base: "column", md: "row" }} gap={4}>
          <Flex gap={2} align="center" color="text.muted"><ShieldCheck size={17} /><Text fontSize="sm">Never share your password, banking OTP, PIN, CVV, or UPI PIN with anyone.</Text></Flex>
          <PrimaryButton leftIcon={submitted ? <CheckCircle2 size={17} /> : <Save size={17} />} onClick={save} isLoading={saving}>
            {submitted ? "Update banking details" : "Submit banking details"}
          </PrimaryButton>
        </Flex>
      </SectionCard>
    </Box>
  );
}
