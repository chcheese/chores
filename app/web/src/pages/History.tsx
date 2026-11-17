import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Completion, type User } from "../api";
import { formatDateTime } from "../format";
import { Avatar, useToast } from "../ui";

function Entry({ c, users, showChore, canUndo }: { c: Completion; users: User[]; showChore: boolean; canUndo: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const undo = useMutation({
    mutationFn: () => api.undo(c.id),
    onSuccess: () => (qc.invalidateQueries(), toast({ text: "Rückgängig gemacht" })),
    onError: (e) => toast({ text: (e as Error).message }),
  });
  const user = users.find((u) => u.id === c.userId) ?? null;
  return (
    <div className="list-item">
      {showChore ? <span style={{ fontSize: "1.3rem" }}>{c.choreIcon}</span> : <Avatar user={user} />}
      <span className="grow">
        {showChore ? c.choreTitle : (user?.name ?? "Jemand")}
        <br />
        <small className="muted">
          {formatDateTime(c.doneAt)}
          {showChore && user && ` · ${user.name}`}
          {c.kind === "skip" ? " · übersprungen" : c.points ? ` · +${c.points}` : ""}
          {c.note && ` · ${c.note}`}
        </small>
      </span>
      {canUndo && (
        <button className="btn ghost" style={{ minHeight: 36 }} onClick={() => undo.mutate()} disabled={undo.isPending}>
          Rückgängig
        </button>
      )}
    </div>
  );
}

/** Undo is only possible for the newest entry of each chore. */
function latestPerChore(list: Completion[]): Set<number> {
  const seen = new Set<number>();
  const ids = new Set<number>();
  for (const c of list) {
    if (!seen.has(c.choreId)) {
      seen.add(c.choreId);
      ids.add(c.id);
    }
  }
  return ids;
}

export function ChoreHistory({ choreId }: { choreId: number }) {
  const list = useQuery({ queryKey: ["completions", choreId], queryFn: () => api.completions({ choreId, limit: 20 }) });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  if (!list.data?.length) return <p className="muted" style={{ margin: 0 }}>Noch nie erledigt.</p>;
  return (
    <div className="panel list" style={{ padding: "2px 14px" }}>
      {list.data.map((c, i) => (
        <Entry key={c.id} c={c} users={users.data ?? []} showChore={false} canUndo={i === 0} />
      ))}
    </div>
  );
}

export function HistoryPage() {
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [userId, setUserId] = useState<number | undefined>();
  const list = useQuery({ queryKey: ["completions", "all", userId], queryFn: () => api.completions({ userId, limit: 200 }) });
  const undoable = latestPerChore(list.data ?? []);

  const byDay = new Map<string, Completion[]>();
  for (const c of list.data ?? []) {
    const day = new Date(c.doneAt).toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" });
    byDay.set(day, [...(byDay.get(day) ?? []), c]);
  }

  return (
    <>
      <div className="summary" style={{ gridTemplateColumns: `repeat(${Math.min(4, users.data?.length ?? 1)}, 1fr)` }}>
        {users.data
          ?.filter((u) => u.active)
          .map((u) => (
            <button
              key={u.id}
              className="stat"
              style={{ border: userId === u.id ? `2px solid ${u.color}` : "2px solid transparent", cursor: "pointer", textAlign: "left" }}
              onClick={() => setUserId(userId === u.id ? undefined : u.id)}
              aria-pressed={userId === u.id}
            >
              <span className="row" style={{ gap: 6 }}>
                <Avatar user={u} /> {u.name}
              </span>
              <b>{u.pointsTotal}</b>
              <span>Punkte</span>
            </button>
          ))}
      </div>
      {[...byDay].map(([day, items]) => (
        <section className="section" key={day}>
          <div className="section-head">
            <h2>{day}</h2>
          </div>
          <div className="panel list" style={{ padding: "2px 14px" }}>
            {items.map((c) => (
              <Entry key={c.id} c={c} users={users.data ?? []} showChore canUndo={undoable.has(c.id)} />
            ))}
          </div>
        </section>
      ))}
      {list.data?.length === 0 && (
        <div className="empty">
          <span className="big">🕘</span>
          <p>Noch nichts erledigt.</p>
        </div>
      )}
    </>
  );
}
