// Settlement (Οικισμός) of a provider: the nearest settlement of its municipality (settlements
// are points, without boundaries). Settlements are read once from the Oikismoi table and kept
// in memory, grouped by municipality.
import Oikismoi from "../models/OikismoiModel.js";
import { dimosFields } from "./dimoiLookup.js";

let cache = null; // { dimos_code: [{ id, name, lat, lon }] }

// location_accuracy of regional clinics whose village wasn't identified: they sit at the seat of
// their municipality, so their settlement is unknown (none is set)
export const SEAT_ACCURACY = "Municipality seat (settlement not identified)";

const loadOikismoi = async () => {
    if (!cache) {
        const rows = await Oikismoi.findAll({ attributes: ["id", "name", "lat", "lon", "dimos_code"], raw: true });
        cache = {};
        for (const row of rows) {
            (cache[row.dimos_code] = cache[row.dimos_code] || []).push({
                id: row.id, name: row.name, lat: Number(row.lat), lon: Number(row.lon),
            });
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

// Nearest settlement of municipality dimos_code: { id, name, distanceKm }, or null
export const findOikismos = async (lat, lon, dimos_code) => {
    const y = Number(lat);
    const x = Number(lon);
    if (!dimos_code || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const settlements = (await loadOikismoi())[dimos_code] || [];
    let best = null;
    for (const s of settlements) {
        const d = distanceKm(y, x, s.lat, s.lon);
        if (!best || d < best.distanceKm) best = { id: s.id, name: s.name, distanceKm: d };
    }
    return best;
};

// Fields to store on a provider: { oikismos, oikismos_id }
export const oikismosFields = async (lat, lon, dimos_code) => {
    const found = await findOikismos(lat, lon, dimos_code);
    return { oikismos: found ? found.name : null, oikismos_id: found ? found.id : null };
};

// Municipality and settlement of a provider at lat/lon:
// { dimos, dimos_code, oikismos, oikismos_id }. withSettlement=false: settlement unknown (null).
export const placeFields = async (lat, lon, withSettlement = true) => {
    const dimos = await dimosFields(lat, lon);
    const settlement = withSettlement
        ? await oikismosFields(lat, lon, dimos.dimos_code)
        : { oikismos: null, oikismos_id: null };
    return { ...dimos, ...settlement };
};
