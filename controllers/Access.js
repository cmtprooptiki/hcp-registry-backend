import Oikismoi from "../models/OikismoiModel.js";
import SettlementAccess from "../models/SettlementAccessModel.js";
import SettlementCensus from "../models/SettlementCensusModel.js";
import { accessMeta, providersFingerprint } from "../utils/setupSettlementAccess.js";

// Columns of GET /access/settlements (rows are arrays in this order, to keep ~13.500 rows small)
const COLUMNS = ["id", "name", "lat", "lon", "dimos_code", "de_code", "koinotita_code", "population",
    "road_km", "road_min", "nearest_id", "pi_road_km", "pi_road_min", "pi_nearest_id", "bridged",
    // census 2021 (SettlementCensus): aged 65+ / 75+, occupied / holiday dwellings, community Π / Η / Ο
    "age65", "age75", "dw_occupied", "dw_holiday", "mountain",
    // OpenStreetMap: tourist accommodation establishments within 3 km (extra information)
    "acc_osm"];
const n = (v) => (v === null || v === undefined ? null : Number(v));

// GET /access/settlements -> every settlement of Greece with its road distance to the nearest health structure:
// { meta: { generated_at, graph, providers, stale }, columns, rows }
// stale = the providers changed since the distances were computed (run scripts/access again).
// The thresholds (14 km, population < 10.000) are applied by the map, so they can be changed there.
export const getSettlementAccess = async (req, res) => {
    try {
        const meta = accessMeta();
        if (!meta) return res.status(200).json({ meta: null, columns: COLUMNS, rows: [] });
        const [settlements, access, census, fingerprint] = await Promise.all([
            Oikismoi.findAll({
                attributes: ["id", "name", "lat", "lon", "dimos_code", "de_code", "koinotita_code", "population"],
                raw: true,
            }),
            SettlementAccess.findAll({ raw: true }),
            SettlementCensus.findAll({ raw: true }),
            providersFingerprint(),
        ]);
        const byId = new Map(access.map((a) => [a.oikismos_id, a]));
        const censusById = new Map(census.map((c) => [c.oikismos_id, c]));
        const rows = settlements.map((s) => {
            const a = byId.get(s.id) || {};
            const c = censusById.get(s.id) || {};
            return [s.id, s.name, Number(s.lat), Number(s.lon), s.dimos_code, s.de_code, s.koinotita_code, s.population,
                n(a.road_km), n(a.road_min), a.nearest_id ?? null, n(a.pi_road_km), n(a.pi_road_min), a.pi_nearest_id ?? null,
                a.bridged ? 1 : 0,
                c.age65 ?? null, c.age75 ?? null, c.dw_occupied ?? null, c.dw_holiday ?? null, c.mountain ?? null,
                c.acc_osm ?? null];
        });
        res.status(200).json({
            meta: {
                generated_at: meta.generated_at,
                graph: meta.graph,
                providers: meta.providers,
                stale: meta.providers_fingerprint ? meta.providers_fingerprint !== fingerprint : null,
            },
            columns: COLUMNS,
            rows,
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
