import type { DefaultSession } from "next-auth";

// Ergänzt die Session um eine stabile User-ID (aus dem GitHub-Account).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
