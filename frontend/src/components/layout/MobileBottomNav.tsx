"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { CalendarCheck, CalendarDays, CalendarOff, Clock3, LayoutDashboard, UserCircle, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const adminItems = [
  { label: "Home", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "People", href: "/admin/employees", icon: Users },
  { label: "Attendance", href: "/admin/attendance", icon: CalendarCheck },
  { label: "Shifts", href: "/admin/shifts", icon: Clock3 },
  { label: "Leave", href: "/admin/leave", icon: CalendarOff },
  { label: "Payroll", href: "/admin/payroll", icon: Wallet },
];

const employeeItems = [
  { label: "Home", href: "/employee/dashboard", icon: LayoutDashboard },
  { label: "Attendance", href: "/employee/attendance", icon: CalendarCheck },
  { label: "Shifts", href: "/employee/shifts", icon: Clock3 },
  { label: "Holidays", href: "/employee/holidays", icon: CalendarDays },
  { label: "Leave", href: "/employee/leave", icon: CalendarOff },
  { label: "Payslips", href: "/employee/payroll", icon: Wallet },
  { label: "Profile", href: "/employee/profile", icon: UserCircle },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = user?.role === "employee" ? employeeItems : adminItems;

  return (
    <Box
      as="nav"
      aria-label="Mobile navigation"
      display={{ base: "block", lg: "none" }}
      position="fixed"
      left={0}
      right={0}
      bottom={0}
      zIndex={25}
      bg="rgba(255,255,255,0.96)"
      borderTop="1px solid"
      borderColor="surface.border"
      backdropFilter="blur(16px)"
      boxShadow="0 -12px 32px rgba(8,43,76,0.10)"
      pb="env(safe-area-inset-bottom)"
    >
      <Flex h="68px" align="stretch" justify="space-around" px={1}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} style={{ flex: 1, minWidth: 0 }}>
              <Flex
                data-tour={item.href.replace(/^\//, "").replace(/\//g, "-")}
                h="100%"
                direction="column"
                align="center"
                justify="center"
                gap={1}
                color={active ? "brand.500" : "text.muted"}
                position="relative"
                _active={{ transform: "scale(0.96)" }}
              >
                {active && <Box position="absolute" top={0} w="30px" h="3px" borderRadius="full" bgGradient="linear(to-r, #0B72E7, #20C997)" />}
                <Flex w="34px" h="28px" align="center" justify="center" borderRadius="full" bg={active ? "brand.50" : "transparent"}>
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                </Flex>
                <Text fontSize="10px" fontWeight={active ? "700" : "600"} noOfLines={1}>
                  {item.label}
                </Text>
              </Flex>
            </Link>
          );
        })}
      </Flex>
    </Box>
  );
}
