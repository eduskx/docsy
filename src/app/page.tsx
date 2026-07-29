import { auth } from "@/auth";
import { githubSignIn, guestSignIn } from "@/app/actions";
import { isGuest } from "@/lib/limits";
import { Chat } from "@/components/Chat";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

export default async function Home() {
  const session = await auth();

  // Nicht angemeldet -> Login-Landing.
  if (!session?.user?.id) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center text-fg">
        <div className="fixed right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-col items-center">
          <Logo size={64} className="mb-4" />
          <h1 className="text-4xl font-semibold tracking-tight">docsy</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Wissensassistent für Entwickler-Dokumentationen. Melde dich an, lade
            deine eigenen Dokus hoch und stelle Fragen in natürlicher Sprache —
            mit Quellenangabe.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <form action={githubSignIn}>
            <button
              type="submit"
              className="rounded-app bg-accent px-5 py-2.5 font-medium text-accent-fg hover:bg-accent-hover"
            >
              Mit GitHub anmelden
            </button>
          </form>
          <form action={guestSignIn}>
            <button
              type="submit"
              className="text-sm text-muted underline underline-offset-4 hover:text-fg"
            >
              Als Gast fortfahren
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Angemeldet -> Chat mit eigener Bibliothek.
  return (
    <Chat
      user={{
        name: session.user.name ?? "Du",
        image: session.user.image ?? null,
        isGuest: isGuest(session.user.id),
      }}
    />
  );
}
