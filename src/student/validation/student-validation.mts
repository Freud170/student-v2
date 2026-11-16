// Validierung neuer Studierender mit Zod (Request-Body bei POST).
// "strictObject": unbekannte Felder im JSON werden abgelehnt.

import { z } from 'zod';

const MAX_LENGTH_TEXT = 64;
const MAX_LENGTH_USERNAME = 20;

// Zulaessige Notenstufen wie im CHECK-Constraint der Tabelle pruefungsleistung
// oxlint-disable-next-line no-magic-numbers
export const NOTEN: readonly number[] = [1, 1.3, 1.7, 2, 2.3, 2.7, 3, 3.3, 3.7, 4, 5];

// Grosser Anfangsbuchstabe, auch Doppelnamen wie "Mueller-Luedenscheidt" oder "Müller-Lüdenscheidt"
const NAME_PATTERN = /^[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)*$/u;

const text = z.string().trim().min(1).max(MAX_LENGTH_TEXT);

export const AdresseNeuSchema = z.strictObject({
    plz: z.string().regex(/^\d{5}$/u, 'Die PLZ muss aus 5 Ziffern bestehen'),
    ort: text,
});

export const PruefungsleistungNeuSchema = z.strictObject({
    modul: text,
    note: z.number().refine((note) => NOTEN.includes(note), 'Keine zulaessige Notenstufe'),
    semester: z
        .string()
        .regex(/^(?:WS \d{4}\/\d{2}|SS \d{4})$/u, 'Semester z.B. "WS 2026/27" oder "SS 2026"'),
});

export const StudentNeuSchema = z.strictObject({
    matrikelnummer: z.string().regex(/^\d{6}$/u, 'Die Matrikelnummer muss 6 Ziffern haben'),
    nachname: z.string().regex(NAME_PATTERN, 'Der Nachname muss gross beginnen'),
    vorname: z.string().regex(NAME_PATTERN, 'Der Vorname muss gross beginnen'),
    email: z.email(),
    username: z.string().trim().min(1).max(MAX_LENGTH_USERNAME),
    adresse: AdresseNeuSchema,
    pruefungsleistungen: z.array(PruefungsleistungNeuSchema),
});

// Aus dem Schema abgeleiteter TypeScript-Typ
export type StudentNeu = z.infer<typeof StudentNeuSchema>;
