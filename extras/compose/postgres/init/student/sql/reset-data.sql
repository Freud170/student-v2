-- Loescht ausschliesslich die Studierenden-Testdaten und setzt IDs auf 1000 zurueck.
-- Nur in der student-v2-Testdatenbank ausfuehren.
-- Mit copy-csv.sql in einer gemeinsamen Transaktion und Fehlerabbruch aufrufen.

TRUNCATE TABLE student.pruefungsleistung, student.adresse, student.student
    RESTART IDENTITY;
