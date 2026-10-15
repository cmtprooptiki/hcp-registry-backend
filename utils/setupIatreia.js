// Runs once at startup, after setupDimoi():
//  1. adds the HCProviders columns source_id / location_accuracy to existing databases
//     (db.sync() creates new tables but never adds columns to existing ones)
//  2. imports the Περιφερειακά Ιατρεία ("Regional Clinic") and Πολυδύναμα Περιφερειακά Ιατρεία
//     ("Multipurpose Regional Clinic") of data/iatreia.json into HCProviders — only if none has
//     been imported yet, so clinics deleted or edited later in the app are left as they are.
//
//  3. clears HEALTH_Center_In_The_Network of imported clinics never edited since (databases that
//     imported the first version of data/iatreia.json, which still had it)
//  4. moves imported clinics still at their old position to the corrected one (once): the first
//     versions of data/iatreia.json were ~300 m south-west of the true position (ΕΓΣΑ87 converted
//     without the datum shift); data/iatreia_coords_previous.json has those old positions
//
// Municipality, municipal unit and settlement of the clinics are set by utils/setupPlaces.js.
//
// data/iatreia.json comes from the file "Χάρτης δομών ΠΦΥ offline.html" (window.__DATA__.domes).
// Positions are those of the settlement (village) of each clinic, not of the building;
// location_accuracy says how they were found. It has no Health Centre: in that file the clinic →
// Κέντρο Υγείας link is only official for the 3rd ΥΠΕ, the rest is estimated (same municipality
// or nearest), so it is left empty.
import { DataTypes, Op } from "sequelize";
import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";
import { placeFields, SEAT_ACCURACY } from "./oikismoiLookup.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";

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

const readIatreia = () => readDataFile("iatreia.json").records;

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

// Step 4, once per database. Only clinics still exactly at their old position are moved (a clinic
// whose position was changed in the app keeps it). Returns the number moved.
const DATUM_FIX = "iatreia.json: positions with the datum shift";
const moveToCorrectedPositions = async () => {
    if (await storedVersion(DATUM_FIX) === "done") return 0;
    const previous = readDataFile("iatreia_coords_previous.json").records; // { source_id: [lat, lon] }
    const corrected = Object.fromEntries(readIatreia().map((r) => [r.source_id, r]));
    let moved = 0;
    await db.transaction(async (transaction) => {
        for (const [source_id, [lat, lon]] of Object.entries(previous)) {
            const target = corrected[source_id];
            if (!target) continue;
            const [count] = await HCProviders.update(
                { lat: target.lat, lon: target.lon },
                { where: { source_id, lat, lon }, silent: true, transaction }
            );
            moved += count;
        }
        await saveVersion(DATUM_FIX, "done", transaction);
    });
    return moved;
};

// Returns { imported, moved }
export const setupIatreia = async () => {
    await ensureIatreiaColumns();
    const imported = await importIatreia();
    const cleared = await clearEstimatedHealthCentres();
    const moved = await moveToCorrectedPositions();
    const clinics = await HCProviders.count({
        where: { type_Of_Hcp: ["Regional Clinic", "Multipurpose Regional Clinic"] },
    });
    console.log(
        `Regional clinics (ΠΙ / ΠΠΙ): ${clinics}` +
        (imported ? ` (${imported} imported from data/iatreia.json)` : "") +
        (cleared ? ` (estimated Health Centre removed from ${cleared})` : "") +
        (moved ? ` (${moved} moved to the corrected position)` : "")
    );
    return { imported, moved };
};
