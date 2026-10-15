// Remembers which version of each data/*.json file is in the database (table DataVersions).
// A seed step loads its file again only when the file changed since the last load, e.g. after
// new boundaries or coordinates were committed, even when the number of records is the same.
import fs from "fs";
import crypto from "crypto";
import DataVersions from "../models/DataVersionsModel.js";

const dataUrl = (file) => new URL(`../data/${file}`, import.meta.url);

// Read data/<file>: { records, version } (version = SHA-1 of the file)
export const readDataFile = (file) => {
    const text = fs.readFileSync(dataUrl(file));
    return {
        records: JSON.parse(text.toString("utf8")),
        version: crypto.createHash("sha1").update(text).digest("hex"),
    };
};

let synced = false;
const ensureTable = async () => {
    if (!synced) {
        await DataVersions.sync();
        synced = true;
    }
};

export const storedVersion = async (name) => {
    await ensureTable();
    const row = await DataVersions.findByPk(name, { raw: true });
    return row ? row.version : null;
};

export const saveVersion = async (name, version, transaction) => {
    await ensureTable();
    await DataVersions.upsert({ name, version }, { transaction });
};
