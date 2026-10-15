import { Sequelize } from "sequelize";
import Perifereies from "../models/PerifereiesModel.js";
import Dimoi from "../models/DimoiModel.js";

// GET /perifereies -> the 13 regions with how many municipalities each has, without boundaries
export const getPerifereies = async (req, res) => {
    try {
        const rows = await Perifereies.findAll({
            attributes: [
                "id",
                "name",
                [Sequelize.fn("COUNT", Sequelize.col("dimoi.code")), "dimoi_count"],
            ],
            include: [{ model: Dimoi, as: "dimoi", attributes: [] }],
            group: ["Perifereies.id"],
            order: [["name", "ASC"]],
            raw: true,
        });
        res.status(200).json(rows.map((row) => ({ ...row, dimoi_count: Number(row.dimoi_count) })));
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /perifereies/:id/dimoi -> the municipalities of a region, without boundaries
export const getDimoiOfPerifereia = async (req, res) => {
    try {
        const region = await Perifereies.findByPk(req.params.id, {
            attributes: ["id", "name"],
            include: [{ model: Dimoi, as: "dimoi", attributes: ["code", "name", "population"] }],
            order: [[{ model: Dimoi, as: "dimoi" }, "name", "ASC"]],
        });
        if (!region) return res.status(404).json({ msg: "Region not found" });
        res.status(200).json(region);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /perifereies/geometry?ids=10,13 -> GeoJSON FeatureCollection with those regions
export const getPerifereiesGeometry = async (req, res) => {
    try {
        const ids = String(req.query.ids || "")
            .split(",")
            .map((id) => Number(id.trim()))
            .filter(Number.isInteger)
            .slice(0, 20);

        if (ids.length === 0) return res.status(400).json({ msg: "Give the region ids, e.g. ?ids=10,13" });

        const rows = await Perifereies.findAll({ where: { id: ids }, raw: true });
        res.status(200).json({
            type: "FeatureCollection",
            features: rows.map((row) => ({
                type: "Feature",
                properties: { id: row.id, name: row.name },
                geometry: JSON.parse(row.geometry),
            })),
        });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
