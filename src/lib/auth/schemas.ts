import { z } from "zod";

/** Shared input rules for the auth endpoints and forms. */
const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const password = z.string().min(8, "Use at least 8 characters.").max(200);
const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

export const RegisterBody = z.object({ name: z.string().trim().min(1, "Tell us your name.").max(80), email, password });
export const LoginBody = z.object({ email, password: z.string().min(1, "Enter your password.").max(200) });
export const VerifyBody = z.object({ email, code });
export const EmailBody = z.object({ email });
export const ResetBody = z.object({ token: z.string().min(20).max(200), password });
