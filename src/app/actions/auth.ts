"use server";

import { signIn, signOut } from "@/auth";

function safeRedirect(url: FormDataEntryValue | null): string {
  const s = typeof url === "string" ? url : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeRedirect(formData.get("callbackUrl")) });
}

export async function signInDev(formData: FormData) {
  await signIn("dev", {
    email: String(formData.get("email") ?? ""),
    redirectTo: safeRedirect(formData.get("callbackUrl")),
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
