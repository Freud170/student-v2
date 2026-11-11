-- Testdaten in die vorbereiteten, leeren Tabellen importieren.
-- CSV-Dateien muessen im Container unter /init/student/csv lesbar sein.
-- Mit psql --set=ON_ERROR_STOP=1 --single-transaction ausfuehren.

SET search_path TO student;

COPY student (
    id, version, matrikelnummer, nachname, vorname, email, username,
    erzeugt, aktualisiert
)
FROM '/init/student/csv/student.csv'
WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'UTF8');

COPY adresse (id, plz, ort, student_id)
FROM '/init/student/csv/adresse.csv'
WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'UTF8');

COPY pruefungsleistung (id, modul, note, semester, student_id)
FROM '/init/student/csv/pruefungsleistung.csv'
WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'UTF8');
