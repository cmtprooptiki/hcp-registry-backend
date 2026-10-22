// At startup (see index.js): loads data/settlement_census.json (census 2021 figures of every settlement:
// aged 65+ / 75+, occupied and holiday dwellings, mountainousness of its community; made by
// scripts/census/build_census.py) into the SettlementCensus table, once per version of the file.
import fs from "fs";
import { DataTypes } from "sequelize";
import db from "../config/Database.js";
import SettlementCensus from "../models/SettlementCensusModel.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";

export const CENSUS_FILE = "settlement_census.json";
const FIELDS = ["pop2021", "age65", "age75", "dw_occupied", "dw_vacant", "dw_holiday", "mountain", "urban", "acc_osm"];

// columns added after the table was first created (db.sync() never adds columns to an existing table)
const ensureColumns = async () => {
    const qi = db.getQueryInterface();
    const table = SettlementCensus.getTableName();
    const columns = await qi.describeTable(table);
    if (!columns.acc_osm) await qi.addColumn(table, "acc_osm", { type: DataTypes.INTEGER, allowNull: true });
};

// Returns the number of settlements loaded (0 when the table was already up to date or there is no file)
export const setupSettlementCensus = async () => {
    if (!fs.existsSync(new URL(`../data/${CENSUS_FILE}`, import.meta.url))) return 0;
    await ensureColumns();
    const { records: file, version } = readDataFile(CENSUS_FILE);
    const records = file.records || [];
    if (await storedVersion(CENSUS_FILE) === version && await SettlementCensus.count() === records.length) return 0;
    const rows = records.map((r) => ({
        oikismos_id: r.id,
        ...Object.fromEntries(FIELDS.map((k) => [k, r[k] === undefined ? null : r[k]])),
    }));
    await db.transaction(async (transaction) => {
        await SettlementCensus.destroy({ where: {}, transaction });
        for (let i = 0; i < rows.length; i += 2000) {
            await SettlementCensus.bulkCreate(rows.slice(i, i + 2000), { transaction });
        }
        await saveVersion(CENSUS_FILE, version, transaction);
    });
    console.log(`Settlement census 2021 (data/${CENSUS_FILE}): ${rows.length} settlements`);
    return rows.length;
};
