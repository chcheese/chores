import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type UserSummary } from "../api";
import { Avatar } from "../ui";

/** PINs are 4–8 digits; confirm with ✓ (auto-submits at 8). */
export function PinPad({ onSubmit, error }: { onSubmit: (pin: string) => Promise<void> | void; error?: string | null }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (value: string) => {
    if (busy || value.length < 4) return;
    setBusy(true);
    try {
      await onSubmit(value);
    } finally {
      setBusy(false);
      setPin("");
    }
  };
  const press = (d: string) => {
    if (busy || pin.length >= 8) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 8) void submit(next);
  };
  const length = Math.max(4, pin.length);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className={`pin-dots${error ? " shake" : ""}`} key={error ?? ""} aria-live="polite" aria-label={`${pin.length} von ${length} Ziffern`}>
        {Array.from({ length }, (_, i) => (
          <i key={i} className={i < pin.length ? "on" : ""} />
        ))}
      </div>
      {error && (
        <p className="error" style={{ textAlign: "center", margin: 0 }}>
          {error}
        </p>
      )}
      <div className="pinpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} aria-label={d}>
            {d}
          </button>
        ))}
        <button className="plain" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Löschen">
          ⌫
        </button>
        <button onClick={() => press("0")} aria-label="0">
          0
        </button>
        <button className="ok" onClick={() => submit(pin)} disabled={pin.length < 4 || busy} aria-label="Bestätigen">
          ✓
        </button>
      </div>
    </div>
  );
}

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const users = useQuery({ queryKey: ["login-users"], queryFn: api.loginUsers });
  const [chosen, setChosen] = useState<UserSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!chosen) {
    return (
      <main className="center-page">
        <img className="logo" src="/favicon.svg" alt="" />
        <h1>Wer bist du?</h1>
        <div className="who-grid" style={{ width: "100%", maxWidth: 480 }}>
          {users.data
            ?.filter((u) => u.hasPin)
            .map((u) => (
              <button key={u.id} className="who" style={{ "--c": u.color } as React.CSSProperties} onClick={() => setChosen(u)}>
                <Avatar user={u} size="lg" />
                {u.name}
              </button>
            ))}
        </div>
        {users.isError && <p className="error">Server nicht erreichbar.</p>}
      </main>
    );
  }

  return (
    <main className="center-page">
      <Avatar user={chosen} size="lg" />
      <h1>Hallo {chosen.name}, deine PIN?</h1>
      <PinPad
        error={error}
        onSubmit={async (pin) => {
          try {
            await api.login(chosen.id, pin);
            onLoggedIn();
          } catch (e) {
            setError(e instanceof ApiError && e.status === 429 ? "Zu viele Versuche – kurz warten." : "PIN falsch, nochmals versuchen.");
          }
        }}
      />
      <button className="btn ghost" onClick={() => (setChosen(null), setError(null))}>
        ← Andere Person
      </button>
    </main>
  );
}
