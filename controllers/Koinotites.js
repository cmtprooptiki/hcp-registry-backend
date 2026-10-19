import { Sequelize } from "sequelize";
import Koinotites from "../models/KoinotitesModel.js";
import Oikismoi from "../models/OikismoiModel.js";

const ATTRIBUTES = ["code", "name", "label", "official_name", "kind", "de_code", "dimos_code", "population",
    "in_census", "approximate", "code_2011", "area_km2"];

const codesFrom = (value, max) => String(value || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, max);

const settlementCounts = async (codes) => {
    const rows = await Oikismoi.findAll({
        attributes: ["koinotita_code", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
        where: { koinotita_code: codes },
        group: ["koinotita_code"],
        raw: true,
    });
    return Object.fromEntries(rows.map((r) => [r.koinotita_code, Number(r.count)]));
};

// GET /koinotites?de_code=730101,730102 (or ?dimos_code=7301) -> the communities of those municipal
// units / municipalities: code, name, label, official_name, kind (community / pseudo), de_code,
// dimos_code, population (2021), in_census, approximate, code_2011, area_km2, oikismoi_count; no boundaries
export const getKoinotites = async (req, res) => {
    try {
        const unitCodes = codesFrom(req.query.de_code, 1100);
        const dimosCodes = codesFrom(req.query.dimos_code, 400);
        if (unitCodes.length === 0 && dimosCodes.length === 0) {
            return res.status(400).json({ msg: "Give the municipal unit codes, e.g. ?de_code=730101 (or ?dimos_code=7301)" });
        }
        const where = {};
        if (unitCodes.length) where.de_code = unitCodes;
        if (dimosCodes.length) where.dimos_code = dimosCodes;
        const rows = await Koinotites.findAll({
            attributes: ATTRIBUTES, where, order: [["name", "ASC"], ["code", "ASC"]], raw: true,
        });
        const counts = await settlementCounts(rows.map((r) => r.code));
        res.status(200).json(rows.map((row) => ({
            ...row,
            in_census: Boolean(row.in_census),
            approximate: Boolean(row.approximate),
            area_km2: row.area_km2 === null ? null : Number(row.area_km2),
            oikismoi_count: counts[row.code] || 0,
        })));
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /koinotites/names -> every community of Greece, compact, for the map's search box:
// [{ code, label, de_code }] (~6.000 rows, fetched once; not the "pseudo" ones, which are whole units)
export const getKoinotitesNames = async (req, res) => {
    try {
        const rows = await Koinotites.findAll({
            attributes: ["code", "label", "de_code"],
            where: { kind: "community" },
            order: [["name", "ASC"], ["code", "ASC"]],
            raw: true,
        });
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /koinotites/geometry?codes=73010101,73010102 -> GeoJSON FeatureCollection (simplified
// boundaries, for the map)
export const getKoinotitesGeometry = async (req, res) => {
    try {
        const codes = codesFrom(req.query.codes, 500);
        if (codes.length === 0) {
            return res.status(400).json({ msg: "Give the community codes, e.g. ?codes=73010101,73010102" });
        }
        const rows = await Koinotites.findAll({
            attributes: ["code", "name", "label", "de_code", "geometry"],
            where: { code: codes },
            raw: true,
        });
        res.status(200).json({
            type: "FeatureCollection",
            features: rows.map((row) => ({
                type: "Feature",
                properties: { code: row.code, name: row.name, label: row.label, de_code: row.de_code },
                geometry: JSON.parse(row.geometry),
            })),
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
