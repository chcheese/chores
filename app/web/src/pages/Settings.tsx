import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Role, type User } from "../api";
import { useMe } from "../App";
import { formatDateTime } from "../format";
import { applyTheme, loadTheme, type ThemeChoice } from "../theme";
import { Avatar, Segmented, Sheet, useToast } from "../ui";
import { AVATARS, COLORS } from "./Setup";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", adult: "Erwachsen", child: "Kind" };

function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const isAdmin = me.role === "admin";
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "adult");
  const [avatar, setAvatar] = useState(user?.avatar ?? AVATARS[1]!);
  const [color, setColor] = useState(user?.color ?? COLORS[2]!);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      user
        ? api.updateUser(user.id, { name, avatar, color, ...(isAdmin ? { role } : {}), ...(pin ? { pin } : {}) })
        : api.createUser({ name, role, avatar, color, ...(pin ? { pin } : {}) }),
    onSuccess: () => (qc.invalidateQueries(), toast({ text: "Gespeichert" }), onClose()),
    onError: (e) => setError((e as Error).message),
  });
  const toggleActive = useMutation({
    mutationFn: () => api.updateUser(user!.id, { active: !user!.active }),
    onSuccess: () => (qc.invalidateQueries(), onClose()),
    onError: (e) => setError((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => api.deleteUser(user!.id),
    onSuccess: () => (qc.invalidateQueries(), toast({ text: "Person gelöscht" }), onClose()),
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Sheet title={user ? user.name : "Neue Person"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
        </label>
        {isAdmin && (
          <div className="field">
            <span>Rolle</span>
            <Segmented
              value={role}
              onChange={setRole}
              options={[
                ["admin", "Admin"],
                ["adult", "Erwachsen"],
                ["child", "Kind"],
              ]}
            />
          </div>
        )}
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
          <span>{user?.hasPin ? "Neue PIN" : "PIN"} (4–8 Ziffern)</span>
          <input className="input" inputMode="numeric" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <small>Ohne PIN kann sich die Person nicht anmelden, aber Aufgaben können ihr zugeschrieben werden.</small>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row end">
          {user && isAdmin && user.id !== me.id && (
            <>
              <button type="button" className="btn" onClick={() => toggleActive.mutate()}>
                {user.active ? "Deaktivieren" : "Aktivieren"}
              </button>
              <button type="button" className="btn danger" onClick={() => confirm(`${user.name} löschen? Der Verlauf bleibt erhalten.`) && del.mutate()}>
                Löschen
              </button>
            </>
          )}
          <button className="btn primary" disabled={save.isPending || !name}>
            Speichern
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function Tokens() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: api.tokens });
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createToken(name),
    onSuccess: (t) => (setCreated(t.token ?? null), setName(""), qc.invalidateQueries({ queryKey: ["tokens"] })),
  });
  const del = useMutation({ mutationFn: api.deleteToken, onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }) });
  return (
    <section className="section">
      <div className="section-head">
        <h2>API-Tokens</h2>
      </div>
      <div className="panel">
        <p className="muted" style={{ margin: 0 }}>
          Für Home Assistant, MagicMirror & Co. Header: <code>Authorization: Bearer …</code> · <a href="/api/docs">API-Doku</a>
        </p>
        {created && (
          <div className="field">
            <span>Neues Token – jetzt kopieren, es wird nicht mehr angezeigt:</span>
            <div className="token-box">{created}</div>
            <div className="row">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(created)}>
                Kopieren
              </button>
              <button className="btn ghost" onClick={() => setCreated(null)}>
                Fertig
              </button>
            </div>
          </div>
        )}
        <div className="list">
          {tokens.data?.map((t) => (
            <div className="list-item" key={t.id}>
              <span className="grow">
                {t.name}
                <br />
                <small className="muted">{t.lastUsedAt ? `zuletzt ${formatDateTime(t.lastUsedAt)}` : "noch nie benutzt"}</small>
              </span>
              <button className="btn danger" style={{ minHeight: 36 }} onClick={() => confirm(`Token «${t.name}» widerrufen?`) && del.mutate(t.id)}>
                Widerrufen
              </button>
            </div>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Name, z.B. Home Assistant" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn primary" disabled={!name || create.isPending}>
            Erstellen
          </button>
        </form>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => qc.invalidateQueries() });

  return (
    <>
      <section className="section">
        <div className="panel">
          <div className="row">
            <Avatar user={me} size="lg" />
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: "var(--fs-lg)" }}>{me.name}</h2>
              <span className="muted">
                {ROLE_LABEL[me.role]} · {me.pointsTotal} Punkte
              </span>
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setEditing(me)}>
              Profil & PIN
            </button>
            <button className="btn" onClick={() => logout.mutate()}>
              Abmelden
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Darstellung</h2>
        </div>
        <Segmented
          value={theme}
          onChange={(t) => (setTheme(t), applyTheme(t))}
          options={[
            ["system", "System"],
            ["light", "Hell"],
            ["dark", "Dunkel"],
          ]}
        />
      </section>

      {me.role === "admin" && (
        <section className="section">
          <div className="section-head">
            <h2>Personen</h2>
          </div>
          <div className="panel list" style={{ padding: "4px 14px" }}>
            {users.data?.map((u) => (
              <button
                key={u.id}
                className="list-item"
                style={{ border: 0, borderBottom: "1px solid var(--line)", background: "none", textAlign: "left", cursor: "pointer", opacity: u.active ? 1 : 0.5 }}
                onClick={() => setEditing(u)}
              >
                <Avatar user={u} />
                <span className="grow">
                  {u.name}
                  <br />
                  <small className="muted">
                    {ROLE_LABEL[u.role]}
                    {!u.hasPin && " · ohne PIN"}
                    {!u.active && " · inaktiv"}
                  </small>
                </span>
                <span className="muted">›</span>
              </button>
            ))}
            <div className="list-item">
              <button className="btn" onClick={() => setEditing("new")}>
                + Person hinzufügen
              </button>
            </div>
          </div>
        </section>
      )}

      {me.role === "admin" && <Tokens />}

      {editing && <UserForm user={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
