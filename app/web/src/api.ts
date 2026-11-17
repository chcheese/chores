export type Role = "admin" | "adult" | "child";
export type Status = "ok" | "due" | "overdue";
export type ScheduleType = "after_completion" | "fixed";
export type IntervalUnit = "day" | "week" | "month";
export type AssignmentMode = "anyone" | "user" | "rotation";

export interface UserSummary {
  id: number;
  name: string;
  avatar: string;
  color: string;
}

export interface User extends UserSummary {
  role: Role;
  pointsTotal: number;
  active: boolean;
  hasPin: boolean;
  createdAt: string;
}

export interface Chore {
  id: number;
  title: string;
  description: string;
  room: string;
  icon: string;
  points: number;
  active: boolean;
  scheduleType: ScheduleType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  rrule: string | null;
  anchorDate: string | null;
  toleranceDays: number;
  nextDue: string;
  lastDone: string | null;
  assignmentMode: AssignmentMode;
  assignedUserId: number | null;
  rotationUserIds: number[];
  rotationIndex: number;
  counterTarget: number | null;
  counterValue: number;
  counterLabel: string;
  durationMinutes: number | null;
  activeMonths: number[];
  status: Status;
  daysUntilDue: number;
  counterReached: boolean;
  assignee: UserSummary | null;
  freshness: number;
  inSeason: boolean;
  paused: boolean;
}

export type ChoreInput = Partial<
  Omit<Chore, "id" | "status" | "daysUntilDue" | "counterReached" | "assignee" | "lastDone" | "rotationIndex" | "freshness" | "inSeason" | "paused">
> & {
  lastDoneDate?: string | null;
};

export interface Completion {
  id: number;
  choreId: number;
  choreTitle: string;
  choreIcon: string;
  userId: number | null;
  kind: "done" | "skip";
  doneAt: string;
  points: number;
  note: string;
}

export type TemplateCategory = "haushalt" | "haus-garten";

export interface Template {
  key: string;
  category: TemplateCategory;
  durationMinutes: number;
  activeMonths: number[];
  title: string;
  description: string;
  room: string;
  icon: string;
  points: number;
  scheduleType: ScheduleType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
}

export interface ApiToken {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  token?: string;
}

export interface Vacation {
  from: string;
  until: string;
  active: boolean;
}

export interface Reward {
  id: number;
  title: string;
  description: string;
  icon: string;
  cost: number;
  active: boolean;
}

export type ClaimStatus = "pending" | "approved" | "rejected";

export interface Claim {
  id: number;
  rewardId: number | null;
  title: string;
  icon: string;
  cost: number;
  userId: number;
  status: ClaimStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: number | null;
}

export interface Badge {
  key: string;
  title: string;
  icon: string;
  description: string;
  earnedAt: string | null;
}

export interface Progress {
  userId: number;
  pointsTotal: number;
  balance: number;
  level: number;
  levelFloor: number;
  levelNext: number;
  streak: number;
  bestStreak: number;
  doneCount: number;
  doneThisWeek: number;
  badges: Badge[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Fehler ${res.status}`);
  return data as T;
}

export const api = {
  setupStatus: () => call<{ needsSetup: boolean }>("GET", "/api/setup"),
  setup: (b: { name: string; pin: string; avatar: string; color: string; importTemplates: boolean }) => call<User>("POST", "/api/setup", b),
  loginUsers: () => call<(UserSummary & { hasPin: boolean })[]>("GET", "/api/auth/users"),
  login: (userId: number, pin: string) => call<User>("POST", "/api/auth/login", { userId, pin }),
  logout: () => call<void>("POST", "/api/auth/logout"),
  me: () => call<{ kind: "session" | "token"; user: User | null }>("GET", "/api/auth/me"),

  chores: (includeInactive = false) => call<Chore[]>("GET", `/api/chores${includeInactive ? "?include_inactive=true" : ""}`),
  createChore: (b: ChoreInput) => call<Chore>("POST", "/api/chores", b),
  updateChore: (id: number, b: ChoreInput) => call<Chore>("PATCH", `/api/chores/${id}`, b),
  deleteChore: (id: number) => call<void>("DELETE", `/api/chores/${id}`),
  complete: (id: number, userId?: number | null) =>
    call<{ chore: Chore; completion_id: number }>("POST", `/api/chores/${id}/complete`, userId ? { user_id: userId } : {}),
  skip: (id: number) => call<{ chore: Chore; completion_id: number }>("POST", `/api/chores/${id}/skip`, {}),
  snooze: (id: number, days: number) => call<Chore>("POST", `/api/chores/${id}/snooze`, { days }),
  counter: (id: number, by: number) => call<Chore>("POST", `/api/chores/${id}/counter`, { by }),

  completions: (q: { choreId?: number; userId?: number; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.choreId) p.set("chore_id", String(q.choreId));
    if (q.userId) p.set("user_id", String(q.userId));
    p.set("limit", String(q.limit ?? 100));
    return call<Completion[]>("GET", `/api/completions?${p}`);
  },
  undo: (completionId: number) => call<Chore>("DELETE", `/api/completions/${completionId}`),

  users: () => call<User[]>("GET", "/api/users"),
  createUser: (b: { name: string; role: Role; avatar: string; color: string; pin?: string }) => call<User>("POST", "/api/users", b),
  updateUser: (id: number, b: Partial<{ name: string; role: Role; avatar: string; color: string; pin: string | null; active: boolean }>) =>
    call<User>("PATCH", `/api/users/${id}`, b),
  deleteUser: (id: number) => call<void>("DELETE", `/api/users/${id}`),

  tokens: () => call<ApiToken[]>("GET", "/api/tokens"),
  createToken: (name: string) => call<ApiToken>("POST", "/api/tokens", { name }),
  deleteToken: (id: number) => call<void>("DELETE", `/api/tokens/${id}`),

  vacation: () => call<Vacation | null>("GET", "/api/vacation"),
  setVacation: (from: string, until: string) => call<Vacation>("PUT", "/api/vacation", { from, until }),
  endVacation: () => call<void>("DELETE", "/api/vacation"),

  rewards: (includeInactive = false) => call<Reward[]>("GET", `/api/rewards${includeInactive ? "?include_inactive=true" : ""}`),
  createReward: (b: { title: string; description: string; icon: string; cost: number }) => call<Reward>("POST", "/api/rewards", b),
  updateReward: (id: number, b: Partial<Omit<Reward, "id">>) => call<Reward>("PATCH", `/api/rewards/${id}`, b),
  deleteReward: (id: number) => call<void>("DELETE", `/api/rewards/${id}`),
  claimReward: (id: number) => call<Claim>("POST", `/api/rewards/${id}/claim`, {}),
  claims: (q: { status?: ClaimStatus; userId?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.status) p.set("status", q.status);
    if (q.userId) p.set("user_id", String(q.userId));
    return call<Claim[]>("GET", `/api/claims?${p}`);
  },
  decideClaim: (id: number, approve: boolean) => call<Claim>("POST", `/api/claims/${id}/${approve ? "approve" : "reject"}`, {}),
  withdrawClaim: (id: number) => call<void>("DELETE", `/api/claims/${id}`),
  progress: () => call<Progress[]>("GET", "/api/progress"),

  templates: () => call<Template[]>("GET", "/api/templates"),
  importTemplates: (keys: string[] | "all") => call<Chore[]>("POST", "/api/templates/import", { keys }),
};
