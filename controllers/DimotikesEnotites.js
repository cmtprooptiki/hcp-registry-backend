import { Sequelize } from "sequelize";
import DimotikesEnotites from "../models/DimotikesEnotitesModel.js";
import Dimoi from "../models/DimoiModel.js";
import Oikismoi from "../models/OikismoiModel.js";
import Koinotites from "../models/KoinotitesModel.js";

const ATTRIBUTES = ["code", "name", "label", "official_name", "dimos_code", "area_km2", "population", "code_2011"];

const codesFrom = (value, max) => String(value || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, max);

// { de_code: number of rows } of a table (settlements, communities)
const countsByUnit = async (model, key, where) => {
    const rows = await model.findAll({
        attributes: ["de_code", [Sequelize.fn("COUNT", Sequelize.col(key)), "count"]],
        where,
        group: ["de_code"],
        raw: true,
    });
    return Object.fromEntries(rows.map((r) => [r.de_code, Number(r.count)]));
};
const settlementCounts = async (where) => ({
    oikismoi: await countsByUnit(Oikismoi, "id", where),
    koinotites: await countsByUnit(Koinotites, "code", where),
});

const asListItem = (counts) => (row) => ({
    ...row,
    area_km2: row.area_km2 === null ? null : Number(row.area_km2),
    oikismoi_count: counts.oikismoi[row.code] || 0,
    koinotites_count: counts.koinotites[row.code] || 0,
});

// GET /dimotikes-enotites[?dimos_code=7301,7302] -> municipal units (of those municipalities, or
// all 1037): code, name, label, official_name, dimos_code, area_km2, population (2021), code_2011,
// oikismoi_count, koinotites_count; no boundaries
export const getDimotikesEnotites = async (req, res) => {
    try {
        const codes = codesFrom(req.query.dimos_code, 400);
        const where = codes.length ? { dimos_code: codes } : undefined;
        const rows = await DimotikesEnotites.findAll({
            attributes: ATTRIBUTES, where, order: [["name", "ASC"], ["code", "ASC"]], raw: true,
        });
        const counts = await settlementCounts(where);
        res.status(200).json(rows.map(asListItem(counts)));
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /dimoi/:code/dimotikes-enotites -> a municipality with its municipal units
export const getDimotikesEnotitesOfDimos = async (req, res) => {
    try {
        const dimos = await Dimoi.findByPk(req.params.code, { attributes: ["code", "name"], raw: true });
        if (!dimos) return res.status(404).json({ msg: "Municipality not found" });
        const where = { dimos_code: dimos.code };
        const rows = await DimotikesEnotites.findAll({
            attributes: ATTRIBUTES, where, order: [["name", "ASC"]], raw: true,
        });
        const counts = await settlementCounts(where);
        res.status(200).json({ ...dimos, dimotikes_enotites: rows.map(asListItem(counts)) });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /dimotikes-enotites/geometry?codes=730101,730102 -> GeoJSON FeatureCollection (simplified
// boundaries, for the map)
export const getDimotikesEnotitesGeometry = async (req, res) => {
    try {
        const codes = codesFrom(req.query.codes, 1100);
        if (codes.length === 0) {
            return res.status(400).json({ msg: "Give the municipal unit codes, e.g. ?codes=730101,730102" });
        }
        const rows = await DimotikesEnotites.findAll({
            attributes: ["code", "name", "label", "dimos_code", "geometry"],
            where: { code: codes },
            raw: true,
        });
        res.status(200).json({
            type: "FeatureCollection",
            features: rows.map((row) => ({
                type: "Feature",
                properties: { code: row.code, name: row.name, label: row.label, dimos_code: row.dimos_code },
                geometry: JSON.parse(row.geometry),
            })),
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
