import { z } from "zod";

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Informe seu nome.").max(200),
    organization_name: z.string().trim().min(2, "Informe o nome do negócio.").max(200),
    email: z.string().trim().email("E-mail inválido."),
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(128),
    profession_code: z.string().min(1, "Selecione sua área de atuação."),
    profession_specialty: z.string().optional(),
    profession_other: z.string().optional(),
    use_cases: z.array(z.string()).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.profession_code === "other" && !(values.profession_other || "").trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["profession_other"],
        message: "Descreva sua atuação.",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("E-mail inválido."),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(128),
  confirm_password: z.string().min(1, "Confirme a nova senha."),
}).refine((values) => values.password === values.confirm_password, {
  message: "As senhas não coincidem.",
  path: ["confirm_password"],
});

export type RegisterValues = z.infer<typeof registerSchema>;
export type LoginValues = z.infer<typeof loginSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
