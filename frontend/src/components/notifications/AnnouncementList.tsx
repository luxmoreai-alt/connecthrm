"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Box, Flex, Spinner, Text, useToast, VStack } from "@chakra-ui/react";
import { Megaphone } from "lucide-react";
import { notificationApi, type NotificationItem } from "@/api";

export default function AnnouncementList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await notificationApi.listAnnouncements());
    } catch (error: any) {
      toast({ title: "Could not load announcements", description: error?.message, status: "error", duration: 3000, isClosable: true, position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (loading) return <Flex justify="center" py={14}><Spinner color="brand.500" /></Flex>;
  if (!items.length) return (
    <Flex direction="column" align="center" py={14} color="text.muted">
      <Megaphone size={36} />
      <Text mt={3} fontWeight="700">No announcements yet</Text>
      <Text fontSize="sm">Office-wide announcements will appear here.</Text>
    </Flex>
  );

  return (
    <VStack align="stretch" spacing={3}>
      {items.map((item) => (
        <Box key={item.id} p={4} border="1px solid" borderColor="surface.border" borderRadius="xl" bg="white">
          <Flex justify="space-between" align="flex-start" gap={3}>
            <Box>
              <Flex gap={2} align="center" mb={1}>
                <Megaphone size={17} color="#0B72E7" />
                <Text fontWeight="800" color="text.heading">{item.title}</Text>
              </Flex>
              <Text fontSize="sm" color="text.body" whiteSpace="pre-wrap">{item.message}</Text>
            </Box>
            <Badge flexShrink={0} colorScheme="blue">Office</Badge>
          </Flex>
          <Text mt={3} fontSize="xs" color="text.muted">
            {new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </Text>
        </Box>
      ))}
    </VStack>
  );
}
