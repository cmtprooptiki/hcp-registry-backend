// GET /population/ages[?level=pe|dimos] -> population by 5-year age group (census 2021, ΕΛΣΤΑΤ) of every
// regional unit (Π.Ε.) or municipality, from data/population_ages.json (scripts/census/build_ages.py):
// { source, groups: ['0-4', ..., '75+'], country: {name, t, m, f}, rows: { code: {name, t, m, f} } }
// t / m / f = both sexes / men / women, each [total, then one number per group].
import fs from "fs";
import { readDataFile } from "../utils/dataVersions.js";

const AGES_FILE = "population_ages.json";
const fileUrl = new URL(`../data/${AGES_FILE}`, import.meta.url);
let cache = { mtime: null, file: null };

export const getPopulationAges = async (req, res) => {
    try {
        if (!fs.existsSync(fileUrl)) return res.status(200).json({ groups: [], country: null, rows: {} });
        const mtime = fs.statSync(fileUrl).mtimeMs;
        if (cache.mtime !== mtime) cache = { mtime, file: readDataFile(AGES_FILE).records };
        const level = req.query.level === "dimos" ? "dimos" : "pe";
        const { source, generated_at, groups, country } = cache.file;
        res.status(200).json({ level, source, generated_at, groups, country, rows: cache.file[level] || {} });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
