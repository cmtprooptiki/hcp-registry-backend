// Runs last at startup (see index.js): municipality (Δήμος), municipal unit (Δημοτική Ενότητα),
// settlement (Οικισμός) and community (Κοινότητα, the one of the settlement) of the providers, from their lat/lon.
//  - when boundaries, settlements or clinic positions changed at this start: every provider
//  - otherwise: only providers that miss one of them
// They are computed fields (the client can't set them), so they are written with silent: true
// (updatedAt stays the date of the last real edit).
import { Op } from "sequelize";
import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";
import { dimosFields } from "./dimoiLookup.js";
import { oikismosFields, NO_SETTLEMENT, SEAT_ACCURACY } from "./oikismoiLookup.js";

const PLACE_FIELDS = ["dimos", "dimos_code", "dimotiki_enotita", "de_code", "oikismos", "oikismos_id",
    "koinotita", "koinotita_code"];

// Returns { checked, changed, unplaced: providers outside every municipal unit (> 3 km) }
export const assignPlaces = async ({ all = false, dryRun = false } = {}) => {
    const missing = {
        [Op.or]: [
            { dimos_code: null },
            { de_code: null },
            {
                oikismos_id: null,
                [Op.or]: [{ location_accuracy: null }, { location_accuracy: { [Op.ne]: SEAT_ACCURACY } }],
            },
            { oikismos_id: { [Op.ne]: null }, koinotita_code: null },
        ],
    };
    const providers = await HCProviders.findAll({
        attributes: ["id", "Name_GR", "lat", "lon", "location_accuracy", ...PLACE_FIELDS],
        where: all ? undefined : missing,
        order: [["id", "ASC"]],
        raw: true,
    });

    const changes = [];
    const unplaced = [];
    for (const p of providers) {
        const area = await dimosFields(p.lat, p.lon);
        if (!area.dimos_code) unplaced.push(p);
        // clinics placed at the seat of their municipality: their village, so their settlement, is unknown
        const settlement = p.location_accuracy === SEAT_ACCURACY || !area.dimos_code
            ? NO_SETTLEMENT
            : await oikismosFields(p.lat, p.lon, area.dimos_code, area.de_code);
        const fields = { ...area, ...settlement };
        if (PLACE_FIELDS.some((key) => (fields[key] ?? null) !== (p[key] ?? null))) changes.push({ p, fields });
    }

    if (!dryRun && changes.length) {
        await db.transaction(async (transaction) => {
            for (const { p, fields } of changes) {
                await HCProviders.update(fields, { where: { id: p.id }, silent: true, transaction });
            }
        });
    }
    return { checked: providers.length, changed: changes.length, changes, unplaced };
};

export const setupPlaces = async ({ recompute = false } = {}) => {
    const { checked, changed, unplaced } = await assignPlaces({ all: recompute });
    if (checked) {
        console.log(
            `Places (municipality / municipal unit / settlement / community) ${recompute ? "recomputed" : "checked"} ` +
            `for ${checked} providers, ${changed} changed`
        );
    }
    if (unplaced.length) {
        console.log(`  ${unplaced.length} providers have coordinates outside every municipality, e.g. ` +
            unplaced.slice(0, 3).map((p) => `#${p.id} ${p.Name_GR || ""} (${p.lat}, ${p.lon})`).join("; "));
    }
};
