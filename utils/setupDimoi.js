// Runs once at startup, after db.sync() (see index.js), before the municipal units:
//  1. fills the Perifereies (regions), PerifereiakesEnotites (regional units) and Dimoi
//     (municipalities) tables from data/*.json and links them: region -> regional units ->
//     municipalities. A table is loaded again when it is incomplete or its data file changed
//     (versions in the DataVersions table, see utils/dataVersions.js).
//  2. adds missing columns to existing tables (db.sync() creates new tables but never
//     adds columns to existing ones): Dimoi.perifereia_id / pe_code, HCProviders.dimos / dimos_code
//
// The municipality of each provider is set by utils/setupPlaces.js (from the municipal units).
import { DataTypes } from "sequelize";
import db from "../config/Database.js";
import Perifereies from "../models/PerifereiesModel.js";
import PerifereiakesEnotites from "../models/PerifereiakesEnotitesModel.js";
import Dimoi from "../models/DimoiModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import { clearDimoiCache } from "./dimoiLookup.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";

// Extra municipality fields in data/dimoi.json (flags and ΠΦΥ structure counts)
const DIMOS_DETAILS = ["nisiotikos", "mikros_nisiotikos", "oreinos", "pfy_ky", "pfy_pi", "pfy_ppi"];
const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key] ?? null]));

const seedPerifereies = async () => {
    const { records, version } = readDataFile("perifereies.json");
    if (await Perifereies.count() === records.length && await storedVersion("perifereies.json") === version) {
        return false;
    }
    await Perifereies.bulkCreate(
        records.map(({ id, name, geometry }) => ({ id, name, geometry: JSON.stringify(geometry) })),
        { updateOnDuplicate: ["name", "geometry"] }
    );
    await saveVersion("perifereies.json", version);
    return true;
};

const seedPerifereiakesEnotites = async () => {
    const { records, version } = readDataFile("perifereiakes_enotites.json");
    if (await PerifereiakesEnotites.count() === records.length &&
        await storedVersion("perifereiakes_enotites.json") === version) {
        return false;
    }
    await PerifereiakesEnotites.bulkCreate(
        records.map(({ code, name, perifereia_id, geometry }) => ({
            code, name, perifereia_id, geometry: JSON.stringify(geometry),
        })),
        { updateOnDuplicate: ["name", "perifereia_id", "geometry"] }
    );
    await saveVersion("perifereiakes_enotites.json", version);
    return true;
};

const seedDimoi = async () => {
    const { records, version } = readDataFile("dimoi.json");
    const count = await Dimoi.count();
    const withoutRegion = await Dimoi.count({ where: { perifereia_id: null } });
    const withoutUnit = await Dimoi.count({ where: { pe_code: null } });
    const expectedWithoutUnit = records.filter((r) => !r.pe_code).length; // Mount Athos
    const withoutDetails = await Dimoi.count({ where: { pfy_pi: null } });
    if (count === records.length && withoutRegion === 0 && withoutUnit === expectedWithoutUnit &&
        withoutDetails === 0 && await storedVersion("dimoi.json") === version) {
        return false;
    }

    // municipality -> region (by the region name in dimoi.json) and regional unit (pe_code)
    const regions = await Perifereies.findAll({ attributes: ["id", "name"], raw: true });
    const regionId = Object.fromEntries(regions.map((r) => [r.name, r.id]));
    const units = await PerifereiakesEnotites.findAll({ attributes: ["code", "perifereia_id"], raw: true });
    const unitRegion = Object.fromEntries(units.map((u) => [u.code, u.perifereia_id]));

    await Dimoi.bulkCreate(
        records.map(({ code, name, perifereia, pe_code, population, geometry, ...details }) => {
            const perifereia_id = regionId[perifereia];
            if (!perifereia_id) throw new Error(`Municipality ${code} ${name}: unknown region "${perifereia}"`);
            if (pe_code && unitRegion[pe_code] !== perifereia_id) {
                throw new Error(`Municipality ${code} ${name}: regional unit ${pe_code} is not in region "${perifereia}"`);
            }
            return {
                code, name, perifereia, perifereia_id, pe_code: pe_code || null,
                population, geometry: JSON.stringify(geometry),
                ...pick(details, DIMOS_DETAILS),
            };
        }),
        { updateOnDuplicate: ["name", "perifereia", "perifereia_id", "pe_code", "population", "geometry", ...DIMOS_DETAILS] }
    );
    await saveVersion("dimoi.json", version);
    clearDimoiCache();
    return true;
};

// Dimoi.perifereia_id / pe_code and the detail columns, for databases where the Dimoi table
// was created before they existed
const ensureDimoiColumns = async () => {
    const qi = db.getQueryInterface();
    const table = Dimoi.getTableName();
    const columns = await qi.describeTable(table);
    const attributes = Dimoi.getAttributes();
    for (const name of DIMOS_DETAILS) {
        if (!columns[name]) await qi.addColumn(table, name, { type: attributes[name].type, allowNull: true });
    }
    if (!columns.perifereia_id) {
        await qi.addColumn(table, "perifereia_id", {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: Perifereies.getTableName(), key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });
    }
    if (!columns.pe_code) {
        await qi.addColumn(table, "pe_code", {
            type: DataTypes.STRING(2),
            allowNull: true,
            references: { model: PerifereiakesEnotites.getTableName(), key: "code" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });
    }
};

const ensureProviderColumns = async () => {
    const qi = db.getQueryInterface();
    const table = HCProviders.getTableName();
    const columns = await qi.describeTable(table);

    if (!columns.dimos) {
        await qi.addColumn(table, "dimos", { type: DataTypes.STRING(150), allowNull: true });
    }
    if (!columns.dimos_code) {
        await qi.addColumn(table, "dimos_code", { type: DataTypes.STRING(4), allowNull: true });
    }

    // Index for filtering by municipality (not declared in the model: on an existing
    // table db.sync() would try to create it before the column exists)
    const indexes = await qi.showIndex(table);
    if (!indexes.some((index) => index.fields.some((field) => field.attribute === "dimos_code"))) {
        await qi.addIndex(table, ["dimos_code"]);
    }
};

// Regions, regional units and municipalities filled and linked, provider columns in place.
// Returns true when a table was (re)loaded from its data file.
export const prepareDimoiTables = async () => {
    await Perifereies.sync();
    await PerifereiakesEnotites.sync();
    await Dimoi.sync();
    await ensureDimoiColumns();
    // parents first: municipalities link to regional units, regional units to regions
    const seededRegions = await seedPerifereies();
    const seededUnits = await seedPerifereiakesEnotites();
    const seededDimoi = await seedDimoi();
    await ensureProviderColumns();
    return seededRegions || seededUnits || seededDimoi;
};

export const setupDimoi = async () => {
    const seeded = await prepareDimoiTables();
    console.log(
        `Regions: ${await Perifereies.count()}, regional units: ${await PerifereiakesEnotites.count()}, ` +
        `municipalities: ${await Dimoi.count()} loaded` +
        (seeded ? " (tables filled from data/*.json)" : "")
    );
    return seeded;
};
