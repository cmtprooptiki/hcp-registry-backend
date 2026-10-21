// Exports the position and type of every provider of the database, for the road-distance computation
// of the remote areas (scripts/access/compute_access.py, see scripts/access/README.md):
//   node scripts/export-providers.js            -> reports/providers_for_access.json
// [{ key (provider id), name, type (type_Of_Hcp), ype, lat, lon, location_accuracy }]
import fs from "fs";
import db from "../config/Database.js";
import HCProviders from "../models/HCProvidersModel.js";

const rows = await HCProviders.findAll({
    attributes: ["id", "Name_GR", "type_Of_Hcp", "ype", "lat", "lon", "location_accuracy"],
    order: [["id", "ASC"]],
    raw: true,
});
const out = rows
    .filter((r) => r.lat !== null && r.lon !== null)
    .map((r) => ({ key: r.id, name: r.Name_GR, type: r.type_Of_Hcp, ype: r.ype, lat: Number(r.lat), lon: Number(r.lon),
                   location_accuracy: r.location_accuracy }));
fs.mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../reports/providers_for_access.json", import.meta.url), JSON.stringify(out));
const byType = out.reduce((m, r) => ({ ...m, [r.type]: (m[r.type] || 0) + 1 }), {});
console.log(`reports/providers_for_access.json: ${out.length} providers`, byType);
await db.close();
