// Runs at startup after setupIatreia() and before setupProviderCoords() (see index.js), once per
// version of data/provider_edits.json: renames of original providers, providers to add (e.g. the
// Health Centres missing from the original list), fields to set (update, e.g. exact coordinates;
// a regional clinic of data/iatreia.json is named by its source_id, since that file is imported only once)
// and providers to remove (remove, e.g. parts of a hospital that the official list does not count as
// hospitals of their own). Idempotent: a rename whose provider already has the new name, an addition
// whose name already exists or a removal whose provider is already gone is skipped, so editing the file
// and restarting applies only what is new. The place of an added provider (municipality, unit,
// settlement, community) is filled by setupPlaces(), which runs last.
import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";
import hcpusers from "../models/hcpusersModel.js";
import ProviderCoordinateFixes from "../models/ProviderCoordinateFixesModel.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";
import { normName } from "./setupProviderCoords.js";

export const EDITS_FILE = "provider_edits.json";
const UPDATE_FIELDS = ["Name_EN", "lat", "lon", "location_accuracy", "address", "post_Code", "email_Contact",
    "general_Email_Contact", "website"];
const PLACE_RESET = { dimos: null, dimos_code: null, dimotiki_enotita: null, de_code: null, oikismos: null,
    oikismos_id: null, koinotita: null, koinotita_code: null };
const ADD_FIELDS = ["ype", "Q4ALL_code", "type_Of_Hcp", "Name_GR", "Name_EN", "category_As_Per_HealthAtlas",
    "category_As_Per_Sha_2011_Elstat", "lat", "lon", "address", "post_Code", "email_Contact", "general_Email_Contact",
    "website", "Idika_Ehr", "Odipy_Inidcator_Collection", "Drg_Mature_Usage", "HEALTH_Center_In_The_Network",
    "location_accuracy"];

// Models that point to a provider by its id. A provider still linked to a user account is not removed
// (the account must be moved to another provider first); its coordinate fixes are removed with it.
// Returns { renamed, added, updated, removed, skipped: [text] }
export const applyProviderEdits = async ({ transaction } = {}) => {
    const { records } = readDataFile(EDITS_FILE);
    const providers = await HCProviders.findAll({
        attributes: ["id", "Name_GR", "Q4ALL_code"],
        where: { source_id: null },   // the original providers, not the regional clinics
        raw: true, transaction,
    });
    const byName = new Map();
    providers.forEach((p) => {
        const key = normName(p.Name_GR);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(p);
    });
    let renamed = 0, added = 0;
    const skipped = [];

    for (const r of records.rename || []) {
        const found = byName.get(normName(r.from)) || [];
        if (found.length === 0) {
            if (!byName.has(normName(r.to))) skipped.push(`rename: "${r.from}" not found`);
            continue;
        }
        const fields = { Name_GR: r.to, ...(r.Name_EN ? { Name_EN: r.Name_EN } : {}) };
        await HCProviders.update(fields, { where: { id: found.map((p) => p.id) }, transaction });
        byName.delete(normName(r.from));
        byName.set(normName(r.to), found);
        renamed += found.length;
    }

    // Removals first, so that a removed provider's Q4ALL code can be reused by an addition.
    let removed = 0;
    for (const r of records.remove || []) {
        const found = byName.get(normName(r.Name_GR)) || [];
        if (found.length === 0) continue;   // already removed
        const ids = found.map((p) => p.id);
        const linked = await hcpusers.count({ where: { hcp_id: ids }, transaction });
        if (linked > 0) {
            skipped.push(`remove: "${r.Name_GR}" is linked to ${linked} user account(s)`);
            continue;
        }
        await ProviderCoordinateFixes.destroy({ where: { provider_id: ids }, transaction });
        await HCProviders.destroy({ where: { id: ids }, transaction });
        byName.delete(normName(r.Name_GR));
        found.forEach((p) => { const i = providers.indexOf(p); if (i >= 0) providers.splice(i, 1); });
        removed += found.length;
    }

    for (const a of records.add || []) {
        if (byName.has(normName(a.Name_GR))) continue;   // already there
        if (a.Q4ALL_code && providers.some((p) => p.Q4ALL_code === a.Q4ALL_code)) {
            skipped.push(`add: "${a.Name_GR}", Q4ALL_code ${a.Q4ALL_code} is already used`);
            continue;
        }
        const row = Object.fromEntries(ADD_FIELDS.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));
        const created = await HCProviders.create(row, { transaction });
        byName.set(normName(a.Name_GR), [{ id: created.id, Name_GR: a.Name_GR, Q4ALL_code: a.Q4ALL_code }]);
        added += 1;
    }
    // Fields set on existing providers (e.g. a more exact position). New coordinates clear the place
    // fields, so setupPlaces() finds the municipality, unit, settlement and community again.
    let updated = 0;
    for (const u of records.update || []) {
        // regional clinics (ΠΙ / ΠΠΙ) by their source_id, the original providers by their name
        const found = u.source_id
            ? await HCProviders.findAll({ attributes: ["id"], where: { source_id: u.source_id }, raw: true, transaction })
            : byName.get(normName(u.Name_GR)) || [];
        if (found.length === 0) { skipped.push(`update: "${u.source_id || u.Name_GR}" not found`); continue; }
        const fields = Object.fromEntries(UPDATE_FIELDS.filter((k) => k in u).map((k) => [k, u[k]]));
        if ("lat" in fields || "lon" in fields) Object.assign(fields, PLACE_RESET);
        await HCProviders.update(fields, { where: { id: found.map((p) => p.id) }, transaction });
        updated += found.length;
    }
    return { renamed, added, updated, removed, skipped };
};

// Returns the number of providers added (their place is then filled by setupPlaces)
export const setupProviderEdits = async () => {
    const { version } = readDataFile(EDITS_FILE);
    if (await storedVersion(EDITS_FILE) === version) return 0;
    let result;
    await db.transaction(async (transaction) => {
        result = await applyProviderEdits({ transaction });
        await saveVersion(EDITS_FILE, version, transaction);
    });
    console.log(`Provider edits (data/${EDITS_FILE}): ${result.renamed} renamed, ${result.added} added, ` +
        `${result.updated} updated, ${result.removed} removed` +
        (result.skipped.length ? `; skipped: ${result.skipped.join("; ")}` : ""));
    return result.added;
};
