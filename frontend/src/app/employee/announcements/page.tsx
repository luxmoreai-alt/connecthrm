"use client";

import { Box } from "@chakra-ui/react";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import AnnouncementList from "@/components/notifications/AnnouncementList";

export default function EmployeeAnnouncementsPage() {
  return (
    <Box>
      <PageHeader title="Announcements" subtitle="Official office updates and notices" />
      <SectionCard title="All Announcements">
        <AnnouncementList />
      </SectionCard>
    </Box>
  );
}
