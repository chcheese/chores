import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { api, type User } from "./api";
import { ChoresPage } from "./pages/Chores";
import { HistoryPage } from "./pages/History";
import { Login } from "./pages/Login";
import { SettingsPage } from "./pages/Settings";
import { Setup } from "./pages/Setup";
import { TodayPage } from "./pages/Today";
import { Avatar, ToastProvider } from "./ui";

type Tab = "heute" | "aufgaben" | "verlauf" | "einstellungen";
const TABS: { id: Tab; label: string; icon: string; title: string }[] = [
  { id: "heute", label: "Heute", icon: "🏠", title: "Heute" },
  { id: "aufgaben", label: "Aufgaben", icon: "📋", title: "Aufgaben" },
  { id: "verlauf", label: "Verlauf", icon: "🕘", title: "Verlauf" },
  { id: "einstellungen", label: "Einstellungen", icon: "⚙️", title: "Einstellungen" },
];

const MeCtx = createContext<User | null>(null);
/** The logged-in user (always set inside the app shell). */
export const useMe = () => useContext(MeCtx)!;
export const canManage = (u: User) => u.role === "admin" || u.role === "adult";

function useHashTab(): [Tab, (t: Tab) => void] {
  const read = (): Tab => {
    const h = location.hash.replace("#", "") as Tab;
    return TABS.some((t) => t.id === h) ? h : "heute";
  };
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [tab, (t) => (location.hash = t)];
}

export function App() {
  const qc = useQueryClient();
  const setup = useQuery({ queryKey: ["setup"], queryFn: api.setupStatus, refetchInterval: false });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: setup.data?.needsSetup === false,
    retry: false,
    refetchInterval: false,
  });
  const [tab, setTab] = useHashTab();

  const refresh = () => qc.invalidateQueries();

  if (setup.isLoading) return null;
  if (setup.isError)
    return (
      <main className="center-page">
        <h1>Server nicht erreichbar</h1>
        <button className="btn primary" onClick={() => setup.refetch()}>
          Nochmals versuchen
        </button>
      </main>
    );
  if (setup.data?.needsSetup) return <Setup onDone={refresh} />;
  if (me.isLoading) return null;
  const user = me.data?.user;
  if (!user) return <Login onLoggedIn={refresh} />;

  const current = TABS.find((t) => t.id === tab)!;
  // Children only get the "Heute" view for now (kid mode comes later).
  const visibleTabs = user.role === "child" ? TABS.filter((t) => t.id === "heute" || t.id === "einstellungen") : TABS;

  return (
    <MeCtx.Provider value={user}>
      <ToastProvider>
        <div className="shell">
          <header className="topbar">
            <h1>{current.title}</h1>
            <button className="icon-btn" onClick={() => setTab("einstellungen")} aria-label={`Angemeldet als ${user.name}`}>
              <Avatar user={user} />
            </button>
          </header>
          <main className="content">
            {tab === "heute" && <TodayPage />}
            {tab === "aufgaben" && canManage(user) && <ChoresPage />}
            {tab === "verlauf" && user.role !== "child" && <HistoryPage />}
            {tab === "einstellungen" && <SettingsPage />}
          </main>
          <nav className="bottomnav" aria-label="Hauptnavigation" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}>
            {visibleTabs.map((t) => (
              <button key={t.id} aria-current={t.id === tab ? "page" : undefined} onClick={() => setTab(t.id)}>
                <span className="ico" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </ToastProvider>
    </MeCtx.Provider>
  );
}
