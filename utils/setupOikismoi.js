// At startup (see index.js):
//  prepareOikismoiTables(), after setupDimoi() and before setupIatreia():
//   1. fills the Oikismoi (settlements) table from data/oikismoi.json, if it is empty or out of date
//   2. adds the HCProviders columns oikismos / oikismos_id to existing databases
//      (db.sync() creates new tables but never adds columns to existing ones)
//  setupOikismoi(), after setupIatreia():
//   3. sets the settlement of every provider that has a municipality but no settlement yet:
//      the nearest settlement of its municipality. Regional clinics placed at the seat of their
//      municipality because their village wasn't identified get no settlement (it is unknown).
//
// data/oikismoi.json comes from the user's file Oikismoi-Greece.geojson (ΕΛΣΤΑΤ, 13,548
// settlements). Its municipality comes from the ΕΛΣΤΑΤ code of each settlement (see README).
import fs from "fs";
import { DataTypes, Op } from "sequelize";
import db from "../config/Database.js";
import Oikismoi from "../models/OikismoiModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import { clearOikismoiCache, oikismosFields, SEAT_ACCURACY } from "./oikismoiLookup.js";

const FIELDS = ["code", "name", "official_name", "koinotita", "lat", "lon", "dimos_code"];

const readOikismoi = () =>
    JSON.parse(fs.readFileSync(new URL("../data/oikismoi.json", import.meta.url), "utf8"));

const seedOikismoi = async () => {
    const records = readOikismoi();
    if (await Oikismoi.count() === records.length) return false;

    await db.transaction(async (transaction) => {
        for (let i = 0; i < records.length; i += 1000) {
            await Oikismoi.bulkCreate(records.slice(i, i + 1000), {
                updateOnDuplicate: FIELDS,
                transaction,
            });
        }
    });
    clearOikismoiCache();
    return true;
};

const ensureProviderColumns = async () => {
    const qi = db.getQueryInterface();
    const table = HCProviders.getTableName();
    const columns = await qi.describeTable(table);
    if (!columns.oikismos) {
        await qi.addColumn(table, "oikismos", { type: DataTypes.STRING(200), allowNull: true });
    }
    if (!columns.oikismos_id) {
        await qi.addColumn(table, "oikismos_id", { type: DataTypes.INTEGER, allowNull: true });
    }
    // Index for filtering by settlement (not in the model: on an existing table db.sync()
    // would try to create it before the column exists)
    const indexes = await qi.showIndex(table);
    if (!indexes.some((index) => index.fields.some((field) => field.attribute === "oikismos_id"))) {
        await qi.addIndex(table, ["oikismos_id"]);
    }
};

// Settlement of the providers from lat/lon and municipality. onlyMissing=false recomputes all.
export const assignOikismoi = async ({ onlyMissing = true } = {}) => {
    const providers = await HCProviders.findAll({
        attributes: ["id", "lat", "lon", "dimos_code", "oikismos_id", "location_accuracy"],
        where: onlyMissing
            ? {
                oikismos_id: null,
                dimos_code: { [Op.ne]: null },
                [Op.or]: [{ location_accuracy: null }, { location_accuracy: { [Op.ne]: SEAT_ACCURACY } }],
            }
            : undefined,
        raw: true,
    });
    let changed = 0;
    for (const p of providers) {
        const fields = p.location_accuracy === SEAT_ACCURACY
            ? { oikismos: null, oikismos_id: null }
            : await oikismosFields(p.lat, p.lon, p.dimos_code);
        if (fields.oikismos_id !== p.oikismos_id || !onlyMissing) {
            // silent: a computed field, not an edit (keeps updatedAt)
            await HCProviders.update(fields, { where: { id: p.id }, silent: true });
            changed++;
        }
    }
    return changed;
};

let seededAtStartup = false;

export const prepareOikismoiTables = async () => {
    await Oikismoi.sync();
    seededAtStartup = await seedOikismoi();
    await ensureProviderColumns();
    return seededAtStartup;
};

export const setupOikismoi = async () => {
    const seeded = seededAtStartup;
    const assigned = await assignOikismoi({ onlyMissing: true });
    console.log(
        `Settlements: ${await Oikismoi.count()}` +
        (seeded ? " (table filled from data/oikismoi.json)" : "") +
        (assigned ? `, settlement set for ${assigned} providers` : "")
    );
};
