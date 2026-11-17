import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Chore, type User } from "../api";
import { canManage, useMe } from "../App";
import { dueText, scheduleText } from "../format";
import { Avatar, Sheet, useToast } from "../ui";
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

export function ChoreCard({ chore, users, onOpen, onDone }: { chore: Chore; users: User[]; onOpen: () => void; onDone: () => void }) {
  const statusPill = chore.status === "ok" ? "" : chore.status;
  const progress = chore.counterTarget ? Math.min(100, (chore.counterValue / chore.counterTarget) * 100) : null;
  const assignee = chore.assignee ?? null;
  return (
    <article className="card" data-status={chore.status}>
      <div className="icon" aria-hidden>
        {chore.icon}
      </div>
      <div className="body" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
        <span className="title">{chore.title}</span>
        <span className="meta">
          <span className={`pill ${statusPill}`}>{dueText(chore)}</span>
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
  { key: "week", title: "Diese Woche", cls: "", match: (c) => c.status === "ok" && c.daysUntilDue <= 7 },
  { key: "later", title: "Später", cls: "", match: (c) => c.status === "ok" && c.daysUntilDue > 7 },
];

export function TodayPage() {
  const me = useMe();
  const chores = useQuery({ queryKey: ["chores"], queryFn: () => api.chores() });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const { complete } = useChoreActions();
  const [open, setOpen] = useState<Chore | null>(null);
  const [who, setWho] = useState<Chore | null>(null);
  const [showLater, setShowLater] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  const activeUsers = (users.data ?? []).filter((u) => u.active);
  const list = (chores.data ?? []).filter((c) => !mineOnly || !c.assignee || c.assignee.id === me.id);

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

  const counts = {
    overdue: list.filter((c) => c.status === "overdue").length,
    due: list.filter((c) => c.status === "due").length,
    week: list.filter((c) => c.status === "ok" && c.daysUntilDue <= 7).length,
  };

  return (
    <>
      <div className="summary" aria-label="Übersicht">
        <div className={`stat ${counts.overdue ? "over" : ""}`}>
          <b>{counts.overdue}</b>
          <span>überfällig</span>
        </div>
        <div className={`stat ${counts.due ? "due" : ""}`}>
          <b>{counts.due}</b>
          <span>fällig</span>
        </div>
        <div className="stat ok">
          <b>{counts.week}</b>
          <span>diese Woche</span>
        </div>
      </div>

      {activeUsers.length > 1 && (
        <div className="chips">
          <button className="chip" aria-pressed={!mineOnly} onClick={() => setMineOnly(false)}>
            Alle
          </button>
          <button className="chip" aria-pressed={mineOnly} onClick={() => setMineOnly(true)}>
            <Avatar user={me} /> Meine
          </button>
        </div>
      )}

      {counts.overdue + counts.due === 0 && (
        <div className="empty" style={{ padding: "8px 16px" }}>
          <span className="big">✨</span>
          <p style={{ margin: 0 }}>Alles erledigt – nichts fällig.</p>
        </div>
      )}

      {GROUPS.map((g) => {
        const items = list.filter(g.match);
        if (!items.length) return null;
        const collapsed = g.key === "later" && !showLater;
        return (
          <section className="section" key={g.key}>
            <div className={`section-head ${g.cls}`}>
              <h2>{g.title}</h2>
              <span className="count">{items.length}</span>
              {g.key === "later" && (
                <button className="btn ghost" style={{ minHeight: 32, marginLeft: "auto" }} onClick={() => setShowLater((v) => !v)}>
                  {collapsed ? "anzeigen" : "ausblenden"}
                </button>
              )}
            </div>
            {!collapsed &&
              items.map((c) => <ChoreCard key={c.id} chore={c} users={activeUsers} onOpen={() => setOpen(c)} onDone={() => onDone(c)} />)}
          </section>
        );
      })}

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
