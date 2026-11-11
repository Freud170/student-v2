import { z } from 'zod';

const text = z.string().trim().min(1);

export const SuchparameterSchema = z.strictObject({
    nachname: text.optional(),
    vorname: text.optional(),
    matrikelnummer: text.regex(/^\d{6}$/u).optional(),
    email: text.optional(),
    plz: text.regex(/^\d{5}$/u).optional(),
    ort: text.optional(),
});

export type Suchparameter = z.infer<typeof SuchparameterSchema>;
