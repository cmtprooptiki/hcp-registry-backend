// Imports CSV files exported from pgAdmin 4 (Postgres) into the MySQL tables.
// Existing rows of each imported table are replaced; ids are kept as-is so
// the links between users, HCProviders, hcpusers and hcpInfo stay correct.
//
// Usage:
//   node scripts/import-csv.js users=users.csv HCProviders=hcproviders.csv hcpInfo=hcpInfo.csv
//   node scripts/import-csv.js --dry-run ...   (parse and check only, write nothing)

import fs from "fs";
import { DataTypes } from "sequelize";
import db from "../config/Database.js";
import Users from "../models/UserModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import hcpusers from "../models/hcpusersModel.js";
import hcpInfo from "../models/hcpInfoModel.js";

// Parents first, so foreign keys point at rows that already exist
const MODELS = { users: Users, HCProviders, hcpusers, hcpInfo };

// pgAdmin's CSV export: quote ", escape ' (so ' -> '' and " -> '" inside quotes),
// NULL is an empty unquoted field, an empty string is "".
const parseCsv = (text, { delimiter = ",", quote = '"', escape = "'" } = {}) => {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let i = 0;

    while (i < text.length) {
        let value = "";
        let quoted = false;

        if (text[i] === quote) {
            quoted = true;
            i++;
            while (true) {
                if (i >= text.length) throw new Error("Unterminated quoted field");
                const c = text[i];
                if (c === escape && (text[i + 1] === quote || text[i + 1] === escape)) {
                    value += text[i + 1];
                    i += 2;
                } else if (c === quote) {
                    i++;
                    break;
                } else {
                    value += c;
                    i++;
                }
            }
        } else {
            while (i < text.length && text[i] !== delimiter && text[i] !== "\n" && text[i] !== "\r") {
                value += text[i++];
            }
        }

        row.push(quoted || value !== "" ? value : null);

        if (text[i] === delimiter) {
            i++;
        } else {
            if (text[i] === "\r") i++;
            if (text[i] === "\n") i++;
            rows.push(row);
            row = [];
        }
    }
    return rows;
};

const NUMERIC_TYPES = [DataTypes.INTEGER, DataTypes.DECIMAL, DataTypes.FLOAT, DataTypes.DOUBLE];

const toRecords = (model, rows) => {
    const [header, ...data] = rows;
    const attributes = model.getAttributes();

    const unknown = header.filter(col => !attributes[col]);
    if (unknown.length) throw new Error(`Columns not in the ${model.name} model: ${unknown.join(", ")}`);

    return data.map((values, line) => {
        if (values.length !== header.length) {
            throw new Error(`Row ${line + 2} has ${values.length} fields, expected ${header.length}`);
        }
        const record = {};
        header.forEach((col, idx) => {
            let value = values[idx];
            const type = attributes[col].type;
            if (value !== null && type instanceof DataTypes.DATE) {
                // Postgres writes "2025-03-04 14:08:13.591+00"
                value = new Date(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
            } else if (value === "" && NUMERIC_TYPES.some(t => type instanceof t)) {
                value = null;
            }
            record[col] = value;
        });
        return record;
    });
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const jobs = args
    .filter(arg => arg !== "--dry-run")
    .map(arg => {
        const [table, file] = arg.split("=");
        if (!MODELS[table] || !file) throw new Error(`Bad argument "${arg}", expected <table>=<file.csv> with table one of: ${Object.keys(MODELS).join(", ")}`);
        return { table, file };
    })
    .sort((a, b) => Object.keys(MODELS).indexOf(a.table) - Object.keys(MODELS).indexOf(b.table));

if (jobs.length === 0) {
    console.log("Usage: node scripts/import-csv.js [--dry-run] users=users.csv HCProviders=hcproviders.csv hcpusers=hcpusers.csv hcpInfo=hcpInfo.csv");
    process.exit(1);
}

try {
    const prepared = jobs.map(({ table, file }) => {
        const model = MODELS[table];
        const records = toRecords(model, parseCsv(fs.readFileSync(file, "utf8")));
        console.log(`${table}: ${records.length} rows parsed from ${file}`);
        return { model, records };
    });

    if (dryRun) {
        console.log("Dry run, nothing written.");
    } else {
        await db.transaction(async (transaction) => {
            const qi = db.getQueryInterface();
            await db.query("SET FOREIGN_KEY_CHECKS = 0", { transaction });
            for (const { model, records } of prepared) {
                await qi.bulkDelete(model.getTableName(), null, { transaction });
                if (records.length) await qi.bulkInsert(model.getTableName(), records, { transaction });
                console.log(`${model.name}: ${records.length} rows imported`);
            }
            await db.query("SET FOREIGN_KEY_CHECKS = 1", { transaction });
        });
    }
} catch (error) {
    console.error("Import failed, nothing was changed:", error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
