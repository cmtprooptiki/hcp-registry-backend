// Runs once at startup, after the municipal units and before the settlements (see index.js):
//  1. fills the Koinotites (communities) table from data/koinotites.json, when it is incomplete or
//     the file changed (versions in the DataVersions table); communities no longer in the file are removed
//  2. adds the HCProviders columns koinotita / koinotita_code to existing databases
//     (db.sync() creates new tables but never adds columns to existing ones)
// The community of each provider (the one of its settlement) is set by utils/setupPlaces.js.
//
// data/koinotites.json: the 6,139 communities of the 2021 census (codes, names, population, from
// MON_PLI_DHM_OIKISN_2021.xlsx) with the boundaries of the user's file
// dimotikes_topikes_koinotites.geojson (ΕΛΣΤΑΤ 2011, EPSG:2100), converted to WGS84 with the ΕΓΣΑ87
// datum shift; the municipal units, municipalities, regional units and regions are their union (see README).
import { DataTypes, Op } from "sequelize";
import db from "../config/Database.js";
import Koinotites from "../models/KoinotitesModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import { clearOikismoiCache } from "./oikismoiLookup.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";

const FIELDS = ["name", "label", "official_name", "kind", "de_code", "dimos_code", "population", "in_census",
    "approximate", "code_2011", "area_km2", "geometry"];

const seedKoinotites = async () => {
    const { records, version } = readDataFile("koinotites.json");
    if (await Koinotites.count() === records.length && await storedVersion("koinotites.json") === version) {
        return false;
    }
    const rows = records.map((r) => ({ ...r, geometry: JSON.stringify(r.geometry) }));
    await db.transaction(async (transaction) => {
        for (let i = 0; i < rows.length; i += 200) {
            await Koinotites.bulkCreate(rows.slice(i, i + 200), { updateOnDuplicate: FIELDS, transaction });
        }
        await Koinotites.destroy({ where: { code: { [Op.notIn]: rows.map((r) => r.code) } }, transaction });
        await saveVersion("koinotites.json", version, transaction);
    });
    clearOikismoiCache();
    return true;
};

const ensureProviderColumns = async () => {
    const qi = db.getQueryInterface();
    const table = HCProviders.getTableName();
    const columns = await qi.describeTable(table);
    if (!columns.koinotita) {
        await qi.addColumn(table, "koinotita", { type: DataTypes.STRING(250), allowNull: true });
    }
    if (!columns.koinotita_code) {
        await qi.addColumn(table, "koinotita_code", { type: DataTypes.STRING(8), allowNull: true });
    }
    // Index for filtering by community (not in the model, see setupDimoi.js)
    const indexes = await qi.showIndex(table);
    if (!indexes.some((index) => index.fields.some((field) => field.attribute === "koinotita_code"))) {
        await qi.addIndex(table, ["koinotita_code"]);
    }
};

// Returns true when the table was (re)loaded from the data file
export const prepareKoinotites = async () => {
    await Koinotites.sync();
    const seeded = await seedKoinotites();
    await ensureProviderColumns();
    console.log(`Communities (Κοινότητες): ${await Koinotites.count()}` +
        (seeded ? " (table filled from data/koinotites.json)" : ""));
    return seeded;
};
