import { useState } from "react";
import { api } from "../api";

export const AVATARS = ["🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸", "🐙", "🦄", "🐝", "🦉", "🐬", "🌻", "⭐", "🚀", "⚽"];
export const COLORS = ["#0f5a66", "#2c8a57", "#b97c06", "#c8462f", "#7a4fc2", "#c2408f", "#3b6fd1", "#5d6b2f"];

export function Setup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🦊");
  const [color, setColor] = useState(COLORS[0]!);
  const [pin, setPin] = useState("");
  const [importTemplates, setImport] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="center-page">
      <img className="logo" src="/favicon.svg" alt="" />
      <h1>Willkommen! Richten wir den Haushalt ein.</h1>
      <form
        className="panel form"
        style={{ width: "100%", maxWidth: 460 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.setup({ name, pin, avatar, color, importTemplates });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted" style={{ margin: 0 }}>
          Du wirst Admin und kannst danach weitere Personen hinzufügen.
        </p>
        <label className="field">
          <span>Dein Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoFocus />
        </label>
        <div className="field">
          <span>Avatar</span>
          <div className="chips">
            {AVATARS.map((a) => (
              <button type="button" key={a} className="chip" aria-pressed={a === avatar} onClick={() => setAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Farbe</span>
          <div className="chips">
            {COLORS.map((c) => (
              <button type="button" key={c} className="chip" aria-pressed={c === color} aria-label={c} onClick={() => setColor(c)}>
                <span className="avatar" style={{ "--c": c } as React.CSSProperties} />
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>PIN (4–8 Ziffern)</span>
          <input className="input" inputMode="numeric" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required />
        </label>
        <label className="row check">
          <input type="checkbox" checked={importTemplates} onChange={(e) => setImport(e.target.checked)} />
          Vorlagen übernehmen (15 typische Haushaltsaufgaben)
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy || !name || pin.length < 4}>
          Los geht's
        </button>
      </form>
    </main>
  );
}
