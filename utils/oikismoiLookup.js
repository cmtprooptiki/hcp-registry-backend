// Settlement (Οικισμός) of a provider: the nearest settlement of its municipal unit (Δημοτική
// Ενότητα), or of its municipality when the unit has none (settlements are points, without
// boundaries); its community (Κοινότητα) is the community of that settlement. Settlements are read
// once from the Oikismoi table and kept in memory, grouped by municipal unit and by municipality.
import Oikismoi from "../models/OikismoiModel.js";
import Koinotites from "../models/KoinotitesModel.js";
import { dimosFields } from "./dimoiLookup.js";

// { byUnit: { de_code: [{ id, name, lat, lon, koinotita_code }] }, byDimos: { dimos_code: [...] },
//   koinotitaLabel: { code: "Δ.Κ. …" } }
let cache = null;

// location_accuracy of regional clinics whose village wasn't identified: they sit at the seat of
// their municipality, so their settlement is unknown (none is set)
export const SEAT_ACCURACY = "Municipality seat (settlement not identified)";

const loadOikismoi = async () => {
    if (!cache) {
        const rows = await Oikismoi.findAll({
            attributes: ["id", "name", "lat", "lon", "dimos_code", "de_code", "koinotita_code"], raw: true,
        });
        // label of each community; none for the "pseudo" ones (units without communities, e.g. Αθηναίων)
        const communities = await Koinotites.findAll({ attributes: ["code", "label", "kind"], raw: true });
        cache = {
            byUnit: {}, byDimos: {},
            koinotitaLabel: Object.fromEntries(communities.map((k) => [k.code, k.kind === "pseudo" ? null : k.label])),
        };
        const add = (group, key, item) => { if (key) (group[key] = group[key] || []).push(item); };
        for (const row of rows) {
            const item = { id: row.id, name: row.name, lat: Number(row.lat), lon: Number(row.lon), koinotita_code: row.koinotita_code };
            add(cache.byUnit, row.de_code, item);
            add(cache.byDimos, row.dimos_code, item);
        }
    }
    return cache;
};

export const clearOikismoiCache = () => {
    cache = null;
};

// Distance in km (equirectangular: plenty for a few km inside one municipality)
const distanceKm = (lat1, lon1, lat2, lon2) => {
    const kx = 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    return Math.hypot((lon1 - lon2) * kx, (lat1 - lat2) * 110.57);
};

// Nearest settlement of municipal unit de_code (or, if it has none, of municipality dimos_code):
// { id, name, koinotita_code, distanceKm }, or null
export const findOikismos = async (lat, lon, dimos_code, de_code = null) => {
    const y = Number(lat);
    const x = Number(lon);
    if ((!dimos_code && !de_code) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const { byUnit, byDimos } = await loadOikismoi();
    const settlements = (de_code && byUnit[de_code]) || byDimos[dimos_code] || [];
    let best = null;
    for (const s of settlements) {
        const d = distanceKm(y, x, s.lat, s.lon);
        if (!best || d < best.distanceKm) best = { id: s.id, name: s.name, koinotita_code: s.koinotita_code, distanceKm: d };
    }
    return best;
};

export const NO_SETTLEMENT = { oikismos: null, oikismos_id: null, koinotita: null, koinotita_code: null };

// Fields to store on a provider: { oikismos, oikismos_id, koinotita, koinotita_code }
export const oikismosFields = async (lat, lon, dimos_code, de_code = null) => {
    const found = await findOikismos(lat, lon, dimos_code, de_code);
    if (!found) return NO_SETTLEMENT;
    const code = found.koinotita_code || null;
    return {
        oikismos: found.name, oikismos_id: found.id,
        koinotita: code ? (cache.koinotitaLabel[code] || null) : null, koinotita_code: code,
    };
};

// Municipality, municipal unit, settlement and community of a provider at lat/lon:
// { dimos, dimos_code, dimotiki_enotita, de_code, oikismos, oikismos_id, koinotita, koinotita_code }.
// withSettlement=false: settlement (so community) unknown (null).
export const placeFields = async (lat, lon, withSettlement = true) => {
    const dimos = await dimosFields(lat, lon);
    const settlement = withSettlement
        ? await oikismosFields(lat, lon, dimos.dimos_code, dimos.de_code)
        : NO_SETTLEMENT;
    return { ...dimos, ...settlement };
};
