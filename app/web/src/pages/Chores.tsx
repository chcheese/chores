import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type AssignmentMode, type Chore, type ChoreInput, type IntervalUnit, type ScheduleType, type Template, type TemplateCategory } from "../api";
import { durationText, MONTH_SHORT, scheduleText, seasonText, todayZurich, unitLabel } from "../format";
import { Avatar, Segmented, Sheet, useToast } from "../ui";

const WEEKDAYS: [string, string][] = [
  ["MO", "Mo"],
  ["TU", "Di"],
  ["WE", "Mi"],
  ["TH", "Do"],
  ["FR", "Fr"],
  ["SA", "Sa"],
  ["SU", "So"],
];
const ICONS = ["🧹", "🪣", "🛏️", "🚽", "🛁", "🍽️", "🧺", "🧊", "🔥", "💨", "💧", "🪟", "🔄", "🚨", "❄️", "🌱", "🌿", "🍂", "✂️", "🗑️", "🧽", "🐾", "🚗", "🌡️", "📦"];
const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

type Pattern = "interval" | "weekday" | "monthday";

function parsePattern(rrule: string | null): { pattern: Pattern; days: string[]; monthDay: number } {
  const w = /FREQ=WEEKLY;BYDAY=([A-Z,]+)$/.exec(rrule ?? "");
  if (w?.[1]) return { pattern: "weekday", days: w[1].split(","), monthDay: 1 };
  const m = /FREQ=MONTHLY;BYMONTHDAY=(-?\d+)$/.exec(rrule ?? "");
  if (m?.[1]) return { pattern: "monthday", days: ["SA"], monthDay: Number(m[1]) };
  return { pattern: "interval", days: ["SA"], monthDay: 1 };
}

export function ChoreForm({ chore, onClose }: { chore?: Chore; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const today = todayZurich();
  const initPattern = parsePattern(chore?.rrule ?? null);

  const [f, setF] = useState({
    title: chore?.title ?? "",
    icon: chore?.icon ?? "🧹",
    room: chore?.room ?? "",
    description: chore?.description ?? "",
    points: chore?.points ?? 10,
    scheduleType: (chore?.scheduleType ?? "after_completion") as ScheduleType,
    intervalValue: chore?.intervalValue ?? 7,
    intervalUnit: (chore?.intervalUnit ?? "day") as IntervalUnit,
    anchorDate: chore?.anchorDate ?? today,
    toleranceDays: chore?.toleranceDays ?? 2,
    nextDue: chore?.nextDue ?? today,
    lastDoneDate: "",
    assignmentMode: (chore?.assignmentMode ?? "anyone") as AssignmentMode,
    assignedUserId: chore?.assignedUserId ?? null,
    rotationUserIds: chore?.rotationUserIds ?? [],
    useCounter: chore?.counterTarget != null,
    counterTarget: chore?.counterTarget ?? 30,
    counterLabel: chore?.counterLabel ?? "",
    active: chore?.active ?? true,
    durationMinutes: chore?.durationMinutes ?? null,
    activeMonths: chore?.activeMonths ?? [],
  });
  const [pattern, setPattern] = useState<Pattern>(initPattern.pattern);
  const [days, setDays] = useState<string[]>(initPattern.days);
  const [monthDay, setMonthDay] = useState(initPattern.monthDay);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const rrule =
    f.scheduleType !== "fixed" || pattern === "interval"
      ? null
      : pattern === "weekday"
        ? `FREQ=WEEKLY;BYDAY=${WEEKDAYS.map(([d]) => d).filter((d) => days.includes(d)).join(",")}`
        : `FREQ=MONTHLY;BYMONTHDAY=${monthDay}`;

  const save = useMutation({
    mutationFn: async () => {
      const body: ChoreInput = {
        title: f.title,
        icon: f.icon,
        room: f.room,
        description: f.description,
        points: f.points,
        scheduleType: f.scheduleType,
        intervalValue: f.intervalValue,
        intervalUnit: f.intervalUnit,
        rrule,
        anchorDate: f.scheduleType === "fixed" ? f.anchorDate : null,
        toleranceDays: f.toleranceDays,
        assignmentMode: f.assignmentMode,
        assignedUserId: f.assignmentMode === "user" ? f.assignedUserId : null,
        rotationUserIds: f.assignmentMode === "rotation" ? f.rotationUserIds : [],
        counterTarget: f.useCounter ? f.counterTarget : null,
        counterLabel: f.useCounter ? f.counterLabel : "",
        active: f.active,
        durationMinutes: f.durationMinutes,
        activeMonths: f.activeMonths.length === 12 ? [] : f.activeMonths,
      };
      if (chore) {
        if (f.nextDue !== chore.nextDue) body.nextDue = f.nextDue;
        return api.updateChore(chore.id, body);
      }
      if (f.scheduleType === "after_completion") {
        if (f.lastDoneDate) body.lastDoneDate = f.lastDoneDate;
        else body.nextDue = f.nextDue;
      }
      return api.createChore(body);
    },
    onSuccess: (c) => {
      qc.invalidateQueries();
      toast({ text: `${c.icon} ${c.title} gespeichert` });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => api.deleteChore(chore!.id),
    onSuccess: () => (qc.invalidateQueries(), toast({ text: "Aufgabe gelöscht" }), onClose()),
  });

  const activeUsers = (users.data ?? []).filter((u) => u.active);
  const toggleRotation = (id: number) =>
    set("rotationUserIds", f.rotationUserIds.includes(id) ? f.rotationUserIds.filter((x) => x !== id) : [...f.rotationUserIds, id]);

  return (
    <Sheet title={chore ? "Aufgabe bearbeiten" : "Neue Aufgabe"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <label className="field">
          <span>Titel</span>
          <input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} required maxLength={120} />
        </label>
        <div className="field">
          <span>Symbol</span>
          <div className="chips">
            {(ICONS.includes(f.icon) ? ICONS : [f.icon, ...ICONS]).map((i) => (
              <button type="button" key={i} className="chip" aria-pressed={i === f.icon} onClick={() => set("icon", i)}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Raum / Bereich</span>
            <input className="input" value={f.room} onChange={(e) => set("room", e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span>Punkte</span>
            <input className="input" type="number" min={0} max={1000} value={f.points} onChange={(e) => set("points", Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Dauer (geschätzt)</span>
          <select
            className="input"
            value={f.durationMinutes ?? ""}
            onChange={(e) => set("durationMinutes", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">keine Angabe</option>
            {(f.durationMinutes && !DURATIONS.includes(f.durationMinutes) ? [f.durationMinutes, ...DURATIONS] : DURATIONS).map((d) => (
              <option key={d} value={d}>
                {durationText(d)}
              </option>
            ))}
          </select>
          <small>Für den Filter «⚡ Kurz» und die Zeitschätzung bei «Fällig».</small>
        </label>
        <label className="field">
          <span>Beschreibung</span>
          <textarea className="input" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
        </label>

        <div className="field">
          <span>Rhythmus</span>
          <Segmented
            value={f.scheduleType}
            onChange={(v) => set("scheduleType", v)}
            options={[
              ["after_completion", "Nach Erledigung"],
              ["fixed", "Fester Rhythmus"],
            ]}
          />
          <small>
            {f.scheduleType === "after_completion"
              ? "Wird wieder fällig, wenn seit der letzten Erledigung die Zeit abgelaufen ist."
              : "Bleibt an festen Terminen, egal wann zuletzt erledigt."}
          </small>
        </div>

        {f.scheduleType === "fixed" && (
          <Segmented
            value={pattern}
            onChange={setPattern}
            options={[
              ["interval", "Alle X …"],
              ["weekday", "Wochentag"],
              ["monthday", "Tag im Monat"],
            ]}
          />
        )}

        {(f.scheduleType === "after_completion" || pattern === "interval") && (
          <div className="grid2">
            <label className="field">
              <span>Alle</span>
              <input className="input" type="number" min={1} max={3650} value={f.intervalValue} onChange={(e) => set("intervalValue", Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Einheit</span>
              <select className="input" value={f.intervalUnit} onChange={(e) => set("intervalUnit", e.target.value as IntervalUnit)}>
                {(["day", "week", "month"] as const).map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u, f.intervalValue)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {f.scheduleType === "fixed" && pattern === "weekday" && (
          <div className="chips">
            {WEEKDAYS.map(([d, label]) => (
              <button
                type="button"
                key={d}
                className="chip"
                aria-pressed={days.includes(d)}
                onClick={() => setDays((p) => (p.includes(d) ? (p.length > 1 ? p.filter((x) => x !== d) : p) : [...p, d]))}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {f.scheduleType === "fixed" && pattern === "monthday" && (
          <label className="field">
            <span>Tag im Monat</span>
            <select className="input" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}.
                </option>
              ))}
              <option value={-1}>Letzter Tag</option>
            </select>
          </label>
        )}
        {f.scheduleType === "fixed" && (
          <label className="field">
            <span>Startdatum</span>
            <input className="input" type="date" value={f.anchorDate} onChange={(e) => set("anchorDate", e.target.value)} required />
            <small>Ab diesem Tag zählt der Rhythmus.</small>
          </label>
        )}

        {chore ? (
          <label className="field">
            <span>Nächste Fälligkeit</span>
            <input className="input" type="date" value={f.nextDue} onChange={(e) => set("nextDue", e.target.value)} required />
          </label>
        ) : (
          f.scheduleType === "after_completion" && (
            <div className="grid2">
              <label className="field">
                <span>Zuletzt erledigt</span>
                <input className="input" type="date" max={today} value={f.lastDoneDate} onChange={(e) => set("lastDoneDate", e.target.value)} />
                <small>Optional – berechnet die erste Fälligkeit.</small>
              </label>
              <label className="field">
                <span>… oder erstmals fällig</span>
                <input className="input" type="date" value={f.nextDue} disabled={!!f.lastDoneDate} onChange={(e) => set("nextDue", e.target.value)} />
              </label>
            </div>
          )
        )}

        <div className="field">
          <span>Saison: {seasonText(f.activeMonths.length === 12 ? [] : f.activeMonths)}</span>
          <div className="month-grid">
            {MONTH_SHORT.map((label, i) => (
              <button
                type="button"
                key={label}
                className="chip"
                aria-pressed={f.activeMonths.includes(i + 1)}
                onClick={() =>
                  set("activeMonths", f.activeMonths.includes(i + 1) ? f.activeMonths.filter((m) => m !== i + 1) : [...f.activeMonths, i + 1].sort((a, b) => a - b))
                }
              >
                {label}
              </button>
            ))}
          </div>
          <small>
            Nichts gewählt = ganzjährig. Ausserhalb der Saison ruht die Aufgabe und wird zum Saisonstart wieder fällig.
            {f.activeMonths.length > 0 && (
              <>
                {" "}
                <button type="button" className="link" onClick={() => set("activeMonths", [])}>
                  Ganzjährig
                </button>
              </>
            )}
          </small>
        </div>

        <label className="field">
          <span>Toleranz bis «überfällig»</span>
          <select className="input" value={f.toleranceDays} onChange={(e) => set("toleranceDays", Number(e.target.value))}>
            {[0, 1, 2, 3, 5, 7, 14].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "sofort" : `${d} ${d === 1 ? "Tag" : "Tage"}`}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Wer ist zuständig?</span>
          <Segmented
            value={f.assignmentMode}
            onChange={(v) => set("assignmentMode", v)}
            options={[
              ["anyone", "Alle"],
              ["user", "Eine Person"],
              ["rotation", "Abwechselnd"],
            ]}
          />
          {f.assignmentMode !== "anyone" && (
            <div className="chips">
              {activeUsers.map((u) => {
                const pressed = f.assignmentMode === "user" ? f.assignedUserId === u.id : f.rotationUserIds.includes(u.id);
                const pos = f.rotationUserIds.indexOf(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    className="chip"
                    aria-pressed={pressed}
                    onClick={() => (f.assignmentMode === "user" ? set("assignedUserId", u.id) : toggleRotation(u.id))}
                  >
                    <Avatar user={u} /> {u.name}
                    {f.assignmentMode === "rotation" && pos >= 0 && <small>#{pos + 1}</small>}
                  </button>
                );
              })}
            </div>
          )}
          {f.assignmentMode === "rotation" && <small>Reihenfolge = Reihenfolge der Auswahl.</small>}
        </div>

        <div className="field">
          <label className="row check">
            <input type="checkbox" checked={f.useCounter} onChange={(e) => set("useCounter", e.target.checked)} />
            Zusätzlich nach Zähler fällig (z.B. alle 30 Spülgänge)
          </label>
          {f.useCounter && (
            <div className="grid2">
              <label className="field">
                <span>Fällig nach</span>
                <input className="input" type="number" min={1} value={f.counterTarget} onChange={(e) => set("counterTarget", Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Einheit</span>
                <input className="input" placeholder="Spülgänge" value={f.counterLabel} onChange={(e) => set("counterLabel", e.target.value)} maxLength={40} />
              </label>
            </div>
          )}
          {f.useCounter && <small>Den Zähler erhöht Home Assistant über die API oder du von Hand.</small>}
        </div>

        {chore && (
          <label className="row check">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
            Aktiv
          </label>
        )}

        {error && <p className="error">{error}</p>}
        <div className="row end">
          {chore && (
            <button
              type="button"
              className="btn danger"
              style={{ marginRight: "auto" }}
              onClick={() => confirm(`«${chore.title}» und den ganzen Verlauf löschen?`) && del.mutate()}
            >
              Löschen
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={save.isPending}>
            Speichern
          </button>
        </div>
      </form>
    </Sheet>
  );
}

const CATEGORY_LABEL: Record<TemplateCategory, string> = { haushalt: "Haushalt", "haus-garten": "Haus & Garten" };

function templateMeta(t: Template): string {
  return [scheduleText(t as unknown as Chore), t.activeMonths.length ? seasonText(t.activeMonths) : null, durationText(t.durationMinutes)].filter(Boolean).join(" · ");
}

function TemplateSheet({ existing, onClose }: { existing: Chore[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const templates = useQuery({ queryKey: ["templates"], queryFn: api.templates });
  const have = new Set(existing.map((c) => c.title));
  const [sel, setSel] = useState<string[]>([]);
  const imp = useMutation({
    mutationFn: () => api.importTemplates(sel),
    onSuccess: (r) => (qc.invalidateQueries(), toast({ text: `${r.length} Aufgaben angelegt` }), onClose()),
  });
  const categories = Object.keys(CATEGORY_LABEL) as TemplateCategory[];
  return (
    <Sheet title="Aus Vorlagen" onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>
        Die erste Fälligkeit wird über die nächsten zwei Wochen verteilt, saisonale Aufgaben starten mit ihrer Saison.
      </p>
      {categories.map((cat) => {
        const items = templates.data?.filter((t) => t.category === cat) ?? [];
        const fresh = items.filter((t) => !have.has(t.title)).map((t) => t.key);
        return (
          <div className="field" key={cat}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ fontSize: "var(--fs-md)" }}>{CATEGORY_LABEL[cat]}</h3>
              {fresh.length > 0 && (
                <button type="button" className="btn ghost" style={{ minHeight: 32 }} onClick={() => setSel((p) => [...new Set([...p, ...fresh])])}>
                  Alle neuen wählen
                </button>
              )}
            </div>
            <div className="panel list">
              {items.map((t) => (
                <label className="list-item" key={t.key}>
                  <input
                    type="checkbox"
                    checked={sel.includes(t.key)}
                    onChange={(e) => setSel((p) => (e.target.checked ? [...p, t.key] : p.filter((k) => k !== t.key)))}
                  />
                  <span style={{ fontSize: "1.4rem" }}>{t.icon}</span>
                  <span className="grow">
                    {t.title}
                    <br />
                    <small className="muted">
                      {templateMeta(t)}
                      {have.has(t.title) && " · schon vorhanden"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <div className="row end sheet-actions">
        <button className="btn" onClick={() => setSel([])} disabled={!sel.length}>
          Auswahl leeren
        </button>
        <button className="btn primary" disabled={!sel.length || imp.isPending} onClick={() => imp.mutate()}>
          {sel.length} übernehmen
        </button>
      </div>
    </Sheet>
  );
}

export function ChoresPage() {
  const chores = useQuery({ queryKey: ["chores", "all"], queryFn: () => api.chores(true) });
  const [editing, setEditing] = useState<Chore | "new" | null>(null);
  const [templates, setTemplates] = useState(false);
  const [q, setQ] = useState("");

  const list = (chores.data ?? [])
    .filter((c) => !q || `${c.title} ${c.room}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.room.localeCompare(b.room, "de") || a.title.localeCompare(b.title, "de"));
  const rooms = [...new Set(list.map((c) => c.room || "Ohne Raum"))];

  return (
    <>
      <div className="row">
        <button className="btn primary" onClick={() => setEditing("new")}>
          + Neue Aufgabe
        </button>
        <button className="btn" onClick={() => setTemplates(true)}>
          Aus Vorlagen
        </button>
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Aufgaben suchen" />
      </div>
      {rooms.map((room) => (
        <section className="section" key={room}>
          <div className="section-head">
            <h2>{room}</h2>
          </div>
          <div className="panel list" style={{ padding: "4px 14px" }}>
            {list
              .filter((c) => (c.room || "Ohne Raum") === room)
              .map((c) => (
                <button
                  key={c.id}
                  className="list-item"
                  style={{ border: 0, borderBottom: "1px solid var(--line)", background: "none", textAlign: "left", cursor: "pointer", opacity: c.active ? 1 : 0.5 }}
                  onClick={() => setEditing(c)}
                >
                  <span style={{ fontSize: "1.4rem" }}>{c.icon}</span>
                  <span className="grow">
                    {c.title}
                    <br />
                    <small className="muted">
                      {scheduleText(c)}
                      {c.activeMonths.length > 0 && ` · ${seasonText(c.activeMonths)}`}
                      {c.durationMinutes != null && ` · ${durationText(c.durationMinutes)}`}
                      {!c.active && " · inaktiv"}
                    </small>
                  </span>
                  {c.assignee && <Avatar user={c.assignee} />}
                  <span className="muted">›</span>
                </button>
              ))}
          </div>
        </section>
      ))}
      {chores.data?.length === 0 && (
        <div className="empty">
          <span className="big">📋</span>
          <p>Noch keine Aufgaben – starte mit den Vorlagen.</p>
        </div>
      )}
      {editing && <ChoreForm chore={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {templates && <TemplateSheet existing={chores.data ?? []} onClose={() => setTemplates(false)} />}
    </>
  );
}
