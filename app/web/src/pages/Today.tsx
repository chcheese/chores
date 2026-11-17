import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Chore, type User } from "../api";
import { canManage, useMe } from "../App";
import { dueText, durationText, formatDate, freshnessColor, scheduleText, seasonStartText, seasonText } from "../format";
import { Avatar, Segmented, Sheet, useToast } from "../ui";
import { ChoreForm } from "./Chores";
import { ChoreHistory } from "./History";

export function useChoreActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries();
  const undo = useMutation({ mutationFn: api.undo, onSuccess: () => (invalidate(), toast({ text: "Rückgängig gemacht" })) });

  const complete = useMutation({
    mutationFn: ({ chore, userId }: { chore: Chore; userId?: number | null }) => api.complete(chore.id, userId),
    onSuccess: (r, { chore }) => {
      invalidate();
      toast({ text: `${chore.icon} ${chore.title} erledigt${chore.points ? ` · +${chore.points}` : ""}`, action: { label: "Rückgängig", run: () => undo.mutate(r.completion_id) } });
    },
    onError: (e) => toast({ text: (e as Error).message }),
  });
  const skip = useMutation({
    mutationFn: (chore: Chore) => api.skip(chore.id),
    onSuccess: (r, chore) => {
      invalidate();
      toast({ text: `${chore.title} übersprungen`, action: { label: "Rückgängig", run: () => undo.mutate(r.completion_id) } });
    },
  });
  const snooze = useMutation({
    mutationFn: ({ chore, days }: { chore: Chore; days: number }) => api.snooze(chore.id, days),
    onSuccess: (c) => (invalidate(), toast({ text: `Verschoben auf ${dueText(c)}` })),
  });
  const counter = useMutation({ mutationFn: ({ chore, by }: { chore: Chore; by: number }) => api.counter(chore.id, by), onSuccess: invalidate });
  return { complete, skip, snooze, counter };
}

/** Condition bar: full and green right after completion, empty and red when due. */
export function ConditionBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className="cond" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label ?? `Zustand ${pct} %`}>
      <i style={{ width: `${Math.max(pct, 3)}%`, background: freshnessColor(value) }} />
    </span>
  );
}

export function ChoreCard({ chore, users, onOpen, onDone }: { chore: Chore; users: User[]; onOpen: () => void; onDone: () => void }) {
  const resting = !chore.inSeason;
  const statusPill = chore.status === "ok" ? "" : chore.status;
  const progress = chore.counterTarget ? Math.min(100, (chore.counterValue / chore.counterTarget) * 100) : null;
  const assignee = chore.assignee ?? null;
  return (
    <article className="card" data-status={chore.status} data-resting={resting || undefined}>
      <div className="icon" aria-hidden>
        {chore.icon}
      </div>
      <div className="body" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
        <span className="title">{chore.title}</span>
        <span className="meta">
          <span className={`pill ${statusPill}`}>{resting ? seasonStartText(chore.nextDue) : dueText(chore)}</span>
          {chore.durationMinutes != null && <span>⏱ {durationText(chore.durationMinutes)}</span>}
          {chore.room && <span>{chore.room}</span>}
          {assignee && (
            <span className="row" style={{ gap: 4 }}>
              <Avatar user={users.find((u) => u.id === assignee.id) ?? assignee} /> {assignee.name}
            </span>
          )}
        </span>
        {progress != null && (
          <span className="meta">
            <span className="counter-bar" title={`${chore.counterValue} / ${chore.counterTarget} ${chore.counterLabel}`}>
              <i style={{ width: `${progress}%` }} />
            </span>
            <span>
              {chore.counterValue}/{chore.counterTarget} {chore.counterLabel}
            </span>
          </span>
        )}
        {!resting && !chore.paused && <ConditionBar value={chore.freshness} />}
      </div>
      <button className="done-btn" onClick={onDone} aria-label={`${chore.title} erledigt`}>
        ✓
      </button>
    </article>
  );
}

/** "Who did it?" – skipped automatically when there is only one active person. */
export function WhoSheet({ chore, users, onPick, onClose }: { chore: Chore; users: User[]; onPick: (userId: number) => void; onClose: () => void }) {
  const me = useMe();
  const defaultId = chore.assignee?.id ?? me.id;
  return (
    <Sheet title={`${chore.icon} ${chore.title} – wer hat's gemacht?`} onClose={onClose}>
      <div className="who-grid">
        {users.map((u) => (
          <button key={u.id} className="who" style={{ "--c": u.color } as React.CSSProperties} aria-pressed={u.id === defaultId} onClick={() => onPick(u.id)}>
            <Avatar user={u} size="lg" />
            {u.name}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ChoreSheet({ chore, onClose }: { chore: Chore; onClose: () => void }) {
  const me = useMe();
  const { skip, snooze, counter } = useChoreActions();
  const [editing, setEditing] = useState(false);
  const manage = canManage(me);
  if (editing) return <ChoreForm chore={chore} onClose={onClose} />;
  return (
    <Sheet title={`${chore.icon} ${chore.title}`} onClose={onClose}>
      <div className="panel">
        {chore.description && <p style={{ margin: 0 }}>{chore.description}</p>}
        <div className="meta row muted" style={{ fontSize: "var(--fs-sm)" }}>
          <span className={`pill ${chore.status === "ok" ? "" : chore.status}`}>{dueText(chore)}</span>
          <span>{scheduleText(chore)}</span>
          {chore.activeMonths.length > 0 && <span>🗓 {seasonText(chore.activeMonths)}</span>}
          {chore.durationMinutes != null && <span>⏱ {durationText(chore.durationMinutes)}</span>}
          {chore.points > 0 && <span>{chore.points} Punkte</span>}
        </div>
      </div>
      {manage && (
        <div className="field">
          <span>Verschieben</span>
          <div className="row">
            {[1, 3, 7].map((d) => (
              <button key={d} className="btn" onClick={() => (snooze.mutate({ chore, days: d }), onClose())}>
                +{d} {d === 1 ? "Tag" : "Tage"}
              </button>
            ))}
          </div>
        </div>
      )}
      {manage && chore.counterTarget != null && (
        <div className="field">
          <span>
            Zähler: {chore.counterValue}/{chore.counterTarget} {chore.counterLabel}
          </span>
          <div className="row">
            <button className="btn" onClick={() => counter.mutate({ chore, by: -1 })}>
              −1
            </button>
            <button className="btn" onClick={() => counter.mutate({ chore, by: 1 })}>
              +1
            </button>
          </div>
        </div>
      )}
      {manage && (
        <div className="row">
          <button className="btn" onClick={() => (skip.mutate(chore), onClose())}>
            Diesmal überspringen
          </button>
          <button className="btn" onClick={() => setEditing(true)}>
            Bearbeiten
          </button>
        </div>
      )}
      <div className="field">
        <span>Verlauf</span>
        <ChoreHistory choreId={chore.id} />
      </div>
    </Sheet>
  );
}

const GROUPS: { key: string; title: string; cls: string; match: (c: Chore) => boolean }[] = [
  { key: "overdue", title: "Überfällig", cls: "overdue", match: (c) => c.status === "overdue" },
  { key: "due", title: "Fällig", cls: "due", match: (c) => c.status === "due" },
  { key: "week", title: "Diese Woche", cls: "", match: (c) => c.inSeason && c.status === "ok" && c.daysUntilDue <= 7 },
  { key: "later", title: "Später", cls: "", match: (c) => c.inSeason && c.status === "ok" && c.daysUntilDue > 7 },
  { key: "resting", title: "Ausser Saison", cls: "", match: (c) => !c.inSeason },
];
const COLLAPSIBLE = new Set(["later", "resting"]);

const QUICK_MINUTES = 15;
type Filter = "all" | "mine" | "quick";
type View = "due" | "rooms";

const totalMinutes = (list: Chore[]) => list.reduce((sum, c) => sum + (c.durationMinutes ?? 0), 0);

function VacationBanner() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const vacation = useQuery({ queryKey: ["vacation"], queryFn: api.vacation });
  const end = useMutation({
    mutationFn: api.endVacation,
    onSuccess: () => (qc.invalidateQueries(), toast({ text: "Willkommen zurück! Die Fälligkeiten sind angepasst." })),
  });
  const v = vacation.data;
  if (!v) return null;
  if (!v.active)
    return (
      <p className="banner subtle">
        🏖️ Ferien geplant: {formatDate(v.from)} – {formatDate(v.until)}
      </p>
    );
  return (
    <div className="banner">
      <span className="grow">
        <b>🏖️ Ferienmodus bis {formatDate(v.until)}</b>
        <br />
        <small>Nichts ist fällig. Danach verschieben sich die Termine um die Ferientage.</small>
      </span>
      {canManage(me) && (
        <button className="btn" onClick={() => confirm("Ferien jetzt beenden?") && end.mutate()} disabled={end.isPending}>
          Beenden
        </button>
      )}
    </div>
  );
}

function RoomView({ list, users, onOpen, onDone }: { list: Chore[]; users: User[]; onOpen: (c: Chore) => void; onDone: (c: Chore) => void }) {
  const active = list.filter((c) => c.inSeason);
  const rooms = [...new Set(active.map((c) => c.room || "Ohne Bereich"))]
    .map((room) => {
      const items = active.filter((c) => (c.room || "Ohne Bereich") === room).sort((a, b) => a.freshness - b.freshness);
      return { room, items, condition: items.reduce((s, c) => s + c.freshness, 0) / items.length };
    })
    .sort((a, b) => a.condition - b.condition || a.room.localeCompare(b.room, "de"));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="rooms">
        {rooms.map((r) => {
          const pct = Math.round(r.condition * 100);
          const due = r.items.filter((c) => c.status !== "ok").length;
          return (
            <button key={r.room} className="room" aria-expanded={open === r.room} onClick={() => setOpen(open === r.room ? null : r.room)}>
              <span className="room-head">
                <b>{r.room}</b>
                <span className="muted">{due ? `${due} fällig` : `${pct} %`}</span>
              </span>
              <ConditionBar value={r.condition} label={`${r.room}: Zustand ${pct} %`} />
            </button>
          );
        })}
      </div>
      {rooms
        .filter((r) => open === null || r.room === open)
        .map((r) => (
          <section className="section" key={r.room}>
            <div className="section-head">
              <h2>{r.room}</h2>
              <span className="count">{r.items.length}</span>
            </div>
            {r.items.map((c) => (
              <ChoreCard key={c.id} chore={c} users={users} onOpen={() => onOpen(c)} onDone={() => onDone(c)} />
            ))}
          </section>
        ))}
    </>
  );
}

const loadView = (): View => {
  try {
    return localStorage.getItem("chores-view") === "rooms" ? "rooms" : "due";
  } catch {
    return "due";
  }
};

export function TodayPage() {
  const me = useMe();
  const chores = useQuery({ queryKey: ["chores"], queryFn: () => api.chores() });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const { complete } = useChoreActions();
  const [open, setOpen] = useState<Chore | null>(null);
  const [who, setWho] = useState<Chore | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem("chores-view", v);
    } catch {
      /* private mode */
    }
  };

  const activeUsers = (users.data ?? []).filter((u) => u.active);
  const list = (chores.data ?? []).filter(
    (c) =>
      (filter !== "mine" || !c.assignee || c.assignee.id === me.id) &&
      (filter !== "quick" || (c.durationMinutes != null && c.durationMinutes <= QUICK_MINUTES)),
  );

  const onDone = (c: Chore) => {
    // Children always complete for themselves; with one person there's nothing to ask.
    if (me.role === "child" || activeUsers.length <= 1) complete.mutate({ chore: c, userId: me.id });
    else setWho(c);
  };

  if (chores.isLoading) return <p className="muted">Laden …</p>;
  if (chores.isError) return <p className="error">Aufgaben konnten nicht geladen werden.</p>;
  if ((chores.data ?? []).length === 0)
    return (
      <div className="empty">
        <span className="big">🧺</span>
        <p>Noch keine Aufgaben.</p>
        {canManage(me) && (
          <a className="btn primary" href="#aufgaben">
            Aufgaben anlegen
          </a>
        )}
      </div>
    );

  const overdue = list.filter((c) => c.status === "overdue");
  const due = list.filter((c) => c.status === "due");
  const week = list.filter(GROUPS[2]!.match);
  const open_ = [...overdue, ...due];

  return (
    <>
      <VacationBanner />

      <div className="summary" aria-label="Übersicht">
        <div className={`stat ${overdue.length ? "over" : ""}`}>
          <b>{overdue.length}</b>
          <span>überfällig</span>
        </div>
        <div className={`stat ${due.length ? "due" : ""}`}>
          <b>{due.length}</b>
          <span>fällig</span>
        </div>
        <div className="stat ok">
          <b>{week.length}</b>
          <span>diese Woche</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="chips">
          <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            Alle
          </button>
          {activeUsers.length > 1 && (
            <button className="chip" aria-pressed={filter === "mine"} onClick={() => setFilter("mine")}>
              <Avatar user={me} /> Meine
            </button>
          )}
          <button className="chip" aria-pressed={filter === "quick"} onClick={() => setFilter("quick")} title={`Höchstens ${QUICK_MINUTES} Minuten`}>
            ⚡ Kurz
          </button>
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            ["due", "Fälligkeit"],
            ["rooms", "Bereiche"],
          ]}
        />
      </div>

      {view === "due" && open_.length === 0 && (
        <div className="empty" style={{ padding: "8px 16px" }}>
          <span className="big">✨</span>
          <p style={{ margin: 0 }}>{filter === "quick" ? "Keine kurzen Aufgaben fällig." : "Alles erledigt – nichts fällig."}</p>
        </div>
      )}

      {view === "rooms" ? (
        <RoomView list={list} users={activeUsers} onOpen={setOpen} onDone={onDone} />
      ) : (
        GROUPS.map((g) => {
          const items = list.filter(g.match);
          if (!items.length) return null;
          const collapsed = COLLAPSIBLE.has(g.key) && !expanded.has(g.key);
          const minutes = g.key === "overdue" || g.key === "due" ? totalMinutes(items) : 0;
          return (
            <section className="section" key={g.key}>
              <div className={`section-head ${g.cls}`}>
                <h2>{g.title}</h2>
                <span className="count">{items.length}</span>
                {minutes > 0 && <span className="muted section-note">ca. {durationText(minutes)}</span>}
                {COLLAPSIBLE.has(g.key) && (
                  <button
                    className="btn ghost"
                    style={{ minHeight: 32, marginLeft: "auto" }}
                    onClick={() =>
                      setExpanded((p) => {
                        const n = new Set(p);
                        if (n.has(g.key)) n.delete(g.key);
                        else n.add(g.key);
                        return n;
                      })
                    }
                  >
                    {collapsed ? "anzeigen" : "ausblenden"}
                  </button>
                )}
              </div>
              {!collapsed &&
                items.map((c) => <ChoreCard key={c.id} chore={c} users={activeUsers} onOpen={() => setOpen(c)} onDone={() => onDone(c)} />)}
            </section>
          );
        })
      )}

      {open && <ChoreSheet chore={open} onClose={() => setOpen(null)} />}
      {who && (
        <WhoSheet
          chore={who}
          users={activeUsers}
          onClose={() => setWho(null)}
          onPick={(userId) => {
            complete.mutate({ chore: who, userId });
            setWho(null);
          }}
        />
      )}
    </>
  );
}
