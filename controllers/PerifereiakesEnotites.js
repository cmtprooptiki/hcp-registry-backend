import { Sequelize } from "sequelize";
import PerifereiakesEnotites from "../models/PerifereiakesEnotitesModel.js";
import Dimoi from "../models/DimoiModel.js";

// GET /perifereiakes-enotites[?perifereia_id=10] -> regional units (of one region, or all 74)
// with how many municipalities each has, without boundaries
export const getPerifereiakesEnotites = async (req, res) => {
    try {
        const where = req.query.perifereia_id ? { perifereia_id: Number(req.query.perifereia_id) } : undefined;
        const rows = await PerifereiakesEnotites.findAll({
            attributes: [
                "code",
                "name",
                "perifereia_id",
                [Sequelize.fn("COUNT", Sequelize.col("dimoi.code")), "dimoi_count"],
            ],
            where,
            include: [{ model: Dimoi, as: "dimoi", attributes: [] }],
            group: ["PerifereiakesEnotites.code"],
            order: [["name", "ASC"]],
            raw: true,
        });
        res.status(200).json(rows.map((row) => ({ ...row, dimoi_count: Number(row.dimoi_count) })));
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /perifereiakes-enotites/:code/dimoi -> a regional unit with its municipalities, without boundaries
export const getDimoiOfPerifereiakiEnotita = async (req, res) => {
    try {
        const unit = await PerifereiakesEnotites.findByPk(req.params.code, {
            attributes: ["code", "name", "perifereia_id"],
            include: [{ model: Dimoi, as: "dimoi", attributes: ["code", "name", "population"] }],
            order: [[{ model: Dimoi, as: "dimoi" }, "name", "ASC"]],
        });
        if (!unit) return res.status(404).json({ msg: "Regional unit not found" });
        res.status(200).json(unit);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /perifereiakes-enotites/geometry?codes=73,45 -> GeoJSON FeatureCollection with those regional units
export const getPerifereiakesEnotitesGeometry = async (req, res) => {
    try {
        const codes = String(req.query.codes || "")
            .split(",")
            .map((code) => code.trim())
            .filter(Boolean)
            .slice(0, 100);

        if (codes.length === 0) return res.status(400).json({ msg: "Give the regional unit codes, e.g. ?codes=73,45" });

        const rows = await PerifereiakesEnotites.findAll({ where: { code: codes }, raw: true });
        res.status(200).json({
            type: "FeatureCollection",
            features: rows.map((row) => ({
                type: "Feature",
                properties: { code: row.code, name: row.name, perifereia_id: row.perifereia_id },
                geometry: JSON.parse(row.geometry),
            })),
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
