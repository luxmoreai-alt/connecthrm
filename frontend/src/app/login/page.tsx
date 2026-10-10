"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Flex,
  Text,
  Heading,
  Input,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Button,
  VStack,
} from "@chakra-ui/react";
import { Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/api";
import AuthLoader from "@/components/ui/AuthLoader";
import BrandMark from "@/components/ui/BrandMark";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [portal, setPortal] = useState<"EMPLOYEE" | "HR">("EMPLOYEE");
  const [portalOptions, setPortalOptions] = useState({ employeeLogin: true, hrLogin: false });
  const { login, isAuthenticated, user, authStatus } = useAuth();
  const router = useRouter();

  const destinationFor = (role: "admin" | "hr" | "employee") => {
    const fallback = role === "admin" || role === "hr" ? "/admin/dashboard" : "/employee/dashboard";
    if (typeof window === "undefined") return fallback;
    const requested = new URLSearchParams(window.location.search).get("next");
    const allowedPrefix = role === "admin" || role === "hr" ? "/admin/" : "/employee/";
    return requested?.startsWith(allowedPrefix) ? requested : fallback;
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace(destinationFor(user.role));
    }
  }, [isAuthenticated, user, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  /**
   * Try to get the user's current coordinates.
   * Returns undefined if denied / unavailable — backend will decide
   * whether location is required for this account.
   */
  const getCoordinates = (): Promise<{ latitude: number; longitude: number } | undefined> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(undefined);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () => resolve(undefined),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    });

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    const coords = await getCoordinates();

    const loggedInUser = await login({
      email: data.email,
      password: data.password,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      portal,
    });

    if (loggedInUser) {
      router.replace(destinationFor(loggedInUser.role));
    } else {
      setIsSubmitting(false);
    }
  };

  // Only show loader while actively redirecting after a successful login
  if (authStatus === "redirecting") {
    return <AuthLoader status={authStatus} />;
  }

  return (
    <Flex minH="100vh" bg="surface.bg">
      {/* Left brand panel */}
      <Flex
        display={{ base: "none", lg: "flex" }}
        w="48%"
        maxW="760px"
        bgGradient="linear(145deg, #061F3A 0%, #084F91 48%, #0B8C6A 100%)"
        direction="column"
        justify="center"
        align="center"
        px={{ lg: 12, xl: 20 }}
        position="relative"
        overflow="hidden"
      >
        {/* Decorative circles */}
        <Box
          position="absolute"
          w="420px"
          h="420px"
          borderRadius="full"
          bg="whiteAlpha.100"
          top="-170px"
          right="-140px"
          border="1px solid"
          borderColor="whiteAlpha.200"
        />
        <Box
          position="absolute"
          w="360px"
          h="360px"
          borderRadius="full"
          bg="whiteAlpha.50"
          bottom="-190px"
          left="-120px"
          border="1px solid"
          borderColor="whiteAlpha.200"
        />
        <Box
          position="absolute"
          w="180px"
          h="180px"
          borderRadius="full"
          bg="whiteAlpha.50"
          top="25%"
          left="-110px"
          border="1px solid"
          borderColor="whiteAlpha.100"
        />

        <Box mb={10} position="relative" zIndex={1}>
          <BrandMark
            logoSize="72px"
            showName
            nameColor="white"
            nameFontSize="3xl"
            nameAccentColor="accent.300"
            logoBg="whiteAlpha.950"
            logoBorderColor="whiteAlpha.300"
            logoRadius="2xl"
            logoShadow="0 14px 32px rgba(15, 23, 42, 0.28)"
            priority
          />
        </Box>

        <Heading
          size="xl"
          color="white"
          textAlign="center"
          mb={4}
          fontWeight="800"
          lineHeight="1.3"
        >
          Your people, connected.
          <br />Your work, simplified.
        </Heading>
        <Text
          color="whiteAlpha.800"
          textAlign="center"
          fontSize="md"
          maxW="380px"
          lineHeight="1.7"
        >
          One calm workspace for attendance, leave, payroll, employee records,
          and the everyday moments that keep your organization moving.
        </Text>
        <VStack align="stretch" spacing={3} mt={9} w="100%" maxW="390px" position="relative" zIndex={1}>
          {["One place for every employee", "Clear insights for faster decisions", "Secure workflows built for HR teams"].map((item) => (
            <Flex key={item} align="center" gap={3} color="whiteAlpha.900">
              <Flex w="24px" h="24px" borderRadius="full" bg="whiteAlpha.200" align="center" justify="center">
                <Check size={14} />
              </Flex>
              <Text fontSize="sm" fontWeight="600">{item}</Text>
            </Flex>
          ))}
        </VStack>
      </Flex>

      {/* Right login form */}
      <Flex
        flex={1}
        align="center"
        justify="center"
        bg="surface.bg"
        px={{ base: 6, md: 12 }}
      >
        <Box
          w="100%"
          maxW="460px"
          bg="white"
          border="1px solid"
          borderColor="surface.border"
          borderRadius="2xl"
          boxShadow="elevated"
          p={{ base: 6, md: 10 }}
        >
          <Box display={{ base: "block", lg: "none" }} mb={8}>
            <BrandMark logoSize="44px" priority />
          </Box>
          <Flex w="40px" h="40px" borderRadius="xl" bg="accent.50" color="accent.600" align="center" justify="center" mb={5}>
            <Sparkles size={19} />
          </Flex>
          <Heading size="lg" color="text.heading" mb={2}>
            Welcome back
          </Heading>
          <Text color="text.muted" mb={8} fontSize="sm">
            Sign in to continue to your Connect HR workspace
          </Text>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)}>
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.email}>
                <FormLabel fontSize="sm" color="text.heading" fontWeight="600">
                  Email Address
                </FormLabel>
                <Input
                  {...register("email")}
                  onBlur={async (event) => {
                    register("email").onBlur(event);
                    const email = event.currentTarget.value.trim();
                    if (!/^\S+@\S+\.\S+$/.test(email)) return;
                    try {
                      const options = await authApi.portalOptions(email);
                      setPortalOptions(options);
                      if (options.hrLogin && !options.employeeLogin) setPortal("HR");
                      if (!options.hrLogin) setPortal("EMPLOYEE");
                    } catch { /* keep the standard employee login available */ }
                  }}
                  type="email"
                  placeholder="name@company.com"
                  size="lg"
                  borderRadius="xl"
                  bg="white"
                  border="1px solid"
                  borderColor="surface.border"
                  _focus={{ borderColor: "brand.400", boxShadow: "0 0 0 3px rgba(11,114,231,0.15)" }}
                  fontSize="sm"
                  fontWeight="500"
                />
                <FormErrorMessage fontSize="xs">{errors.email?.message}</FormErrorMessage>
              </FormControl>

              {portalOptions.hrLogin && (
                <FormControl>
                  <FormLabel fontSize="sm" color="text.heading" fontWeight="600">Choose Portal</FormLabel>
                  <Flex gap={2}>
                    {portalOptions.employeeLogin && (
                      <Button flex={1} variant={portal === "EMPLOYEE" ? "solid" : "outline"} colorScheme="blue" onClick={() => setPortal("EMPLOYEE")}>
                        Employee Login
                      </Button>
                    )}
                    <Button flex={1} variant={portal === "HR" ? "solid" : "outline"} colorScheme="teal" onClick={() => setPortal("HR")}>
                      HR Login
                    </Button>
                  </Flex>
                  <Text mt={2} fontSize="xs" color="text.muted">HR Login opens the administration portal using the separate credentials sent by email.</Text>
                </FormControl>
              )}

              <FormControl isInvalid={!!errors.password}>
                <FormLabel fontSize="sm" color="text.heading" fontWeight="600">
                  Password
                </FormLabel>
                <Box position="relative">
                  <Input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    size="lg"
                    borderRadius="xl"
                    bg="white"
                    border="1px solid"
                    borderColor="surface.border"
                    _focus={{ borderColor: "brand.400", boxShadow: "0 0 0 3px rgba(11,114,231,0.15)" }}
                    fontSize="sm"
                    fontWeight="500"
                    pr={12}
                  />
                  <Button
                    position="absolute"
                    right={1}
                    top="50%"
                    transform="translateY(-50%)"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                    color="text.muted"
                    zIndex={2}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </Box>
                <FormErrorMessage fontSize="xs">{errors.password?.message}</FormErrorMessage>
              </FormControl>

              {/* <Flex justify="space-between" align="center">
                <Checkbox size="sm" colorScheme="brand">
                  <Text fontSize="sm" color="text.muted">
                    Remember me
                  </Text>
                </Checkbox>
                <Text
                  fontSize="sm"
                  color="brand.400"
                  fontWeight="600"
                  cursor="pointer"
                  _hover={{ color: "brand.500" }}
                >
                  Forgot password?
                </Text>
              </Flex> */}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                w="100%"
                borderRadius="xl"
                fontSize="sm"
                fontWeight="700"
                isLoading={isSubmitting}
                loadingText="Signing in..."
                mt={2}
              >
                {portal === "HR" ? "Sign In to HR Portal" : "Sign In"}
              </Button>
            </VStack>
          </form>

          <Flex mt={7} pt={5} borderTop="1px solid" borderColor="surface.border" justify="center" gap={4}>
            <Link href="/privacy-policy" style={{ color: "#0B72E7", fontSize: "13px", fontWeight: 700 }}>
              Privacy Policy
            </Link>
            <Link href="/privacy-policy#data-deletion" style={{ color: "#526D82", fontSize: "13px", fontWeight: 600 }}>
              Data requests
            </Link>
          </Flex>

      
        </Box>
      </Flex>
    </Flex>
  );
}
