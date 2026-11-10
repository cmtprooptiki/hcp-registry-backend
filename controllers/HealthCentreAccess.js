// GET /access/health-centres -> the road distance of every Health Centre (Κ.Υ.) to its nearest hospital, for the
// «Κ.Υ. – Νοσοκομεία» view: { meta: { generated_at, graph, providers, rules, stale }, rows: [...] }
// The distances come from data/health_centre_hospitals.json (scripts/access/compute_hc_hospitals.py); the names
// and ΥΠΕ of the units come from the database. stale = Health Centres or hospitals changed since the computation
// (added, removed, moved): run the script again. The exclusions (capitals of regional units, urban areas) are
// applied by the view, so they can be switched on and off.
import fs from "fs";
import HCProviders from "../models/HCProvidersModel.js";
import { readDataFile } from "../utils/dataVersions.js";
import { providersFingerprint } from "../utils/setupSettlementAccess.js";

export const HC_FILE = "health_centre_hospitals.json";
const TYPES = ["Health Centre", "Hospital"];
const fileUrl = new URL(`../data/${HC_FILE}`, import.meta.url);

let cache = { mtime: null, file: null };
const loadFile = () => {
    if (!fs.existsSync(fileUrl)) return null;
    const mtime = fs.statSync(fileUrl).mtimeMs;
    if (cache.mtime !== mtime) cache = { mtime, file: readDataFile(HC_FILE).records };
    return cache.file;
};

export const getHealthCentreAccess = async (req, res) => {
    try {
        const file = loadFile();
        if (!file) return res.status(200).json({ meta: null, rows: [] });
        const { records, ...header } = file;
        const [providers, fingerprint] = await Promise.all([
            HCProviders.findAll({ attributes: ["id", "Name_GR", "type_Of_Hcp", "ype", "lat", "lon"], where: { type_Of_Hcp: TYPES }, raw: true }),
            providersFingerprint(TYPES),
        ]);
        const byId = new Map(providers.map((p) => [p.id, p]));
        const unit = (id) => (id === null || id === undefined ? null : byId.get(id) || null);
        const rows = records
            .filter((r) => byId.has(r.id))   // a Health Centre removed since the computation
            .map((r) => {
                const p = byId.get(r.id);
                const h = unit(r.hospital);
                const air = unit(r.air_hospital);
                return {
                    ...r, name: p.Name_GR, ype: p.ype, lat: Number(p.lat), lon: Number(p.lon),
                    hospital_name: h ? h.Name_GR : null, hospital_ype: h ? h.ype : null,
                    air_hospital_name: air ? air.Name_GR : null,
                };
            });
        const known = new Set(records.map((r) => r.id));
        const missing = providers.filter((p) => p.type_Of_Hcp === "Health Centre" && !known.has(p.id)).map((p) => p.Name_GR);
        res.status(200).json({
            meta: {
                generated_at: header.generated_at, graph: header.graph, providers: header.providers, rules: header.rules,
                stale: header.providers_fingerprint ? header.providers_fingerprint !== fingerprint : null,
                missing,   // Health Centres added since the computation (not in the rows)
            },
            rows,
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
