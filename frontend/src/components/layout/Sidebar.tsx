"use client";

import {
  Box,
  Flex,
  Text,
  VStack,
  IconButton,
  Collapse,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerBody,
  useDisclosure,
  useBreakpointValue,
} from "@chakra-ui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronLeft, ChevronRight, ChevronDown, Menu as MenuIcon, ShieldCheck, X } from "lucide-react";
import { useState, useEffect } from "react";
import { adminRoutes, employeeRoutes, type RouteItem } from "@/lib/routes";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import BrandMark from "@/components/ui/BrandMark";

function NavItem({
  route,
  pathname,
  collapsed,
  onNavigate,
}: {
  route: RouteItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isActive = pathname === route.href || pathname.startsWith(route.href + "/");
  const Icon = route.icon;
  return (
    <Link href={route.href} onClick={onNavigate}>
      <Flex
        data-tour={route.href.replace(/^\//, "").replace(/\//g, "-")}
        align="center"
        gap={3}
        px={3}
        py={2.5}
        borderRadius="xl"
        bg={isActive ? "brand.50" : "transparent"}
        color={isActive ? "brand.400" : "text.muted"}
        fontWeight={isActive ? "700" : "500"}
        fontSize="sm"
        transition="all 0.25s cubic-bezier(.4,0,.2,1)"
        _hover={{
          bg: isActive ? "brand.50" : "brand.50",
          color: "brand.400",
          transform: "translateX(2px)",
        }}
        justify={collapsed ? "center" : "flex-start"}
        title={collapsed ? route.label : undefined}
        position="relative"
      >
        {isActive && (
          <Box
            position="absolute"
            left="-8px"
            top="50%"
            transform="translateY(-50%)"
            w="3px"
            h="20px"
            borderRadius="full"
            bgGradient="linear(to-b, #0B72E7, #20C997)"
          />
        )}
        <Icon size={20} aria-hidden="true" />
        {!collapsed && <Text>{route.label}</Text>}
      </Flex>
    </Link>
  );
}

function NavGroup({
  route,
  pathname,
  collapsed,
  onNavigate,
}: {
  route: RouteItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isChildActive = route.children?.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
  );
  const [open, setOpen] = useState(!!isChildActive);
  const Icon = route.icon;

  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);

  if (collapsed) {
    return (
      <Box>
        <Link href={route.href} onClick={onNavigate}>
          <Flex
            align="center"
            justify="center"
            px={3}
            py={2.5}
            borderRadius="xl"
            bg={isChildActive ? "brand.50" : "transparent"}
            color={isChildActive ? "brand.400" : "text.muted"}
            transition="all 0.25s cubic-bezier(.4,0,.2,1)"
            _hover={{ bg: "brand.50", color: "brand.400" }}
            title={route.label}
          >
            <Icon size={20} />
          </Flex>
        </Link>
      </Box>
    );
  }

  return (
    <Box>
      <Flex
        data-tour={route.href.replace(/^\//, "").replace(/\//g, "-")}
        as="button"
        w="100%"
        align="center"
        gap={3}
        px={3}
        py={2.5}
        borderRadius="xl"
        bg={isChildActive && !open ? "brand.50" : "transparent"}
        color={isChildActive ? "brand.400" : "text.muted"}
        fontWeight={isChildActive ? "700" : "500"}
        fontSize="sm"
        transition="all 0.25s cubic-bezier(.4,0,.2,1)"
        _hover={{ bg: "brand.50", color: "brand.400" }}
        onClick={() => setOpen((p) => !p)}
      >
        <Icon size={20} aria-hidden="true" />
        <Text flex={1} textAlign="left">
          {route.label}
        </Text>
        <Box
          transform={open ? "rotate(180deg)" : "rotate(0deg)"}
          transition="transform 0.3s cubic-bezier(.4,0,.2,1)"
        >
          <ChevronDown size={16} />
        </Box>
      </Flex>

      <Collapse in={open} animateOpacity>
        <VStack spacing={0.5} pl={6} mt={1} align="stretch">
          {route.children?.map((child) => {
            const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
            const ChildIcon = child.icon;
            return (
              <Link key={child.href} href={child.href} onClick={onNavigate}>
                <Flex
                  align="center"
                  gap={2.5}
                  px={3}
                  py={2}
                  borderRadius="xl"
                  bg={childActive ? "brand.50" : "transparent"}
                  color={childActive ? "brand.400" : "text.muted"}
                  fontWeight={childActive ? "700" : "500"}
                  fontSize="13px"
                  transition="all 0.25s cubic-bezier(.4,0,.2,1)"
                  _hover={{ bg: "brand.50", color: "brand.400" }}
                >
                  <ChildIcon size={16} aria-hidden="true" />
                  <Text>{child.label}</Text>
                </Flex>
              </Link>
            );
          })}
        </VStack>
      </Collapse>
    </Box>
  );
}

function SidebarContent({
  collapsed,
  routes,
  pathname,
  logout,
  toggleCollapse,
  onNavigate,
}: {
  collapsed: boolean;
  routes: RouteItem[];
  pathname: string;
  logout: () => void;
  toggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Logo area */}
      <Flex
        h="72px"
        align="center"
        justify={collapsed ? "center" : "flex-start"}
        px={collapsed ? 0 : 5}
        borderBottom="1px solid"
        borderColor="surface.border"
        flexShrink={0}
      >
        <BrandMark
          showName={!collapsed}
          logoSize="40px"
          nameFontSize="lg"
          nameColor="text.heading"
          logoRadius="lg"
          logoShadow="none"
          logoBorderColor="transparent"
        />
      </Flex>

      {/* Collapse toggle (desktop only) */}
      {toggleCollapse && (
        <Flex justify={collapsed ? "center" : "flex-end"} px={collapsed ? 0 : 2} py={2}>
          <IconButton
            aria-label="Toggle sidebar"
            icon={collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            size="xs"
            variant="ghost"
            onClick={toggleCollapse}
            color="text.muted"
            borderRadius="lg"
          />
        </Flex>
      )}

      {/* Section label */}
      {!collapsed && (
        <Box px={5} pt={2} pb={1}>
          <Text fontSize="10px" fontWeight="700" color="text.muted" textTransform="uppercase" letterSpacing="widest">
            Workspace
          </Text>
        </Box>
      )}

      {/* Navigation */}
      <VStack as="nav" spacing={1} px={2} flex={1} align="stretch" overflowY="auto">
        {routes.map((route: RouteItem) =>
          route.children ? (
            <NavGroup key={route.href} route={route} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
          ) : (
            <NavItem key={route.href} route={route} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
          ),
        )}
      </VStack>

      {/* Logout */}
      <Box px={2} pb={4} flexShrink={0}>
        <Link href="/privacy-policy" onClick={onNavigate}>
          <Flex
            align="center"
            gap={3}
            px={3}
            py={2.5}
            borderRadius="xl"
            color="text.muted"
            fontWeight="500"
            fontSize="sm"
            _hover={{ bg: "brand.50", color: "brand.400" }}
            w="100%"
            justify={collapsed ? "center" : "flex-start"}
            title={collapsed ? "Privacy Policy" : undefined}
          >
            <ShieldCheck size={20} aria-hidden="true" />
            {!collapsed && <Text>Privacy Policy</Text>}
          </Flex>
        </Link>
        <Flex
          as="button"
          align="center"
          gap={3}
          px={3}
          py={2.5}
          borderRadius="xl"
          color="text.muted"
          fontWeight="500"
          fontSize="sm"
          transition="all 0.25s cubic-bezier(.4,0,.2,1)"
          _hover={{ bg: "#FEF0F0", color: "#C41E3A" }}
          onClick={logout}
          w="100%"
          justify={collapsed ? "center" : "flex-start"}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut size={20} aria-label="Logout" />
          {!collapsed && <Text>Logout</Text>}
        </Flex>
      </Box>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { collapsed, toggleCollapse } = useSidebar();
  const isMobile = useBreakpointValue({ base: true, lg: false });
  const { isOpen, onOpen, onClose } = useDisclosure();

  const routes = user?.role === "employee"
    ? employeeRoutes
    : adminRoutes.filter((route) => !route.mainAdminOnly || user?.role === "admin");

  // Mobile drawer
  if (isMobile) {
    return (
      <>
        {/* Hamburger button fixed at top-left */}
        <IconButton
          aria-label="Open menu"
          icon={<MenuIcon size={22} />}
          position="fixed"
          top={3}
          left={3}
          zIndex={30}
          variant="ghost"
          color="text.heading"
          size="md"
          onClick={onOpen}
          bg="white"
          shadow="soft"
          borderRadius="xl"
        />
        <Drawer isOpen={isOpen} placement="left" onClose={onClose} size="xs">
          <DrawerOverlay bg="blackAlpha.400" backdropFilter="blur(4px)" />
          <DrawerContent
            bg="white"
            borderRight="1px solid"
            borderColor="surface.border"
            maxW="280px"
          >
            <DrawerBody p={0} display="flex" flexDirection="column">
              <Flex justify="flex-end" p={2}>
                <IconButton
                  aria-label="Close menu"
                  icon={<X size={18} />}
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  color="text.muted"
                />
              </Flex>
              <SidebarContent
                collapsed={false}
                routes={routes}
                pathname={pathname}
                logout={logout}
                onNavigate={onClose}
              />
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Desktop sidebar
  return (
    <Box
      as="aside"
      w={collapsed ? "76px" : "272px"}
      minH="100vh"
      bgGradient="linear(to-b, #FFFFFF 0%, #F8FBFD 72%, #F0FAF7 100%)"
      borderRight="1px solid"
      borderColor="surface.border"
      shadow="sidebar"
      position="fixed"
      top={0}
      left={0}
      zIndex={20}
      transition="width 0.3s cubic-bezier(.4,0,.2,1)"
      display="flex"
      flexDirection="column"
    >
      <SidebarContent
        collapsed={collapsed}
        routes={routes}
        pathname={pathname}
        logout={logout}
        toggleCollapse={toggleCollapse}
      />
    </Box>
  );
}
