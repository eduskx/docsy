"use server";

import { signIn, signOut } from "@/auth";

export async function githubSignIn() {
  await signIn("github");
}

export async function guestSignIn() {
  await signIn("guest", { redirectTo: "/" });
}

export async function githubSignOut() {
  await signOut();
}
