"use client";

import { useEffect, useState } from "react";
import { Alert, AlertIcon, Badge, Box, Checkbox, Divider, Flex, SimpleGrid, Spinner, Text, useToast } from "@chakra-ui/react";
import { CheckCircle2, ContactRound, GraduationCap, HeartHandshake, Home, Save, ShieldCheck } from "lucide-react";
import { personalDetailsApi } from "@/api";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { PrimaryButton } from "@/components/ui/Buttons";
import { Field, StyledInput, StyledSelect } from "@/components/ui/FormHelpers";
import type { PersonalForm } from "@/types";
import OnboardingDocuments from "@/components/employees/OnboardingDocuments";

const emptyForm: PersonalForm = {
  aadhaarNumber: "", panNumber: "", mobileNumber: "", whatsappNumber: "",
  bloodGroup: "", dateOfBirth: "", gender: "", maritalStatus: "", nationality: "",
  currentAddressLine1: "", currentCity: "", currentState: "", currentPincode: "", currentCountry: "India",
  permanentSameAsCurrent: true, permanentAddressLine1: "", permanentCity: "", permanentState: "", permanentPincode: "", permanentCountry: "India",
  emergencyContactNumber: "", emergencyContactPerson: "", emergencyContactRelationship: "",
  highestQualification: "", institutionName: "", graduationYear: "", totalExperienceYears: "",
  lastCompany: "", lastDesignation: "", reasonForLeaving: "", previousCompanyCTC: "",
};

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Flex gap={3} align="center" mb={5}>
      <Flex w="42px" h="42px" borderRadius="xl" bgGradient="linear(to-br, brand.50, accent.50)" color="brand.600" align="center" justify="center">{icon}</Flex>
      <Box><Text fontWeight="800" color="text.heading">{title}</Text><Text fontSize="sm" color="text.muted">{description}</Text></Box>
    </Flex>
  );
}

export default function EmployeePersonalDetailsPage() {
  const [form, setForm] = useState<PersonalForm>({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const toast = useToast();

  useEffect(() => {
    personalDetailsApi.getMe()
      .then((record) => { if (record) { setForm(record); setCompleted(true); } })
      .catch((error) => toast({ title: "Could not load your details", description: error?.message, status: "error" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const set = <K extends keyof PersonalForm>(key: K, value: PersonalForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const digits = (value: string, length: number) => value.replace(/\D/g, "").slice(0, length);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await personalDetailsApi.saveMe(form);
      setForm(saved);
      setCompleted(true);
      const sync = saved.appointmentSync;
      const description = sync?.ok && !sync.skipped
        ? sync.locked
          ? "Your HR profile was updated. The appointment already sent by HR was left unchanged."
          : `Your HR profile was updated and your appointment-letter draft was ${sync.created ? "created" : "refreshed"} for HR.`
        : sync?.error
          ? `Your HR profile was updated. Appointment draft: ${sync.error}`
          : "Your HR profile has been updated successfully.";
      toast({ title: "Personal details saved", description, status: sync && !sync.ok && !sync.skipped ? "warning" : "success" });
    } catch (error: any) {
      toast({ title: "Could not save personal details", description: error?.message, status: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Flex minH="420px" align="center" justify="center"><Spinner size="xl" color="brand.500" /></Flex>;

  return (
    <Box>
      <PageHeader
        title="My personal details"
        subtitle="Complete your information so HR can maintain an accurate employee record."
        actions={<Badge px={3} py={1.5} bg={completed ? "accent.50" : "brand.50"} color={completed ? "accent.700" : "brand.700"}>{completed ? "Details submitted" : "Action required"}</Badge>}
      />

      {!completed && <Alert status="info" borderRadius="xl" mb={5} bg="brand.50" color="brand.800"><AlertIcon color="brand.500" /><Text fontSize="sm">Please review every section and save your details. You can return later to update them.</Text></Alert>}

      <SectionCard mb={5}>
        <SectionTitle icon={<ShieldCheck size={20} />} title="Identity and contact" description="Government identity and primary contact information" />
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
          <Field label="Aadhaar number"><StyledInput inputMode="numeric" placeholder="12-digit Aadhaar" value={form.aadhaarNumber} onChange={(e) => set("aadhaarNumber", digits(e.target.value, 12))} /></Field>
          <Field label="PAN number"><StyledInput placeholder="ABCDE1234F" maxLength={10} value={form.panNumber} onChange={(e) => set("panNumber", e.target.value.toUpperCase())} /></Field>
          <Field label="Mobile number"><StyledInput inputMode="numeric" value={form.mobileNumber} onChange={(e) => set("mobileNumber", digits(e.target.value, 15))} /></Field>
          <Field label="WhatsApp number"><StyledInput inputMode="numeric" value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", digits(e.target.value, 15))} /></Field>
        </SimpleGrid>
        <Checkbox mt={4} colorScheme="brand" isChecked={!!form.mobileNumber && form.whatsappNumber === form.mobileNumber} onChange={(e) => set("whatsappNumber", e.target.checked ? form.mobileNumber : "")}>WhatsApp number is the same as mobile</Checkbox>
        <Divider my={6} />
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
          <Field label="Date of birth"><StyledInput type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
          <Field label="Gender"><StyledSelect placeholder="Select" value={form.gender} onChange={(e) => set("gender", e.target.value)}><option>Male</option><option>Female</option><option>Other</option></StyledSelect></Field>
          <Field label="Blood group"><StyledSelect placeholder="Select" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((item) => <option key={item}>{item}</option>)}</StyledSelect></Field>
          <Field label="Marital status"><StyledSelect placeholder="Select" value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)}><option>Single</option><option>Married</option></StyledSelect></Field>
          <Field label="Nationality"><StyledInput value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></Field>
        </SimpleGrid>
      </SectionCard>

      <SectionCard mb={5}>
        <SectionTitle icon={<Home size={20} />} title="Address" description="Your current and permanent residential address" />
        <Text fontWeight="700" color="text.heading" mb={3}>Current address</Text>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
          <Field label="Address"><StyledInput value={form.currentAddressLine1} onChange={(e) => set("currentAddressLine1", e.target.value)} /></Field>
          <Field label="City"><StyledInput value={form.currentCity} onChange={(e) => set("currentCity", e.target.value)} /></Field>
          <Field label="State"><StyledInput value={form.currentState} onChange={(e) => set("currentState", e.target.value)} /></Field>
          <Field label="Pincode"><StyledInput inputMode="numeric" value={form.currentPincode} onChange={(e) => set("currentPincode", digits(e.target.value, 10))} /></Field>
          <Field label="Country"><StyledInput value={form.currentCountry} onChange={(e) => set("currentCountry", e.target.value)} /></Field>
        </SimpleGrid>
        <Checkbox mt={5} colorScheme="brand" isChecked={form.permanentSameAsCurrent} onChange={(e) => set("permanentSameAsCurrent", e.target.checked)}>Permanent address is the same as current address</Checkbox>
        {!form.permanentSameAsCurrent && <><Divider my={6} /><Text fontWeight="700" color="text.heading" mb={3}>Permanent address</Text><SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
          <Field label="Address"><StyledInput value={form.permanentAddressLine1} onChange={(e) => set("permanentAddressLine1", e.target.value)} /></Field>
          <Field label="City"><StyledInput value={form.permanentCity} onChange={(e) => set("permanentCity", e.target.value)} /></Field>
          <Field label="State"><StyledInput value={form.permanentState} onChange={(e) => set("permanentState", e.target.value)} /></Field>
          <Field label="Pincode"><StyledInput value={form.permanentPincode} onChange={(e) => set("permanentPincode", digits(e.target.value, 10))} /></Field>
          <Field label="Country"><StyledInput value={form.permanentCountry} onChange={(e) => set("permanentCountry", e.target.value)} /></Field>
        </SimpleGrid></>}
      </SectionCard>

      <SectionCard mb={5}>
        <SectionTitle icon={<HeartHandshake size={20} />} title="Emergency contact" description="A person HR can contact in an emergency" />
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <Field label="Contact person"><StyledInput value={form.emergencyContactPerson} onChange={(e) => set("emergencyContactPerson", e.target.value)} /></Field>
          <Field label="Contact number"><StyledInput inputMode="numeric" value={form.emergencyContactNumber} onChange={(e) => set("emergencyContactNumber", digits(e.target.value, 15))} /></Field>
          <Field label="Relationship"><StyledSelect placeholder="Select" value={form.emergencyContactRelationship} onChange={(e) => set("emergencyContactRelationship", e.target.value)}>{["Father","Mother","Spouse","Brother","Sister","Friend","Other"].map((item) => <option key={item}>{item}</option>)}</StyledSelect></Field>
        </SimpleGrid>
      </SectionCard>

      <SectionCard mb={5}>
        <SectionTitle icon={<GraduationCap size={20} />} title="Education and experience" description="Your highest qualification and previous employment" />
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
          <Field label="Highest qualification"><StyledSelect placeholder="Select" value={form.highestQualification} onChange={(e) => set("highestQualification", e.target.value)}>{["M.E","M.Tech","M.Sc","M.Com","MBA","MCA","B.E","B.Tech","B.Sc","B.Com","BBA","BCA","Diploma","ITI","12th","10th","Other"].map((item) => <option key={item}>{item}</option>)}</StyledSelect></Field>
          <Field label="Institution"><StyledInput value={form.institutionName} onChange={(e) => set("institutionName", e.target.value)} /></Field>
          <Field label="Graduation year"><StyledInput inputMode="numeric" value={form.graduationYear} onChange={(e) => set("graduationYear", digits(e.target.value, 4))} /></Field>
          <Field label="Total experience (years)"><StyledInput value={form.totalExperienceYears} onChange={(e) => set("totalExperienceYears", e.target.value)} /></Field>
          <Field label="Previous company"><StyledInput value={form.lastCompany} onChange={(e) => set("lastCompany", e.target.value)} /></Field>
          <Field label="Previous designation"><StyledInput value={form.lastDesignation} onChange={(e) => set("lastDesignation", e.target.value)} /></Field>
          <Field label="Previous CTC"><StyledInput value={form.previousCompanyCTC} onChange={(e) => set("previousCompanyCTC", e.target.value)} /></Field>
          <Field label="Reason for leaving"><StyledSelect placeholder="Select" value={form.reasonForLeaving} onChange={(e) => set("reasonForLeaving", e.target.value)}>{["Career Growth","Better Opportunity","Higher Education","Relocation","Personal","Health Issues","Contract Ended","Other"].map((item) => <option key={item}>{item}</option>)}</StyledSelect></Field>
        </SimpleGrid>
      </SectionCard>

      <OnboardingDocuments />

      <SectionCard>
        <Flex align={{ base: "stretch", md: "center" }} justify="space-between" direction={{ base: "column", md: "row" }} gap={4}>
          <Flex gap={2} align="center" color="text.muted"><ContactRound size={17} /><Text fontSize="sm">Your information is visible only to authorized HR administrators.</Text></Flex>
          <PrimaryButton leftIcon={completed ? <CheckCircle2 size={17} /> : <Save size={17} />} isLoading={saving} onClick={save}>{completed ? "Update my details" : "Submit my details"}</PrimaryButton>
        </Flex>
      </SectionCard>
    </Box>
  );
}
