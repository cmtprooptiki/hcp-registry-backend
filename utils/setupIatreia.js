// Runs once at startup, after setupDimoi():
//  1. adds the HCProviders columns source_id / location_accuracy to existing databases
//     (db.sync() creates new tables but never adds columns to existing ones)
//  2. imports the Περιφερειακά Ιατρεία ("Regional Clinic") and Πολυδύναμα Περιφερειακά Ιατρεία
//     ("Multipurpose Regional Clinic") of data/iatreia.json into HCProviders — only if none has
//     been imported yet, so clinics deleted or edited later in the app are left as they are.
//
//  3. clears HEALTH_Center_In_The_Network of imported clinics never edited since (databases that
//     imported the first version of data/iatreia.json, which still had it)
//
// data/iatreia.json comes from the file "Χάρτης δομών ΠΦΥ offline.html" (window.__DATA__.domes).
// Positions are those of the settlement (village) of each clinic, not of the building;
// location_accuracy says how they were found. It has no Health Centre: in that file the clinic →
// Κέντρο Υγείας link is only official for the 3rd ΥΠΕ, the rest is estimated (same municipality
// or nearest), so it is left empty.
import fs from "fs";
import { DataTypes, Op } from "sequelize";
import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";
import { placeFields, SEAT_ACCURACY } from "./oikismoiLookup.js";

const NEW_COLUMNS = {
    source_id: { type: DataTypes.STRING(20), allowNull: true },
    location_accuracy: { type: DataTypes.STRING(100), allowNull: true },
};

const ensureIatreiaColumns = async () => {
    const qi = db.getQueryInterface();
    const table = HCProviders.getTableName();
    const columns = await qi.describeTable(table);
    for (const [name, spec] of Object.entries(NEW_COLUMNS)) {
        if (!columns[name]) await qi.addColumn(table, name, spec);
    }
};

const readIatreia = () =>
    JSON.parse(fs.readFileSync(new URL("../data/iatreia.json", import.meta.url), "utf8"));

// Returns the number of clinics imported (0 when they were already there)
export const importIatreia = async () => {
    const already = await HCProviders.count({ where: { source_id: { [Op.ne]: null } } });
    if (already > 0) return 0;

    const rows = [];
    for (const record of readIatreia()) {
        // municipality and settlement (none for clinics placed at the municipality seat)
        rows.push({ ...record, ...(await placeFields(record.lat, record.lon, record.location_accuracy !== SEAT_ACCURACY)) });
    }
    // all or nothing: a failed import is simply retried at the next start
    await db.transaction((transaction) => HCProviders.bulkCreate(rows, { transaction }));
    return rows.length;
};

// The first version of data/iatreia.json filled HEALTH_Center_In_The_Network with that estimate.
// Rows never edited (updatedAt = createdAt) still have it: clear it. Edited rows are left alone.
const clearEstimatedHealthCentres = async () => {
    const [cleared] = await HCProviders.update(
        { HEALTH_Center_In_The_Network: null },
        {
            where: {
                source_id: { [Op.ne]: null },
                HEALTH_Center_In_The_Network: { [Op.ne]: null },
                [Op.and]: [db.where(db.col("updatedAt"), Op.eq, db.col("createdAt"))],
            },
            silent: true,
        }
    );
    return cleared;
};

export const setupIatreia = async () => {
    await ensureIatreiaColumns();
    const imported = await importIatreia();
    const cleared = await clearEstimatedHealthCentres();
    const clinics = await HCProviders.count({
        where: { type_Of_Hcp: ["Regional Clinic", "Multipurpose Regional Clinic"] },
    });
    console.log(
        `Regional clinics (ΠΙ / ΠΠΙ): ${clinics}` +
        (imported ? ` (${imported} imported from data/iatreia.json)` : "") +
        (cleared ? ` (estimated Health Centre removed from ${cleared})` : "")
    );
};
