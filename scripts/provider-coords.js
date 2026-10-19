// Coordinates of hospitals / Health Centres / TOMY checked by NAME against the settlement their name /
// address points to (data/provider_places.json, utils/setupProviderCoords.js).
//
// Usage:
//   node scripts/provider-coords.js            on the current database: the providers moved, those that would be
//                                              moved, those to review and the names not in the data file
//   node scripts/provider-coords.js --report   also writes reports/provider_coordinates.csv (every provider, opens in Excel)
//   node scripts/provider-coords.js --revert   puts the moved providers back at their old position
//                                              (the startup does not move them again)
import fs from "fs";
import { Op } from "sequelize";
import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";
import ProviderCoordinateFixes from "../models/ProviderCoordinateFixesModel.js";
import { saveVersion, storedVersion } from "../utils/dataVersions.js";
import { evaluateProviders, readRules, PLACES_FILE } from "../utils/setupProviderCoords.js";
import { assignPlaces } from "../utils/setupPlaces.js";

const revert = process.argv.includes("--revert");
const report = process.argv.includes("--report");
const TOLERANCE = 0.00002;
const fmt = (x) => Number(x).toFixed(6);

const WHY_GR = {
    "in the settlement of its name": "Στον οικισμό του ονόματός του",
    "its settlement is named in its name / address": "Ο οικισμός του αναφέρεται στο όνομα / τη διεύθυνση",
    "inside the area its address names": "Μέσα στην περιοχή που λέει η διεύθυνση",
    "hospital inside its municipality": "Νοσοκομείο μέσα στον δήμο του",
    "inside the municipal unit of its town": "Μέσα στη δημοτική ενότητα της πόλης του",
    "far from the settlement of its name": "Μακριά από τον οικισμό του ονόματός του",
    "no settlement found from the name / address": "Δεν βρέθηκε οικισμός από το όνομα / τη διεύθυνση",
    "name not in data/provider_places.json": "Το όνομα δεν είναι στη λίστα ελέγχου",
};
const whyGr = (why) => WHY_GR[why] ||
    why.replace(/^within (.*) km of the settlement of its name$/, "Μέχρι $1 km από τον οικισμό του ονόματός του")
        .replace(/^the name matches more than one place.*$/, "Το όνομα ταιριάζει σε περισσότερους οικισμούς — έλεγχος με το χέρι");

const writeReport = (rows, logByProvider) => {
    const header = ["Ενέργεια", "Τύπος", "Όνομα", "Διεύθυνση", "Οικισμός τώρα", "Δήμος τώρα", "lat τώρα", "lon τώρα",
        "Οικισμός ονόματος / διεύθυνσης", "Δήμος", "Πληθυσμός 2021", "Απόσταση (km)", "Παλιό lat", "Παλιό lon",
        "Αιτιολογία", "Χάρτης τώρα", "Χάρτης παλιά θέση"];
    const cell = (v) => {
        const s = v === null || v === undefined ? "" : String(v).replace(/\s*\r?\n\s*/g, " ");
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const order = { "Μετακινήθηκε": 0, "Θα μετακινηθεί": 1, "Για έλεγχο": 2, "Χωρίς αλλαγή": 3 };
    const lines = rows.map(({ provider: p, rule, place, decision }) => {
        const log = logByProvider.get(p.id);
        const action = log ? "Μετακινήθηκε" : decision.action === "move" ? "Θα μετακινηθεί"
            : decision.action === "review" ? "Για έλεγχο" : "Χωρίς αλλαγή";
        return {
            action, km: decision.km || 0,
            cells: [action, p.type_Of_Hcp, p.Name_GR, p.address, place.oikismos, place.dimos, fmt(p.lat), fmt(p.lon),
                rule && rule.settlement, rule && rule.dimos, rule && rule.population,
                log ? (log.km === null ? "" : String(log.km).replace(".", ","))
                    : decision.km === null || decision.km === undefined ? "" : decision.km.toFixed(2).replace(".", ","),
                log ? fmt(log.from_lat) : "", log ? fmt(log.from_lon) : "",
                log ? `Μεταφέρθηκε από ${log.was_at || "την παλιά θέση"}${log.km ? ` (${String(log.km).replace(".", ",")} km)` : ""}` : whyGr(decision.why),
                `https://www.google.com/maps?q=${p.lat},${p.lon}`,
                log ? `https://www.google.com/maps?q=${log.from_lat},${log.from_lon}` : ""],
        };
    }).sort((a, b) => order[a.action] - order[b.action] || b.km - a.km);
    fs.mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
    const file = new URL("../reports/provider_coordinates.csv", import.meta.url);
    fs.writeFileSync(file, "﻿" + [header, ...lines.map((l) => l.cells)].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n");
    console.log(`\nReport: reports/provider_coordinates.csv (${lines.length} providers)`);
};

try {
    await db.authenticate();
    await HCProviders.sync();
    await ProviderCoordinateFixes.sync();
    const logs = await ProviderCoordinateFixes.findAll({ order: [["Name_GR", "ASC"]], raw: true });

    if (revert) {
        let back = 0;
        await db.transaction(async (transaction) => {
            for (const log of logs) {
                const [count] = await HCProviders.update(
                    { lat: log.from_lat, lon: log.from_lon, location_accuracy: log.previous_accuracy },
                    {
                        where: {
                            id: log.provider_id,
                            lat: { [Op.between]: [Number(log.to_lat) - TOLERANCE, Number(log.to_lat) + TOLERANCE] },
                            lon: { [Op.between]: [Number(log.to_lon) - TOLERANCE, Number(log.to_lon) + TOLERANCE] },
                        },
                        silent: true, transaction,
                    }
                );
                back += count;
                await ProviderCoordinateFixes.destroy({ where: { id: log.id }, transaction });
            }
            await saveVersion(PLACES_FILE, readRules().version, transaction);
        });
        const places = await assignPlaces({ all: true });
        console.log(`${back} providers put back at their old position (${logs.length - back} had been moved again since and were left); ` +
            `places recomputed (${places.changed} changed)`);
    } else {
        const rows = await evaluateProviders();
        const logByProvider = new Map(logs.map((l) => [l.provider_id, l]));
        const byAction = (a) => rows.filter((r) => r.decision.action === a && !logByProvider.has(r.provider.id));
        console.log(`Moved to the settlement of their name (${logs.length}):`);
        logs.forEach((l) => console.log(`  ${l.Name_GR}: ${fmt(l.from_lat)}, ${fmt(l.from_lon)} -> ${fmt(l.to_lat)}, ${fmt(l.to_lon)}` +
            (l.settlement ? ` = ${l.settlement}, Δ. ${l.dimos} (was in ${l.was_at}, ${l.km} km)` : " (first version)")));
        const toMove = byAction("move");
        const applied = await storedVersion(PLACES_FILE) === readRules().version;
        if (toMove.length) {
            console.log(`\n${applied ? "Would be moved now" : "Will be moved at the next start of the backend"} (${toMove.length})` +
                (applied ? " — not automatically: this version of data/provider_places.json was already applied" : "") + ":");
            toMove.forEach((r) => console.log(`  ${r.provider.Name_GR}: in ${r.place.oikismos || "?"} (Δ. ${r.place.dimos || "?"}), ` +
                `${r.decision.km.toFixed(1)} km from ${r.rule.settlement} (Δ. ${r.rule.dimos})`));
        }
        const toReview = byAction("review");
        if (toReview.length) {
            console.log(`\nTo review by hand (${toReview.length}):`);
            toReview.forEach((r) => console.log(`  ${r.provider.Name_GR}: in ${r.place.oikismos || "?"} (Δ. ${r.place.dimos || "?"}), ` +
                `${r.decision.km.toFixed(1)} km from ${r.rule.settlement} (Δ. ${r.rule.dimos}) — ${r.decision.why}`));
        }
        const unknown = rows.filter((r) => !r.rule);
        if (unknown.length) {
            console.log(`\nNames not in data/provider_places.json, not checked (${unknown.length}):`);
            unknown.slice(0, 30).forEach((r) => console.log(`  #${r.provider.id} ${r.provider.Name_GR}`));
            if (unknown.length > 30) console.log(`  … and ${unknown.length - 30} more`);
        }
        const fine = rows.filter((r) => r.rule && r.decision.action === "keep" && !logByProvider.has(r.provider.id)).length;
        console.log(`\n${rows.length} providers checked by name: ${logs.length} moved, ${toMove.length} ${applied ? "would be" : "to be"} moved, ` +
            `${toReview.length} to review, ${fine} fine, ${unknown.length} not in the list`);
        if (report) writeReport(rows, logByProvider);
    }
} finally {
    await db.close();
}
