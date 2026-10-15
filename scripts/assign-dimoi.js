// Recomputes the municipality (Δήμος) of EVERY provider from its lat/lon and prints
// the providers worth checking by hand. The backend already does this automatically
// for new/edited providers and, at startup, for providers without a municipality;
// run this only to redo all of them (e.g. after fixing coordinates directly in the DB).
//
// Usage:
//   node scripts/assign-dimoi.js            (update the database)
//   node scripts/assign-dimoi.js --dry-run  (only show what would change)

import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";
import { prepareDimoiTables } from "../utils/setupDimoi.js";
import { findDimos } from "../utils/dimoiLookup.js";
import { prepareOikismoiTables, assignOikismoi } from "../utils/setupOikismoi.js";

const dryRun = process.argv.includes("--dry-run");

try {
    await db.authenticate();
    await prepareDimoiTables();

    const providers = await HCProviders.findAll({
        attributes: ["id", "Name_GR", "lat", "lon", "dimos", "dimos_code"],
        order: [["id", "ASC"]],
        raw: true,
    });

    let inside = 0, changed = 0;
    const nearest = [];
    const none = [];

    for (const p of providers) {
        const found = await findDimos(p.lat, p.lon);
        if (!found) none.push(p);
        else if (found.method === "inside") inside++;
        else nearest.push({ ...p, found });

        const dimos = found ? found.name : null;
        const dimos_code = found ? found.code : null;
        if (dimos_code !== p.dimos_code || dimos !== p.dimos) {
            changed++;
            if (!dryRun) await HCProviders.update({ dimos, dimos_code }, { where: { id: p.id }, silent: true });
        }
    }

    console.log(`${providers.length} providers: ${inside} inside a municipality, ` +
        `${nearest.length} matched to the nearest boundary (coast), ${none.length} without municipality.`);
    console.log(dryRun ? `${changed} would change (dry run, nothing written).` : `${changed} updated.`);

    // The settlement depends on the municipality: recompute it for every provider
    if (!dryRun) {
        await prepareOikismoiTables();
        await assignOikismoi({ onlyMissing: false });
        console.log("Settlements recomputed for all providers.");
    }

    if (nearest.length) {
        console.log("\nMatched to the nearest municipality (check if the distance is large):");
        nearest
            .sort((a, b) => b.found.distanceKm - a.found.distanceKm)
            .forEach((p) => console.log(`  #${p.id}  ${p.found.distanceKm.toFixed(2)} km  ${p.found.name}  <-  ${p.Name_GR} (${p.lat}, ${p.lon})`));
    }
    if (none.length) {
        console.log("\nNo municipality within 3 km (wrong or missing coordinates?):");
        none.forEach((p) => console.log(`  #${p.id}  ${p.Name_GR} (${p.lat}, ${p.lon})`));
    }
} catch (error) {
    console.error("Failed:", error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
