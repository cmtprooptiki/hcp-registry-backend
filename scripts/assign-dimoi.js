// Recomputes the municipality (Δήμος), municipal unit (Δημοτική Ενότητα), settlement (Οικισμός) and
// community (Κοινότητα) of EVERY provider from its lat/lon and prints the providers worth checking by hand. The backend
// already does this automatically for new/edited providers and, at startup, for providers missing
// one of them (and for all, when the boundaries or settlements change); run this only to redo all
// of them (e.g. after fixing coordinates directly in the DB).
//
// Usage:
//   node scripts/assign-dimoi.js            (update the database)
//   node scripts/assign-dimoi.js --dry-run  (only show what would change)

import db from "../config/Database.js";
import "../models/DataVersionsModel.js";
import HCProviders from "../models/HCProvidersModel.js";
import { prepareDimoiTables } from "../utils/setupDimoi.js";
import { prepareDimotikesEnotites } from "../utils/setupDimotikesEnotites.js";
import { prepareKoinotites } from "../utils/setupKoinotites.js";
import { prepareOikismoiTables } from "../utils/setupOikismoi.js";
import { assignPlaces } from "../utils/setupPlaces.js";
import { findDimos } from "../utils/dimoiLookup.js";

const dryRun = process.argv.includes("--dry-run");

try {
    await db.authenticate();
    await prepareDimoiTables();
    await prepareDimotikesEnotites();
    await prepareKoinotites();
    await prepareOikismoiTables();

    const { checked, changes, unplaced } = await assignPlaces({ all: true, dryRun });

    // providers matched to the nearest municipal unit (outside every boundary, e.g. on the coast)
    const nearest = [];
    const all = await HCProviders.findAll({ attributes: ["id", "Name_GR", "lat", "lon"], raw: true });
    for (const p of all) {
        const found = await findDimos(p.lat, p.lon);
        if (found && found.method === "nearest") nearest.push({ ...p, found });
    }

    console.log(`${checked} providers: ${checked - nearest.length - unplaced.length} inside a municipal unit, ` +
        `${nearest.length} matched to the nearest boundary (coast), ${unplaced.length} without municipality.`);
    console.log(dryRun ? `${changes.length} would change (dry run, nothing written).` : `${changes.length} updated.`);
    for (const { p, fields } of changes.filter(({ p, fields }) => p.dimos_code !== fields.dimos_code)) {
        console.log(`  #${p.id} ${p.Name_GR}: municipality ${p.dimos || "-"} -> ${fields.dimos || "-"}`);
    }

    if (nearest.length) {
        console.log("\nMatched to the nearest municipal unit (check if the distance is large):");
        nearest
            .sort((a, b) => b.found.distanceKm - a.found.distanceKm)
            .forEach((p) => console.log(`  #${p.id}  ${p.found.distanceKm.toFixed(2)} km  ${p.found.name} / ` +
                `${p.found.dimotiki_enotita}  <-  ${p.Name_GR} (${p.lat}, ${p.lon})`));
    }
    if (unplaced.length) {
        console.log("\nNo municipality within 3 km (wrong or missing coordinates?):");
        unplaced.forEach((p) => console.log(`  #${p.id}  ${p.Name_GR} (${p.lat}, ${p.lon})`));
    }
} catch (error) {
    console.error("Failed:", error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
