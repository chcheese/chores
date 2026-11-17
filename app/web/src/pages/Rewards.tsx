import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Allowance, api, type Claim, type Progress, type Reward, type User } from "../api";
import { canManage, useMe } from "../App";
import { formatChf, formatDateTime, pointsForRappen } from "../format";
import { Avatar, Sheet, useToast } from "../ui";

const REWARD_ICONS = ["🎁", "📱", "🎮", "🍦", "🍫", "🎬", "🌙", "🎲", "💰", "🧸", "⚽", "🍕", "🏊", "📚", "🎨", "🚲"];

const SUGGESTIONS: { title: string; icon: string; cost: number }[] = [
  { title: "Spiel aussuchen", icon: "🎲", cost: 30 },
  { title: "Glace", icon: "🍦", cost: 40 },
  { title: "30 Min. Bildschirmzeit", icon: "📱", cost: 50 },
  { title: "15 Min. länger aufbleiben", icon: "🌙", cost: 60 },
  { title: "Filmabend: Film aussuchen", icon: "🎬", cost: 80 },
  { title: "2 Franken Taschengeld", icon: "💰", cost: 100 },
];

const STATUS_LABEL: Record<Claim["status"], string> = { pending: "wartet auf Freigabe", approved: "freigegeben", rejected: "abgelehnt" };

/** Amount picker in 5-Rappen steps, capped at what the points are worth. */
function PayoutSheet({
  title,
  maxRappen,
  allowance,
  withNote,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  maxRappen: number;
  allowance: Allowance;
  withNote: boolean;
  submitLabel: string;
  onSubmit: (rappen: number, note: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [chf, setChf] = useState((maxRappen / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rappen = Math.round(Number(chf.replace(",", ".")) * 100);
  const valid = Number.isFinite(rappen) && rappen >= 5 && rappen % 5 === 0 && rappen <= maxRappen;
  const quick = [100, 200, 500, 1000].filter((r) => r < maxRappen);
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(rappen, note);
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted" style={{ margin: 0 }}>
          Verfügbar: <b>{formatChf(maxRappen)}</b> · {allowance.pointsPerFranc} Punkte = CHF 1.00
        </p>
        <div className="chips">
          {quick.map((r) => (
            <button type="button" key={r} className="chip" aria-pressed={rappen === r} onClick={() => setChf((r / 100).toFixed(2))}>
              {formatChf(r)}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={rappen === maxRappen} onClick={() => setChf((maxRappen / 100).toFixed(2))}>
            Alles
          </button>
        </div>
        <label className="field">
          <span>Betrag (CHF)</span>
          <input className="input" inputMode="decimal" value={chf} onChange={(e) => setChf(e.target.value)} />
          <small>{valid ? `kostet ${pointsForRappen(rappen, allowance.pointsPerFranc)} Punkte` : "In 5-Rappen-Schritten, höchstens das Verfügbare."}</small>
        </label>
        {withNote && (
          <label className="field">
            <span>Notiz (optional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="z.B. bar gegeben" />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!valid || busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function MyProgress({ me, p, allowance }: { me: User; p: Progress; allowance: Allowance | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const span = Math.max(1, p.levelNext - p.levelFloor);
  const pct = Math.min(100, Math.round(((p.pointsTotal - p.levelFloor) / span) * 100));
  return (
    <section className="panel progress-card">
      <div className="row" style={{ gap: 14 }}>
        <Avatar user={me} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow">Level {p.level}</span>
          <div className="level-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Fortschritt zu Level ${p.level + 1}`}>
            <i style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
          <small className="muted">
            Noch {p.levelNext - p.pointsTotal} Punkte bis Level {p.level + 1}
          </small>
        </div>
      </div>
      <div className="mini-stats">
        <div>
          <b>{p.balance}</b>
          <span>{p.allowanceRappen != null ? `Punkte = ${formatChf(p.allowanceRappen)}` : "Punkte zum Einlösen"}</span>
        </div>
        <div>
          <b>
            {p.streak}
            {p.streak > 0 && " 🔥"}
          </b>
          <span>{p.streak === 1 ? "Tag" : "Tage"} in Folge</span>
        </div>
        <div>
          <b>{p.doneThisWeek}</b>
          <span>diese Woche erledigt</span>
        </div>
      </div>
      {allowance && p.allowanceRappen != null && me.role === "child" && (
        <button className="btn" disabled={p.allowanceRappen < 5} onClick={() => setAsking(true)}>
          💰 Taschengeld auszahlen lassen
        </button>
      )}
      {asking && allowance && p.allowanceRappen != null && (
        <PayoutSheet
          title="💰 Taschengeld"
          maxRappen={p.allowanceRappen}
          allowance={allowance}
          withNote={false}
          submitLabel="Wünschen"
          onSubmit={(r) => api.requestPayout(r).then(() => (qc.invalidateQueries(), toast({ text: "Wunsch gesendet – jetzt muss noch jemand zustimmen." })))}
          onClose={() => setAsking(false)}
        />
      )}
    </section>
  );
}

function PocketMoney({ progress, users, allowance }: { progress: Progress[]; users: User[]; allowance: Allowance }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [paying, setPaying] = useState<{ user: User; max: number } | null>(null);
  const payouts = useQuery({ queryKey: ["claims", "payouts"], queryFn: () => api.claims({ status: "approved" }) });
  const kids = progress.filter((p) => p.allowanceRappen != null);
  if (!kids.length) return null;
  const history = (payouts.data ?? []).filter((c) => c.kind === "payout").slice(0, 6);
  return (
    <section className="section">
      <div className="section-head">
        <h2>💰 Taschengeld</h2>
      </div>
      <div className="panel list" style={{ padding: "4px 14px" }}>
        {kids.map((p) => {
          const u = users.find((x) => x.id === p.userId);
          if (!u) return null;
          return (
            <div className="list-item" key={p.userId}>
              <Avatar user={u} />
              <span className="grow">
                {u.name}
                <br />
                <small className="muted">{p.balance} Punkte</small>
              </span>
              <b className="money">{formatChf(p.allowanceRappen ?? 0)}</b>
              <button className="btn" style={{ minHeight: 36 }} disabled={(p.allowanceRappen ?? 0) < 5} onClick={() => setPaying({ user: u, max: p.allowanceRappen ?? 0 })}>
                Auszahlen
              </button>
            </div>
          );
        })}
        {history.map((c) => (
          <div className="list-item" key={c.id}>
            <span style={{ fontSize: "1.2rem" }}>💰</span>
            <span className="grow">
              <small>
                {users.find((x) => x.id === c.userId)?.name}: {formatChf(c.amountRappen ?? 0)} ausbezahlt
                {c.note && ` · ${c.note}`}
              </small>
              <br />
              <small className="muted">{formatDateTime(c.decidedAt ?? c.requestedAt)}</small>
            </span>
          </div>
        ))}
      </div>
      {paying && (
        <PayoutSheet
          title={`💰 ${paying.user.name} auszahlen`}
          maxRappen={paying.max}
          allowance={allowance}
          withNote
          submitLabel="Ausbezahlt"
          onSubmit={(r, note) =>
            api.payout(paying.user.id, r, note).then(() => (qc.invalidateQueries(), toast({ text: `${formatChf(r)} an ${paying.user.name} verbucht` })))
          }
          onClose={() => setPaying(null)}
        />
      )}
    </section>
  );
}

function PendingClaims({ claims, users }: { claims: Claim[]; users: User[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) => api.decideClaim(id, approve),
    onSuccess: (c) => (qc.invalidateQueries(), toast({ text: c.status === "approved" ? `${c.icon} ${c.title} freigegeben` : "Abgelehnt – Punkte sind wieder frei" })),
    onError: (e) => toast({ text: (e as Error).message }),
  });
  if (!claims.length) return null;
  return (
    <section className="section">
      <div className="section-head due">
        <h2>Wünsche zum Freigeben</h2>
        <span className="count">{claims.length}</span>
      </div>
      <div className="panel list" style={{ padding: "4px 14px" }}>
        {claims.map((c) => {
          const u = users.find((x) => x.id === c.userId) ?? null;
          return (
            <div className="claim" key={c.id}>
              <Avatar user={u} />
              <span>
                <b>{u?.name ?? "?"}</b> möchte {c.icon} {c.kind === "payout" ? `${formatChf(c.amountRappen ?? 0)} Taschengeld` : c.title}
                <br />
                <small className="muted">
                  {c.cost} Punkte · {formatDateTime(c.requestedAt)}
                </small>
              </span>
              <div className="row">
                <button className="btn" style={{ minHeight: 36 }} onClick={() => decide.mutate({ id: c.id, approve: false })} disabled={decide.isPending}>
                  Ablehnen
                </button>
                <button className="btn primary" style={{ minHeight: 36 }} onClick={() => decide.mutate({ id: c.id, approve: true })} disabled={decide.isPending}>
                  Freigeben
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RewardForm({ reward, preset, onClose }: { reward?: Reward; preset?: { title: string; icon: string; cost: number }; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(reward?.title ?? preset?.title ?? "");
  const [icon, setIcon] = useState(reward?.icon ?? preset?.icon ?? "🎁");
  const [cost, setCost] = useState(reward?.cost ?? preset?.cost ?? 50);
  const [description, setDescription] = useState(reward?.description ?? "");
  const [active, setActive] = useState(reward?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => (reward ? api.updateReward(reward.id, { title, icon, cost, description, active }) : api.createReward({ title, icon, cost, description })),
    onSuccess: () => (qc.invalidateQueries(), toast({ text: "Gespeichert" }), onClose()),
    onError: (e) => setError((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => api.deleteReward(reward!.id),
    onSuccess: () => (qc.invalidateQueries(), toast({ text: "Belohnung gelöscht" }), onClose()),
  });
  return (
    <Sheet title={reward ? "Belohnung bearbeiten" : "Neue Belohnung"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="field">
          <span>Was gibt es?</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder="z.B. Glace" />
        </label>
        <div className="field">
          <span>Symbol</span>
          <div className="chips">
            {(REWARD_ICONS.includes(icon) ? REWARD_ICONS : [icon, ...REWARD_ICONS]).map((i) => (
              <button type="button" key={i} className="chip" aria-pressed={i === icon} onClick={() => setIcon(i)}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Kostet (Punkte)</span>
          <input className="input" type="number" min={1} max={100000} value={cost} onChange={(e) => setCost(Number(e.target.value))} required />
          <small>Zum Vergleich: Bad putzen gibt 25, Betten beziehen 20 Punkte.</small>
        </label>
        <label className="field">
          <span>Beschreibung (optional)</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </label>
        {reward && (
          <label className="row check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Verfügbar
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row end">
          {reward && (
            <button type="button" className="btn danger" style={{ marginRight: "auto" }} onClick={() => confirm(`«${reward.title}» löschen?`) && del.mutate()}>
              Löschen
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!title || save.isPending}>
            Speichern
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function Shop({ rewards, balance, manage }: { rewards: Reward[]; balance: number; manage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<{ reward?: Reward; preset?: (typeof SUGGESTIONS)[number] } | null>(null);
  const claim = useMutation({
    mutationFn: (r: Reward) => api.claimReward(r.id),
    onSuccess: (c) => (qc.invalidateQueries(), toast({ text: `${c.icon} Wunsch gesendet – jetzt muss noch jemand zustimmen.` })),
    onError: (e) => toast({ text: (e as Error).message }),
  });
  const visible = rewards.filter((r) => r.active || manage);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Belohnungen</h2>
        {manage && (
          <button className="btn ghost" style={{ minHeight: 32, marginLeft: "auto" }} onClick={() => setEditing({})}>
            + Neue
          </button>
        )}
      </div>
      {visible.length === 0 && (
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>
            {manage ? "Noch keine Belohnungen. Vorschläge zum Übernehmen:" : "Noch keine Belohnungen – frag Mami oder Papi!"}
          </p>
          {manage && (
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s.title} className="chip" onClick={() => setEditing({ preset: s })}>
                  {s.icon} {s.title} · {s.cost}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="shop">
        {visible.map((r) => {
          const missing = r.cost - balance;
          return (
            <article className="reward" key={r.id} data-inactive={!r.active || undefined}>
              <span className="reward-icon" aria-hidden>
                {r.icon}
              </span>
              <span className="reward-title">{r.title}</span>
              {r.description && <small className="muted">{r.description}</small>}
              <span className="reward-cost">{r.cost} Punkte</span>
              {r.active &&
                (missing > 0 ? (
                  <span className="muted reward-missing">noch {missing} Punkte</span>
                ) : (
                  <button className="btn primary" onClick={() => confirm(`${r.icon} «${r.title}» für ${r.cost} Punkte einlösen?`) && claim.mutate(r)} disabled={claim.isPending}>
                    Einlösen
                  </button>
                ))}
              {manage && (
                <button className="btn ghost reward-edit" onClick={() => setEditing({ reward: r })} aria-label={`${r.title} bearbeiten`}>
                  ✎
                </button>
              )}
            </article>
          );
        })}
      </div>
      {editing && <RewardForm reward={editing.reward} preset={editing.preset} onClose={() => setEditing(null)} />}
    </section>
  );
}

function MyClaims({ claims }: { claims: Claim[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const withdraw = useMutation({ mutationFn: api.withdrawClaim, onSuccess: () => (qc.invalidateQueries(), toast({ text: "Zurückgezogen" })) });
  if (!claims.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>Meine Wünsche</h2>
      </div>
      <div className="panel list" style={{ padding: "4px 14px" }}>
        {claims.slice(0, 8).map((c) => (
          <div className="claim" key={c.id}>
            <span style={{ fontSize: "1.4rem" }}>{c.icon}</span>
            <span>
              {c.title} <small className="muted">· {c.cost} Punkte</small>
              <br />
              <span className={`pill ${c.status === "pending" ? "due" : c.status === "rejected" ? "overdue" : "good"}`}>{STATUS_LABEL[c.status]}</span>
            </span>
            {c.status === "pending" && (
              <div className="row">
                <button className="btn ghost" style={{ minHeight: 34 }} onClick={() => withdraw.mutate(c.id)}>
                  Zurückziehen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Badges({ p }: { p: Progress }) {
  const earned = p.badges.filter((b) => b.earnedAt).length;
  return (
    <section className="section">
      <div className="section-head">
        <h2>Abzeichen</h2>
        <span className="count">
          {earned}/{p.badges.length}
        </span>
      </div>
      <div className="badges">
        {p.badges.map((b) => (
          <div className="badge" key={b.key} data-earned={!!b.earnedAt || undefined} title={b.description}>
            <span className="badge-icon" aria-hidden>
              {b.earnedAt ? b.icon : "🔒"}
            </span>
            <b>{b.title}</b>
            <small>{b.earnedAt ? new Date(b.earnedAt).toLocaleDateString("de-CH") : b.description}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Family({ progress, users }: { progress: Progress[]; users: User[] }) {
  if (progress.length < 2) return null;
  const rows = [...progress].sort((a, b) => b.doneThisWeek - a.doneThisWeek || b.pointsTotal - a.pointsTotal);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Familie</h2>
      </div>
      <div className="panel list" style={{ padding: "4px 14px" }}>
        {rows.map((p) => {
          const u = users.find((x) => x.id === p.userId) ?? null;
          return (
            <div className="list-item" key={p.userId}>
              <Avatar user={u} />
              <span className="grow">
                {u?.name}
                <br />
                <small className="muted">
                  Level {p.level} · {p.badges.filter((b) => b.earnedAt).length} Abzeichen
                  {p.streak > 1 && ` · 🔥 ${p.streak} Tage`}
                </small>
              </span>
              <span className="muted" style={{ textAlign: "right", fontSize: "var(--fs-sm)" }}>
                <b style={{ color: "var(--ink)" }}>{p.doneThisWeek}</b> diese Woche
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RewardsPage() {
  const me = useMe();
  const manage = canManage(me);
  const progress = useQuery({ queryKey: ["progress"], queryFn: api.progress });
  const rewards = useQuery({ queryKey: ["rewards", manage], queryFn: () => api.rewards(manage) });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const myClaims = useQuery({ queryKey: ["claims", "mine", me.id], queryFn: () => api.claims({ userId: me.id }) });
  const pending = useQuery({ queryKey: ["claims", "pending"], queryFn: () => api.claims({ status: "pending" }), enabled: manage });
  const allowance = useQuery({ queryKey: ["allowance"], queryFn: api.allowance });

  const mine = progress.data?.find((p) => p.userId === me.id);
  if (progress.isLoading || !mine) return <p className="muted">Laden …</p>;
  return (
    <>
      <MyProgress me={me} p={mine} allowance={allowance.data?.enabled ? allowance.data : undefined} />
      {manage && <PendingClaims claims={pending.data ?? []} users={users.data ?? []} />}
      {manage && allowance.data?.enabled && <PocketMoney progress={progress.data ?? []} users={users.data ?? []} allowance={allowance.data} />}
      <Shop rewards={rewards.data ?? []} balance={mine.balance} manage={manage} />
      <MyClaims claims={myClaims.data ?? []} />
      <Badges p={mine} />
      <Family progress={progress.data ?? []} users={users.data ?? []} />
    </>
  );
}

/** Number of reward wishes waiting for an adult (badge on the tab). */
export function usePendingClaims(enabled: boolean): number {
  const q = useQuery({ queryKey: ["claims", "pending"], queryFn: () => api.claims({ status: "pending" }), enabled });
  return enabled ? (q.data?.length ?? 0) : 0;
}
