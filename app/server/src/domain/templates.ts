import type { IntervalUnit, ScheduleType } from "../db/schema.js";

export interface ChoreTemplate {
  key: string;
  title: string;
  description: string;
  room: string;
  icon: string;
  points: number;
  scheduleType: ScheduleType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
}

/** Built-in catalogue (Swiss spelling: "ss", never "ß"). */
export const TEMPLATES: ChoreTemplate[] = [
  { key: "betten", title: "Betten frisch beziehen", description: "Bettwäsche wechseln und waschen.", room: "Schlafzimmer", icon: "🛏️", points: 20, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day" },
  { key: "saugen", title: "Boden saugen", description: "Alle Räume saugen.", room: "Ganzes Haus", icon: "🧹", points: 15, scheduleType: "after_completion", intervalValue: 7, intervalUnit: "day" },
  { key: "wischen", title: "Boden wischen", description: "Hartböden feucht aufnehmen.", room: "Ganzes Haus", icon: "🪣", points: 20, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day" },
  { key: "bad", title: "Bäder / WC putzen", description: "Lavabo, WC, Dusche/Wanne, Spiegel, Boden.", room: "Bad", icon: "🚽", points: 25, scheduleType: "after_completion", intervalValue: 7, intervalUnit: "day" },
  { key: "gs-sieb", title: "Geschirrspüler-Sieb ausspülen", description: "Grobsieb herausnehmen und ausspülen.", room: "Küche", icon: "🍽️", points: 5, scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day" },
  { key: "gs-filter", title: "Geschirrspüler Filter + Sprüharme reinigen", description: "Feinfilter reinigen, Düsen der Sprüharme freimachen.", room: "Küche", icon: "🍽️", points: 15, scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month" },
  { key: "waschmaschine", title: "Waschmaschine reinigen", description: "Kochwäsche leer laufen lassen, Flusensieb, Türdichtung und Waschmittelfach reinigen.", room: "Waschküche", icon: "🧺", points: 15, scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month" },
  { key: "kuehlschrank", title: "Kühlschrank auswischen", description: "Abgelaufenes entsorgen, Fächer auswischen.", room: "Küche", icon: "🧊", points: 15, scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month" },
  { key: "backofen", title: "Backofen reinigen", description: "Innenraum, Bleche und Gitter reinigen.", room: "Küche", icon: "🔥", points: 25, scheduleType: "after_completion", intervalValue: 2, intervalUnit: "month" },
  { key: "fettfilter", title: "Dampfabzug-Fettfilter reinigen", description: "Fettfilter in den Geschirrspüler oder einweichen.", room: "Küche", icon: "💨", points: 10, scheduleType: "after_completion", intervalValue: 3, intervalUnit: "month" },
  { key: "entkalken", title: "Entkalken", description: "Wasserkocher, Kaffeemaschine und Duschköpfe entkalken.", room: "Küche / Bad", icon: "💧", points: 15, scheduleType: "after_completion", intervalValue: 6, intervalUnit: "week" },
  { key: "fenster", title: "Fenster putzen", description: "Scheiben innen und aussen, Rahmen.", room: "Ganzes Haus", icon: "🪟", points: 30, scheduleType: "after_completion", intervalValue: 3, intervalUnit: "month" },
  { key: "matratzen", title: "Matratzen drehen/wenden", description: "Kopf- und Fussende tauschen bzw. wenden.", room: "Schlafzimmer", icon: "🔄", points: 10, scheduleType: "fixed", intervalValue: 3, intervalUnit: "month" },
  { key: "rauchmelder", title: "Rauchmelder testen", description: "Testknopf drücken, bei Bedarf Batterie wechseln.", room: "Ganzes Haus", icon: "🚨", points: 5, scheduleType: "fixed", intervalValue: 6, intervalUnit: "month" },
  { key: "tiefkuehler", title: "Tiefkühler abtauen", description: "Ausräumen, abtauen, auswischen.", room: "Küche", icon: "❄️", points: 25, scheduleType: "after_completion", intervalValue: 6, intervalUnit: "month" },
];
