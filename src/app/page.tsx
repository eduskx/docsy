import { auth } from "@/auth";
import { githubSignIn, guestSignIn } from "@/app/actions";
import { isGuest } from "@/lib/limits";
import { Chat } from "@/components/Chat";

export default async function Home() {
  const session = await auth();

  // Nicht angemeldet -> Login-Landing.
  if (!session?.user?.id) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
        <div>
          <h1 className="text-3xl font-semibold">docsy</h1>
          <p className="mt-2 max-w-md text-neutral-500">
            Wissensassistent für Entwickler-Dokumentation. Melde dich an, speise
            deine eigene Doku ein und befrage sie in natürlicher Sprache — mit
            Quellenangabe.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <form action={githubSignIn}>
            <button
              type="submit"
              className="rounded-xl bg-neutral-900 px-5 py-2.5 font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Mit GitHub anmelden
            </button>
          </form>
          <form action={guestSignIn}>
            <button
              type="submit"
              className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Als Gast fortfahren (ausprobieren)
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
