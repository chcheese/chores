import type { IntervalUnit, ScheduleType } from "../db/schema.js";

export const TEMPLATE_CATEGORIES = ["haushalt", "haus-garten"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface ChoreTemplate {
  key: string;
  category: TemplateCategory;
  title: string;
  description: string;
  room: string;
  icon: string;
  points: number;
  scheduleType: ScheduleType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  durationMinutes: number;
  /** Months (1–12) the chore is in season; empty = all year. */
  activeMonths: number[];
}

type Def = Omit<ChoreTemplate, "category" | "activeMonths"> & { activeMonths?: number[] };

const ALL_YEAR: number[] = [];
const months = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const haushalt: Def[] = [
  { key: "betten", title: "Betten frisch beziehen", description: "Bettwäsche wechseln und waschen.", room: "Schlafzimmer", icon: "🛏️", points: 20, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day", durationMinutes: 20 },
  { key: "saugen", title: "Boden saugen", description: "Alle Räume saugen.", room: "Ganzes Haus", icon: "🧹", points: 15, scheduleType: "after_completion", intervalValue: 7, intervalUnit: "day", durationMinutes: 30 },
  { key: "wischen", title: "Boden wischen", description: "Hartböden feucht aufnehmen.", room: "Ganzes Haus", icon: "🪣", points: 20, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day", durationMinutes: 30 },
  { key: "bad", title: "Bäder / WC putzen", description: "Lavabo, WC, Dusche/Wanne, Spiegel, Boden.", room: "Bad", icon: "🚽", points: 25, scheduleType: "after_completion", intervalValue: 7, intervalUnit: "day", durationMinutes: 30 },
  { key: "gs-sieb", title: "Geschirrspüler-Sieb ausspülen", description: "Grobsieb herausnehmen und ausspülen.", room: "Küche", icon: "🍽️", points: 5, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day", durationMinutes: 5 },
  { key: "gs-filter", title: "Geschirrspüler Filter + Sprüharme reinigen", description: "Feinfilter reinigen, Düsen der Sprüharme freimachen.", room: "Küche", icon: "🍽️", points: 15, scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month", durationMinutes: 15 },
  { key: "waschmaschine", title: "Waschmaschine reinigen", description: "Kochwäsche leer laufen lassen, Flusensieb, Türdichtung und Waschmittelfach reinigen.", room: "Waschküche", icon: "🧺", points: 15, scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month", durationMinutes: 15 },
  { key: "kuehlschrank", title: "Kühlschrank auswischen", description: "Abgelaufenes entsorgen, Fächer auswischen.", room: "Küche", icon: "🧊", points: 15, scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month", durationMinutes: 20 },
  { key: "backofen", title: "Backofen reinigen", description: "Innenraum, Bleche und Gitter reinigen.", room: "Küche", icon: "🔥", points: 25, scheduleType: "after_completion", intervalValue: 2, intervalUnit: "month", durationMinutes: 40 },
  { key: "fettfilter", title: "Dampfabzug-Fettfilter reinigen", description: "Fettfilter in den Geschirrspüler oder einweichen.", room: "Küche", icon: "💨", points: 10, scheduleType: "after_completion", intervalValue: 3, intervalUnit: "month", durationMinutes: 10 },
  { key: "entkalken", title: "Entkalken", description: "Wasserkocher, Kaffeemaschine und Duschköpfe entkalken.", room: "Küche / Bad", icon: "💧", points: 15, scheduleType: "after_completion", intervalValue: 6, intervalUnit: "week", durationMinutes: 15 },
  { key: "fenster", title: "Fenster putzen", description: "Scheiben innen und aussen, Rahmen.", room: "Ganzes Haus", icon: "🪟", points: 30, scheduleType: "after_completion", intervalValue: 3, intervalUnit: "month", durationMinutes: 90 },
  { key: "matratzen", title: "Matratzen drehen/wenden", description: "Kopf- und Fussende tauschen bzw. wenden.", room: "Schlafzimmer", icon: "🔄", points: 10, scheduleType: "fixed", intervalValue: 3, intervalUnit: "month", durationMinutes: 10 },
  { key: "rauchmelder", title: "Rauchmelder testen", description: "Testknopf drücken, bei Bedarf Batterie wechseln.", room: "Ganzes Haus", icon: "🚨", points: 5, scheduleType: "fixed", intervalValue: 6, intervalUnit: "month", durationMinutes: 10 },
  { key: "recycling", title: "Recycling wegbringen", description: "PET, Glas, Karton und Alu/Dosen zur Sammelstelle bringen.", room: "Entsorgung", icon: "♻️", points: 15, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day", durationMinutes: 30 },
  { key: "tiefkuehler", title: "Tiefkühler abtauen", description: "Ausräumen, abtauen, auswischen.", room: "Küche", icon: "❄️", points: 25, scheduleType: "after_completion", intervalValue: 6, intervalUnit: "month", durationMinutes: 60 },
];

const hausGarten: Def[] = [
  { key: "rasen", title: "Rasen mähen", description: "Rasen mähen, Kanten schneiden.", room: "Garten", icon: "🌱", points: 25, scheduleType: "after_completion", intervalValue: 7, intervalUnit: "day", durationMinutes: 45, activeMonths: months(4, 10) },
  { key: "unkraut", title: "Unkraut jäten", description: "Beete und Plattenfugen.", room: "Garten", icon: "🌿", points: 20, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day", durationMinutes: 30, activeMonths: months(4, 10) },
  { key: "hecke", title: "Hecke schneiden", description: "Hecke und Sträucher in Form schneiden, Schnittgut entsorgen.", room: "Garten", icon: "✂️", points: 40, scheduleType: "after_completion", intervalValue: 3, intervalUnit: "month", durationMinutes: 120, activeMonths: months(5, 9) },
  { key: "laub", title: "Laub rechen", description: "Rasen, Wege und Einfahrt von Laub befreien.", room: "Garten", icon: "🍂", points: 20, scheduleType: "after_completion", intervalValue: 7, intervalUnit: "day", durationMinutes: 45, activeMonths: [10, 11] },
  { key: "vorplatz", title: "Vorplatz / Hauseingang wischen", description: "Eingang, Treppe und Vorplatz wischen, Fussmatte ausklopfen.", room: "Aussen", icon: "🚪", points: 10, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day", durationMinutes: 15 },
  { key: "grill", title: "Grill reinigen", description: "Rost bürsten, Fettschale leeren.", room: "Aussen", icon: "🍖", points: 10, scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month", durationMinutes: 20, activeMonths: months(4, 9) },
  { key: "dachrinne", title: "Dachrinne reinigen", description: "Laub aus Dachrinnen und Fallrohren entfernen.", room: "Aussen", icon: "🏠", points: 40, scheduleType: "after_completion", intervalValue: 12, intervalUnit: "month", durationMinutes: 60, activeMonths: [11] },
  { key: "aussenwasser", title: "Aussenwasser abstellen", description: "Aussenhahn absperren und entleeren, Gartenschlauch versorgen (Frostschutz).", room: "Aussen", icon: "🚰", points: 10, scheduleType: "after_completion", intervalValue: 12, intervalUnit: "month", durationMinutes: 15, activeMonths: [10, 11] },
  { key: "heizung", title: "Heizkörper entlüften", description: "Alle Heizkörper entlüften, Druck der Heizung prüfen.", room: "Ganzes Haus", icon: "🌡️", points: 15, scheduleType: "after_completion", intervalValue: 12, intervalUnit: "month", durationMinutes: 30, activeMonths: [9, 10] },
  { key: "reifen", title: "Reifen wechseln", description: "Sommer-/Winterreifen wechseln (von O bis O), Profil und Druck prüfen.", room: "Garage", icon: "🚗", points: 20, scheduleType: "after_completion", intervalValue: 6, intervalUnit: "month", durationMinutes: 60, activeMonths: [3, 4, 10, 11] },
  { key: "lueftung", title: "Lüftungsfilter wechseln", description: "Filter der Komfortlüftung wechseln.", room: "Technik", icon: "🌬️", points: 15, scheduleType: "after_completion", intervalValue: 6, intervalUnit: "month", durationMinutes: 15 },
  { key: "salz", title: "Enthärtungsanlage: Salz nachfüllen", description: "Regeneriersalz nachfüllen, Füllstand prüfen.", room: "Technik", icon: "🧂", points: 10, scheduleType: "after_completion", intervalValue: 2, intervalUnit: "month", durationMinutes: 10 },
  { key: "storen", title: "Storen / Lamellen reinigen", description: "Lamellenstoren und Rollläden abwaschen.", room: "Aussen", icon: "🪟", points: 30, scheduleType: "after_completion", intervalValue: 12, intervalUnit: "month", durationMinutes: 90, activeMonths: [4, 5] },
  { key: "keller", title: "Keller / Garage aufräumen", description: "Ausmisten, wischen, Entsorgung organisieren.", room: "Keller", icon: "📦", points: 30, scheduleType: "after_completion", intervalValue: 6, intervalUnit: "month", durationMinutes: 90 },
];

/** Built-in catalogue (Swiss spelling: "ss", never "ß"). */
export const TEMPLATES: ChoreTemplate[] = [
  ...haushalt.map((t) => ({ ...t, category: "haushalt" as const, activeMonths: t.activeMonths ?? ALL_YEAR })),
  ...hausGarten.map((t) => ({ ...t, category: "haus-garten" as const, activeMonths: t.activeMonths ?? ALL_YEAR })),
];

/** Templates offered during first setup: the everyday household ones. */
export const DEFAULT_TEMPLATE_KEYS = TEMPLATES.filter((t) => t.category === "haushalt").map((t) => t.key);
