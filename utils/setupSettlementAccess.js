// At startup (see index.js), after the providers are final: loads data/settlement_access.json (the road
// distance of every settlement to the nearest health structure, made by scripts/access/compute_access.py)
// into the SettlementAccess table, once per version of the file. The file's header (date, road network,
// providers it was computed with) is kept in memory for GET /access/settlements.
import fs from "fs";
import crypto from "crypto";
import db from "../config/Database.js";
import SettlementAccess from "../models/SettlementAccessModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";

export const ACCESS_FILE = "settlement_access.json";
let meta = null;

export const accessMeta = () => meta;

// Fingerprint of the providers' ids, types and positions; compute_access.py writes the same one for the
// providers it used, so a difference means that the distances must be recomputed.
export const providersFingerprint = async () => {
    const rows = await HCProviders.findAll({ attributes: ["id", "type_Of_Hcp", "lat", "lon"], order: [["id", "ASC"]], raw: true });
    const lines = rows
        .filter((r) => r.lat !== null && r.lon !== null)
        .map((r) => `${r.id}|${r.type_Of_Hcp}|${Number(r.lat).toFixed(5)}|${Number(r.lon).toFixed(5)}`);
    return crypto.createHash("sha1").update(lines.join("\n"), "utf8").digest("hex");
};

const num = (v) => (v === null || v === undefined ? null : v);

// Returns the number of settlements loaded (0 when the table was already up to date or there is no file)
export const setupSettlementAccess = async () => {
    if (!fs.existsSync(new URL(`../data/${ACCESS_FILE}`, import.meta.url))) {
        console.log(`Settlement access: no data/${ACCESS_FILE} yet (see scripts/access/README.md)`);
        return 0;
    }
    const { records: file, version } = readDataFile(ACCESS_FILE);
    const { records, ...header } = file;
    meta = header;
    if (await storedVersion(ACCESS_FILE) === version && await SettlementAccess.count() === records.length) return 0;
    const rows = records.map((r) => ({
        oikismos_id: r.id, road_km: num(r.road_km), road_min: num(r.road_min), nearest_id: num(r.nearest),
        straight_km: num(r.straight_km), pi_road_km: num(r.pi_road_km), pi_road_min: num(r.pi_road_min),
        pi_nearest_id: num(r.pi_nearest), snap_km: num(r.snap_km), bridged: !!r.bridged,
    }));
    await db.transaction(async (transaction) => {
        await SettlementAccess.destroy({ where: {}, transaction });
        for (let i = 0; i < rows.length; i += 2000) {
            await SettlementAccess.bulkCreate(rows.slice(i, i + 2000), { transaction });
        }
        await saveVersion(ACCESS_FILE, version, transaction);
    });
    const unreachable = rows.filter((r) => r.road_km === null).length;
    console.log(`Settlement access (data/${ACCESS_FILE}, ${header.generated_at}): ${rows.length} settlements, ${unreachable} without road connection`);
    return rows.length;
};
