// Runs at startup after setupIatreia() (see index.js), once per version of data/provider_places.json.
//
// The original providers (hospitals, Health Centres, TOMY) have geocoded coordinates, and some were
// far from the place in their name (e.g. Κ.Υ. ΣΠΗΛΙΟΥ in Αγκουσελιανά, 9.5 km from Σπήλι). The data
// file gives, for every provider NAME (Name_GR), the settlement its name / address points to and when
// a position counts as consistent with it. Each provider of the database is found by its name and its
// CURRENT position is checked:
//   kept   — it is in that settlement, or in a settlement also named in its name / address, or within
//            the tolerance for the settlement's size (1 km for a village … 8 km for Athens), a hospital
//            inside its municipality, a provider of a town > 20,000 inside the town's municipal unit,
//            or inside the area its address names when its name matches a place elsewhere (Καμίνια);
//   moved  — otherwise, to the settlement's ΕΛΣΤΑΤ point (village or town centre, not the building),
//            with location_accuracy "Settlement centre / Town centre (corrected from the name)";
//   review — the name matches several places: not moved, listed by scripts/provider-coords.js.
// Every move is logged in ProviderCoordinateFixes (old and new position): `node
// scripts/provider-coords.js` lists the result on the current database, `--revert` undoes the moves.
import { Op } from "sequelize";
import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";
import ProviderCoordinateFixes from "../models/ProviderCoordinateFixesModel.js";
import { readDataFile, storedVersion, saveVersion } from "./dataVersions.js";
import { dimosFields } from "./dimoiLookup.js";
import { oikismosFields } from "./oikismoiLookup.js";

export const PLACES_FILE = "provider_places.json";
const TOLERANCE = 0.00002; // degrees (~2 m), to recognise a position

// Names compared without accents, case, punctuation and extra spaces
export const normName = (name) => String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^0-9A-ZΑ-Ω]+/g, " ").trim();

export const distanceKm = ([lat1, lon1], [lat2, lon2]) => {
    const r = (d) => (d * Math.PI) / 180;
    const h = Math.sin(r(lat2 - lat1) / 2) ** 2 +
        Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export const readRules = () => {
    const { records, version } = readDataFile(PLACES_FILE);
    const byName = new Map(records.providers.map((r) => [normName(r.Name_GR), r]));
    return { byName, firstVersionMoves: records.first_version_moves || [], version };
};

// Municipality, unit and settlement at a position (the same lookups that place every provider)
const placeAt = async (lat, lon) => {
    const area = await dimosFields(lat, lon);
    const settlement = area.dimos_code ? await oikismosFields(lat, lon, area.dimos_code, area.de_code) : {};
    return { ...area, oikismos: settlement.oikismos || null, oikismos_id: settlement.oikismos_id ?? null };
};

const keep = (why, km) => ({ action: "keep", why, km });

// The decision for one provider at (lat, lon) with its place
export const decide = (rule, place, lat, lon) => {
    if (!rule.settlement_id) return keep("no settlement found from the name / address", null);
    const km = distanceKm([lat, lon], [rule.lat, rule.lon]);
    if (place.oikismos_id === rule.settlement_id) return keep("in the settlement of its name", km);
    if (rule.ok_settlements.includes(place.oikismos_id)) return keep("its settlement is named in its name / address", km);
    if (rule.ok_units.includes(place.de_code) || rule.ok_dimoi.includes(place.dimos_code)) {
        return keep("inside the area its address names", km);
    }
    if (km <= rule.tolerance_km) return keep(`within ${rule.tolerance_km} km of the settlement of its name`, km);
    if (rule.rule === "municipality" && place.dimos_code === rule.dimos_code) return keep("hospital inside its municipality", km);
    if (rule.rule === "unit" && place.de_code === rule.de_code) return keep("inside the municipal unit of its town", km);
    if (rule.confidence === "high" || rule.confidence === "medium") return { action: "move", why: "far from the settlement of its name", km };
    return { action: "review", why: `the name matches more than one place (${rule.confidence})`, km };
};

// Every original provider of the database with its rule, place and decision.
// Returns [{ provider, rule, place, decision }] (rule null: name not in the data file)
export const evaluateProviders = async ({ transaction } = {}) => {
    const { byName } = readRules();
    const providers = await HCProviders.findAll({
        attributes: ["id", "Name_GR", "type_Of_Hcp", "address", "lat", "lon", "location_accuracy"],
        where: { source_id: null },   // not the regional clinics
        order: [["Name_GR", "ASC"], ["id", "ASC"]],
        raw: true, transaction,
    });
    const out = [];
    for (const provider of providers) {
        const rule = byName.get(normName(provider.Name_GR)) || null;
        const lat = Number(provider.lat), lon = Number(provider.lon);
        const place = await placeAt(lat, lon);
        const decision = rule ? decide(rule, place, lat, lon) : { action: "keep", why: "name not in data/provider_places.json", km: null };
        out.push({ provider, rule, place, decision });
    }
    return out;
};

// Positions moved by the first version of this step (matched by Q4ALL_code, before the log table)
const logFirstVersionMoves = async (firstVersionMoves, transaction) => {
    let logged = 0;
    for (const m of firstVersionMoves) {
        const [lat, lon] = m.to;
        const rows = await HCProviders.findAll({
            attributes: ["id", "Name_GR", "lat", "lon"],
            where: {
                source_id: null,
                location_accuracy: { [Op.like]: "%(corrected from the name)" },
                lat: { [Op.between]: [lat - TOLERANCE, lat + TOLERANCE] },
                lon: { [Op.between]: [lon - TOLERANCE, lon + TOLERANCE] },
            },
            raw: true, transaction,
        });
        for (const p of rows.filter((row) => normName(row.Name_GR) === normName(m.Name_GR))) {
            if (await ProviderCoordinateFixes.count({ where: { provider_id: p.id }, transaction })) continue;
            await ProviderCoordinateFixes.create({
                provider_id: p.id, Name_GR: p.Name_GR, from_lat: m.from[0], from_lon: m.from[1], to_lat: lat, to_lon: lon,
                was_at: "first version", previous_accuracy: null,
            }, { transaction });
            logged += 1;
        }
    }
    return logged;
};

// Moves the providers whose decision is "move". Returns { moved: [...], review: [...], unknown: n }
export const applyCoordinateFixes = async ({ transaction } = {}) => {
    const { firstVersionMoves } = readRules();
    await logFirstVersionMoves(firstVersionMoves, transaction);
    const results = await evaluateProviders({ transaction });
    const moved = [], review = [];
    for (const r of results) {
        if (r.decision.action === "review") review.push(r);
        if (r.decision.action !== "move") continue;
        const { provider: p, rule, place } = r;
        await ProviderCoordinateFixes.create({
            provider_id: p.id, Name_GR: p.Name_GR, from_lat: p.lat, from_lon: p.lon, to_lat: rule.lat, to_lon: rule.lon,
            settlement: rule.settlement, dimos: rule.dimos,
            was_at: place.oikismos ? `${place.oikismos} (Δ. ${place.dimos})` : place.dimos ? `Δ. ${place.dimos}` : "outside every municipality",
            km: Math.round(r.decision.km * 100) / 100, previous_accuracy: p.location_accuracy,
        }, { transaction });
        await HCProviders.update(
            { lat: rule.lat, lon: rule.lon, location_accuracy: rule.location_accuracy },
            { where: { id: p.id }, silent: true, transaction }
        );
        moved.push(r);
    }
    return { moved, review, unknown: results.filter((r) => !r.rule).length };
};

// Returns the number of providers moved (their place is then recomputed by setupPlaces)
export const setupProviderCoords = async () => {
    await ProviderCoordinateFixes.sync();
    const { version } = readRules();
    if (await storedVersion(PLACES_FILE) === version) return 0;
    let result;
    await db.transaction(async (transaction) => {
        result = await applyCoordinateFixes({ transaction });
        await saveVersion(PLACES_FILE, version, transaction);
    });
    console.log(
        `Provider coordinates checked by name: ${result.moved.length} moved to the settlement of their name` +
        (result.review.length ? `, ${result.review.length} to review` : "") +
        (result.unknown ? `, ${result.unknown} names not in data/provider_places.json` : "") +
        " (node scripts/provider-coords.js lists them)"
    );
    return result.moved.length;
};
