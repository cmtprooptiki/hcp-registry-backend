import Oikismoi from "../models/OikismoiModel.js";
import Dimoi from "../models/DimoiModel.js";

const ATTRIBUTES = ["id", "name", "koinotita", "lat", "lon", "dimos_code"];
const asNumbers = (row) => ({ ...row, lat: Number(row.lat), lon: Number(row.lon) });

// GET /oikismoi?dimos_code=7301,7302 -> the settlements of those municipalities
// (id, name, koinotita, lat, lon, dimos_code), by name
export const getOikismoi = async (req, res) => {
    try {
        const codes = String(req.query.dimos_code || "")
            .split(",")
            .map((code) => code.trim())
            .filter(Boolean)
            .slice(0, 100);
        if (codes.length === 0) {
            return res.status(400).json({ msg: "Give the municipality codes, e.g. ?dimos_code=7301,7302" });
        }
        const rows = await Oikismoi.findAll({
            attributes: ATTRIBUTES,
            where: { dimos_code: codes },
            order: [["name", "ASC"], ["id", "ASC"]],
            raw: true,
        });
        res.status(200).json(rows.map(asNumbers));
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// GET /dimoi/:code/oikismoi -> a municipality with its settlements
export const getOikismoiOfDimos = async (req, res) => {
    try {
        const dimos = await Dimoi.findByPk(req.params.code, { attributes: ["code", "name"], raw: true });
        if (!dimos) return res.status(404).json({ msg: "Municipality not found" });
        const oikismoi = await Oikismoi.findAll({
            attributes: ATTRIBUTES,
            where: { dimos_code: dimos.code },
            order: [["name", "ASC"], ["id", "ASC"]],
            raw: true,
        });
        res.status(200).json({ ...dimos, oikismoi: oikismoi.map(asNumbers) });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
