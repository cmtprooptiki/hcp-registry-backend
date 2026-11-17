// GET /access/program-units -> the eligible (remote) settlements of the programme, each assigned to ONE Health
// Centre / Multipurpose Regional Clinic / hospital-Health Centre, with their residents aged 50+:
// { meta: { generated_at, graph, criteria, groups, source_ages, stale }, units: { id: {...} }, dimos_names,
//   dimos_pe, records: [...] }
// From data/program_units.json (scripts/access/compute_program_units.py); names, types and ΥΠΕ of the units from
// the database. The assignment is an estimate (nearest unit by road; in a straight line when no road reaches one).
import fs from "fs";
import HCProviders from "../models/HCProvidersModel.js";
import { readDataFile } from "../utils/dataVersions.js";
import { providersFingerprint } from "../utils/setupSettlementAccess.js";

const FILE = "program_units.json";
const fileUrl = new URL(`../data/${FILE}`, import.meta.url);
let cache = { mtime: null, file: null };

export const getProgramUnits = async (req, res) => {
    try {
        if (!fs.existsSync(fileUrl)) return res.status(200).json({ meta: null, units: {}, records: [] });
        const mtime = fs.statSync(fileUrl).mtimeMs;
        if (cache.mtime !== mtime) cache = { mtime, file: readDataFile(FILE).records };
        const { records, units, dimos_names, dimos_pe, providers_fingerprint, ...header } = cache.file;
        const ids = Object.keys(units).map(Number);
        const [providers, fingerprint] = await Promise.all([
            HCProviders.findAll({ attributes: ["id", "Name_GR", "type_Of_Hcp", "ype", "lat", "lon"], where: { id: ids }, raw: true }),
            providersFingerprint(),
        ]);
        const byId = new Map(providers.map((p) => [p.id, p]));
        const out = {};
        Object.entries(units).forEach(([id, u]) => {
            const p = byId.get(Number(id));
            out[id] = { ...u, name: p ? p.Name_GR : `#${id}`, type: p ? p.type_Of_Hcp : null, ype: p ? p.ype : null,
                        lat: p ? Number(p.lat) : null, lon: p ? Number(p.lon) : null, missing: !p };
        });
        res.status(200).json({
            meta: { ...header, stale: providers_fingerprint ? providers_fingerprint !== fingerprint : null },
            units: out, dimos_names, dimos_pe, records,
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
