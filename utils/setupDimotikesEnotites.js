// Runs once at startup, after setupDimoi() and before the settlements (see index.js):
//  1. fills the DimotikesEnotites (municipal units) table from data/dimotikes_enotites.json, when it
//     is incomplete or the file changed (versions in the DataVersions table)
//  2. adds the HCProviders columns dimotiki_enotita / de_code to existing databases
//     (db.sync() creates new tables but never adds columns to existing ones)
//
// data/dimotikes_enotites.json: the 1037 units of the 2021 census (codes, names, population, from the
// user's file MON_PLI_DHM_OIKISN_2021.xlsx); their boundaries are the union of their communities (user's
// file dimotikes_topikes_koinotites.geojson, ΕΛΣΤΑΤ 2011, EPSG:2100), converted to WGS84 with the
// ΕΓΣΑ87 datum shift; Δ.Ε. Δηλεσίου, created since 2011, has an approximate boundary (see README).
import { DataTypes, Op } from "sequelize";
import db from "../config/Database.js";
import DimotikesEnotites from "../models/DimotikesEnotitesModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import { clearDimoiCache } from "./dimoiLookup.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";

const FIELDS = ["name", "label", "official_name", "dimos_code", "area_km2", "population", "code_2011",
    "geometry", "geometry_detail"];

// Columns added after the table was first created
const NEW_COLUMNS = {
    population: { type: DataTypes.INTEGER, allowNull: true },
    code_2011: { type: DataTypes.STRING(6), allowNull: true },
};

const ensureColumns = async () => {
    const qi = db.getQueryInterface();
    const table = DimotikesEnotites.getTableName();
    const columns = await qi.describeTable(table);
    for (const [name, spec] of Object.entries(NEW_COLUMNS)) {
        if (!columns[name]) await qi.addColumn(table, name, spec);
    }
};

const seedDimotikesEnotites = async () => {
    const { records, version } = readDataFile("dimotikes_enotites.json");
    if (await DimotikesEnotites.count() === records.length &&
        await storedVersion("dimotikes_enotites.json") === version) {
        return false;
    }
    const rows = records.map((r) => ({
        ...r,
        geometry: JSON.stringify(r.geometry),
        geometry_detail: JSON.stringify(r.geometry_detail),
    }));
    await db.transaction(async (transaction) => {
        for (let i = 0; i < rows.length; i += 100) {
            await DimotikesEnotites.bulkCreate(rows.slice(i, i + 100), { updateOnDuplicate: FIELDS, transaction });
        }
        // units no longer in the file (none expected)
        await DimotikesEnotites.destroy({ where: { code: { [Op.notIn]: rows.map((r) => r.code) } }, transaction });
        await saveVersion("dimotikes_enotites.json", version, transaction);
    });
    clearDimoiCache();
    return true;
};

const ensureProviderColumns = async () => {
    const qi = db.getQueryInterface();
    const table = HCProviders.getTableName();
    const columns = await qi.describeTable(table);
    if (!columns.dimotiki_enotita) {
        await qi.addColumn(table, "dimotiki_enotita", { type: DataTypes.STRING(250), allowNull: true });
    }
    if (!columns.de_code) {
        await qi.addColumn(table, "de_code", { type: DataTypes.STRING(6), allowNull: true });
    }
    // Index for filtering by municipal unit (not in the model, see setupDimoi.js)
    const indexes = await qi.showIndex(table);
    if (!indexes.some((index) => index.fields.some((field) => field.attribute === "de_code"))) {
        await qi.addIndex(table, ["de_code"]);
    }
};

// Returns true when the table was (re)loaded from the data file
export const prepareDimotikesEnotites = async () => {
    await DimotikesEnotites.sync();
    await ensureColumns();
    const seeded = await seedDimotikesEnotites();
    await ensureProviderColumns();
    console.log(`Municipal units (Δημοτικές Ενότητες): ${await DimotikesEnotites.count()}` +
        (seeded ? " (table filled from data/dimotikes_enotites.json)" : ""));
    return seeded;
};
