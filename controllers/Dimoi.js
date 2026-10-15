import { Sequelize } from "sequelize";
import Dimoi from "../models/DimoiModel.js";
import Oikismoi from "../models/OikismoiModel.js";
import DimotikesEnotites from "../models/DimotikesEnotitesModel.js";
import { findDimos } from "../utils/dimoiLookup.js";

// Municipalities whose name exists in more than one region (e.g. ΗΡΑΚΛΕΙΟΥ in Attica and Crete)
// get the region added to their label so they can be told apart in dropdowns.
const withLabels = (rows) => {
    const counts = {};
    rows.forEach((row) => { counts[row.name] = (counts[row.name] || 0) + 1; });
    return rows.map((row) => ({
        ...row,
        label: counts[row.name] > 1 ? `${row.name} (${row.perifereia})` : row.name,
    }));
};

// GET /dimoi -> list of municipalities (region id, regional unit code, population, island / mountain
// flags, ΠΦΥ structure counts, number of municipal units and settlements), without boundaries
export const getDimoi = async (req, res) => {
    try {
        const settlements = await Oikismoi.findAll({
            attributes: ["dimos_code", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
            group: ["dimos_code"],
            raw: true,
        });
        const settlementCount = Object.fromEntries(settlements.map((s) => [s.dimos_code, Number(s.count)]));
        const units = await DimotikesEnotites.findAll({
            attributes: ["dimos_code", [Sequelize.fn("COUNT", Sequelize.col("code")), "count"]],
            group: ["dimos_code"],
            raw: true,
        });
        const unitCount = Object.fromEntries(units.map((u) => [u.dimos_code, Number(u.count)]));
        const rows = await Dimoi.findAll({
            attributes: [
                "code", "name", "perifereia", "perifereia_id", "pe_code", "population",
                "nisiotikos", "mikros_nisiotikos", "oreinos", "pfy_ky", "pfy_pi", "pfy_ppi",
            ],
            order: [["name", "ASC"], ["perifereia", "ASC"]],
            raw: true,
        });
        // MySQL returns booleans as 0 / 1 in raw queries
        const flags = ["nisiotikos", "mikros_nisiotikos", "oreinos"];
        res.status(200).json(withLabels(rows).map((row) => ({
            ...row,
            ...Object.fromEntries(flags.map((flag) => [flag, row[flag] === null ? null : Boolean(row[flag])])),
            oikismoi_count: settlementCount[row.code] || 0,
            de_count: unitCount[row.code] || 0,
        })));
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /dimoi/geometry?codes=4602,4605 -> GeoJSON FeatureCollection with those municipalities
export const getDimoiGeometry = async (req, res) => {
    try {
        const codes = String(req.query.codes || "")
            .split(",")
            .map((code) => code.trim())
            .filter(Boolean)
            .slice(0, 400);

        if (codes.length === 0) return res.status(400).json({ msg: "Give the municipality codes, e.g. ?codes=4602,4605" });

        const rows = await Dimoi.findAll({ where: { code: codes }, raw: true });
        res.status(200).json({
            type: "FeatureCollection",
            features: rows.map((row) => ({
                type: "Feature",
                properties: { code: row.code, name: row.name, perifereia: row.perifereia, population: row.population },
                geometry: JSON.parse(row.geometry),
            })),
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /dimoi/at?lat=35.36&lon=24.47 -> the municipality (and municipal unit) at that point.
// Same lookup as for providers: inside a municipal unit, else the nearest within 3 km.
export const getDimosAt = async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lon = Number(req.query.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ msg: "Give the point, e.g. ?lat=35.36&lon=24.47" });
        }
        const found = await findDimos(lat, lon);
        if (!found) return res.status(404).json({ msg: "No municipality at this point" });
        res.status(200).json({
            code: found.code, name: found.name, de_code: found.de_code, dimotiki_enotita: found.dimotiki_enotita,
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
