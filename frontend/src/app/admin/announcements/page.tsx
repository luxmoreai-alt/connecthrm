"use client";

import { useState } from "react";
import { Box, Flex, Textarea, useToast } from "@chakra-ui/react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import AnnouncementList from "@/components/notifications/AnnouncementList";
import { Field, StyledInput } from "@/components/ui/FormHelpers";
import { PrimaryButton } from "@/components/ui/Buttons";
import { notificationApi } from "@/api";

export default function AdminAnnouncementsPage() {
  const [form, setForm] = useState({ title: "", message: "" });
  const [sending, setSending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const toast = useToast();

  const publish = async () => {
    if (form.title.trim().length < 3 || form.message.trim().length < 3) {
      toast({ title: "Title and message are required", status: "warning", duration: 2500, isClosable: true, position: "top-right" });
      return;
    }
    try {
      setSending(true);
      const result = await notificationApi.publishAnnouncement(form);
      setForm({ title: "", message: "" });
      setRefreshKey((value) => value + 1);
      toast({ title: "Announcement published", description: `Sent to ${result.deliveredTo} active users.`, status: "success", duration: 3000, isClosable: true, position: "top-right" });
    } catch (error: any) {
      toast({ title: "Could not publish announcement", description: error?.message, status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Box>
      <PageHeader title="Announcements" subtitle="Publish an office notification to every active user" />
      <Flex direction="column" gap={5}>
        <SectionCard title="New General Announcement">
          <Flex direction="column" gap={4}>
            <Field label="Title" required>
              <StyledInput value={form.title} onChange={(e) => setForm((value) => ({ ...value, title: e.target.value }))} maxLength={200} placeholder="Example: Office maintenance notice" />
            </Field>
            <Field label="Message" required>
              <Textarea value={form.message} onChange={(e) => setForm((value) => ({ ...value, message: e.target.value }))} maxLength={3000} minH="130px" borderRadius="xl" placeholder="Write the announcement shown to all users..." />
            </Field>
            <PrimaryButton alignSelf="flex-start" onClick={publish} isLoading={sending}>Publish to Everyone</PrimaryButton>
          </Flex>
        </SectionCard>
        <SectionCard title="Announcement History">
          <AnnouncementList refreshKey={refreshKey} />
        </SectionCard>
      </Flex>
    </Box>
  );
}
