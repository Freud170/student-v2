import { adresseTable, pruefungsleistungTable, studentTable } from './schema.mts';
import { defineRelations } from 'drizzle-orm';

export const relations = defineRelations(
    { adresseTable, pruefungsleistungTable, studentTable },
    (rel) => {
        return {
            studentTable: {
                adresseTable: rel.one.adresseTable(),
                pruefungsleistungTable: rel.many.pruefungsleistungTable(),
            },
            adresseTable: {
                studentTable: rel.one.studentTable({
                    from: rel.adresseTable.studentId,
                    to: rel.studentTable.id,
                }),
            },
            pruefungsleistungTable: {
                studentTable: rel.one.studentTable({
                    from: rel.pruefungsleistungTable.studentId,
                    to: rel.studentTable.id,
                }),
            },
        };
    },
);
