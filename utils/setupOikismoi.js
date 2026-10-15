// At startup (see index.js), after the municipal units and before setupIatreia():
//   1. fills the Oikismoi (settlements) table from data/oikismoi.json, when it is incomplete or the
//      file changed (versions in the DataVersions table); settlements no longer in the file are removed
//   2. adds the Oikismoi column de_code and the HCProviders columns oikismos / oikismos_id to
//      existing databases (db.sync() creates new tables but never adds columns to existing ones)
// The settlement of each provider is set by utils/setupPlaces.js.
//
// data/oikismoi.json comes from the user's file Oikismoi-Greece.geojson (ΕΛΣΤΑΤ, 13,548
// settlements). Positions are converted from the file's EPSG:2100 points with the ΕΓΣΑ87 datum
// shift; municipal unit and municipality come from the ΕΛΣΤΑΤ code of each settlement (see README).
import { DataTypes, Op } from "sequelize";
import db from "../config/Database.js";
import Oikismoi from "../models/OikismoiModel.js";
import DimotikesEnotites from "../models/DimotikesEnotitesModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import { clearOikismoiCache } from "./oikismoiLookup.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";

const FIELDS = ["code", "name", "official_name", "koinotita", "lat", "lon", "dimos_code", "de_code"];

const seedOikismoi = async () => {
    const { records, version } = readDataFile("oikismoi.json");
    if (await Oikismoi.count() === records.length && await storedVersion("oikismoi.json") === version) {
        return false;
    }
    await db.transaction(async (transaction) => {
        for (let i = 0; i < records.length; i += 1000) {
            await Oikismoi.bulkCreate(records.slice(i, i + 1000), { updateOnDuplicate: FIELDS, transaction });
        }
        await Oikismoi.destroy({ where: { id: { [Op.notIn]: records.map((r) => r.id) } }, transaction });
        await saveVersion("oikismoi.json", version, transaction);
    });
    clearOikismoiCache();
    return true;
};

// Oikismoi.de_code, for databases where the table was created before it existed
const ensureOikismoiColumns = async () => {
    const qi = db.getQueryInterface();
    const table = Oikismoi.getTableName();
    const columns = await qi.describeTable(table);
    if (!columns.de_code) {
        await qi.addColumn(table, "de_code", {
            type: DataTypes.STRING(6),
            allowNull: true,
            references: { model: DimotikesEnotites.getTableName(), key: "code" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });
    }
    const indexes = await qi.showIndex(table);
    if (!indexes.some((index) => index.fields.some((field) => field.attribute === "de_code"))) {
        await qi.addIndex(table, ["de_code"]);
    }
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

// Returns true when the table was (re)loaded from the data file
export const prepareOikismoiTables = async () => {
    await Oikismoi.sync();
    await ensureOikismoiColumns();
    const seeded = await seedOikismoi();
    await ensureProviderColumns();
    console.log(`Settlements: ${await Oikismoi.count()}` + (seeded ? " (table filled from data/oikismoi.json)" : ""));
    return seeded;
};
