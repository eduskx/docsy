import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth.js (NextAuth v5) — Login über GitHub.
 *
 * Liest AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET automatisch aus der
 * Umgebung. Wir nutzen JWT-Sessions (kein DB-Adapter nötig): die stabile
 * User-ID kommt aus dem GitHub-Account (`token.sub`) und dient als Schlüssel,
 * um Dokumente und Verlauf pro User zu trennen.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub,
    // Anonymer Gastzugang: erzeugt eine flüchtige Identität "guest:<uuid>".
    // Kein Passwort, keine DB — nur eine eindeutige ID, um Gast-Daten zu trennen.
    Credentials({
      id: "guest",
      name: "Gast",
      credentials: {},
      authorize() {
        return { id: `guest:${globalThis.crypto.randomUUID()}`, name: "Gast" };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * STABILE User-ID pinnen. Ohne das generiert Auth.js (JWT, kein DB-Adapter)
     * bei JEDEM GitHub-Login eine neue zufällige UUID als token.sub — dadurch
     * gingen Verlauf und Bibliothek beim Ab-/Wieder-Anmelden verloren. Die
     * GitHub-Profil-ID ist über alle Logins hinweg konstant.
     */
    jwt({ token, account, profile }) {
      if (account?.provider === "github") {
        const id = (profile as { id?: number | string } | undefined)?.id;
        if (id != null) token.sub = `github:${id}`;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
