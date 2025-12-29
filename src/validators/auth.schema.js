import { z } from 'zod';

const fullName = z.string().min(2).max(80);
const username = z.string().min(4).max(32);
const email = z.string().email();
const password = z.string().min(8).max(128);

export const registerSchema = z.object({
  fullName,
  email,
  username,
  password,
});

export const loginSchema = z
  .object({
    email: email.optional(),
    username: username.optional(),
    password,
  })
  .refine((data) => !!data.email || !!data.username, {
    message: 'Email or username required',
    path: ['email'],
  });

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: password,
});
