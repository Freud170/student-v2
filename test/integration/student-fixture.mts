import { type StudentNeu } from '../../src/student/validation/student-validation.mts';
import { inject } from 'vitest';
import { restURL } from './constants.mts';

// Eigene Aggregate statt gemeinsam gelesener CSV-Fixtures; keine Treffer fuer Suchtests.
// PUT verwendet 66xxxx, Encoding 67xxxx und Repository-Tests 68xxxx.
export const createStudentFixture = async (matrikelnummer: string) => {
    const daten: StudentNeu = {
        matrikelnummer,
        nachname: 'Neu',
        vorname: 'Nina',
        email: `test.${matrikelnummer}@h-ka.de`,
        username: `test${matrikelnummer}`,
        adresse: { plz: '53111', ort: 'Bonn' },
        pruefungsleistungen: [{ modul: 'Datenbanken', note: 2, semester: 'SS 2026' }],
    };
    const response = await fetch(restURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${inject('adminToken')}`,
        },
        body: JSON.stringify(daten),
    });
    const location = response.headers.get('Location');
    if (response.status !== 201 || location === null) {
        throw new Error('Anlegen des Testaggregats fehlgeschlagen.');
    }
    return { daten, location };
};
