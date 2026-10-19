import Oikismoi from "../models/OikismoiModel.js";
import Dimoi from "../models/DimoiModel.js";

const ATTRIBUTES = ["id", "name", "koinotita", "koinotita_code", "lat", "lon", "dimos_code", "de_code", "population"];
const asNumbers = (row) => ({ ...row, lat: Number(row.lat), lon: Number(row.lon) });

const codesFrom = (value) => String(value || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, 100);

// GET /oikismoi?dimos_code=7301,7302 -> the settlements of those municipalities, or
// GET /oikismoi?de_code=730101 -> of those municipal units, or ?koinotita_code=73010101 -> of those communities
// (id, name, koinotita, koinotita_code, lat, lon, dimos_code, de_code, population = 2021 census), by name
export const getOikismoi = async (req, res) => {
    try {
        const dimosCodes = codesFrom(req.query.dimos_code);
        const unitCodes = codesFrom(req.query.de_code);
        const communityCodes = codesFrom(req.query.koinotita_code);
        if (dimosCodes.length === 0 && unitCodes.length === 0 && communityCodes.length === 0) {
            return res.status(400).json({ msg: "Give the municipality codes, e.g. ?dimos_code=7301,7302 (or ?de_code=730101, ?koinotita_code=73010101)" });
        }
        const where = {};
        if (dimosCodes.length) where.dimos_code = dimosCodes;
        if (unitCodes.length) where.de_code = unitCodes;
        if (communityCodes.length) where.koinotita_code = communityCodes;
        const rows = await Oikismoi.findAll({
            attributes: ATTRIBUTES,
            where,
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

// GET /oikismoi/names -> every settlement of Greece, compact, for the map's search box:
// [{ id, name, koinotita, koinotita_code, dimos_code, de_code }] (no coordinates; ~13.500 rows, fetched once)
export const getOikismoiNames = async (req, res) => {
    try {
        const rows = await Oikismoi.findAll({
            attributes: ["id", "name", "koinotita", "koinotita_code", "dimos_code", "de_code"],
            order: [["name", "ASC"], ["id", "ASC"]],
            raw: true,
        });
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
