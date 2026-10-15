// Finds the municipality (Δήμος) and the municipal unit (Δημοτική Ενότητα) at a point, using the
// detailed boundaries of the municipal units (DimotikesEnotites.geometry_detail): the municipality is
// the one of the unit that contains the point.
//
// The boundaries are simplified, so a provider right on the coast can fall a few metres
// into the sea. When a point is inside no unit we take the nearest one, but only
// if it is closer than NEAREST_MAX_KM; otherwise we return null.
import Dimoi from "../models/DimoiModel.js";
import DimotikesEnotites from "../models/DimotikesEnotitesModel.js";

const NEAREST_MAX_KM = 3;

let cache = null; // [{ code, name, dimos_code, dimos, polygons, bbox }] (one per municipal unit)

const toPolygons = (geometry) =>
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];

const bboxOf = (polygons) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const polygon of polygons) {
        for (const [x, y] of polygon[0]) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    return [minX, minY, maxX, maxY];
};

// Prepare area records ({ code, name, geometry, ...other fields }) for fast lookups
export const prepareAreas = (records) =>
    records.map(({ geometry, ...fields }) => {
        const geo = typeof geometry === "string" ? JSON.parse(geometry) : geometry;
        const polygons = toPolygons(geo);
        return { ...fields, polygons, bbox: bboxOf(polygons) };
    });

const loadUnits = async () => {
    if (!cache) {
        const dimoi = await Dimoi.findAll({ attributes: ["code", "name"], raw: true });
        const dimosName = Object.fromEntries(dimoi.map((d) => [d.code, d.name]));
        const units = await DimotikesEnotites.findAll({
            attributes: ["code", "label", "dimos_code", "geometry_detail"], raw: true,
        });
        cache = prepareAreas(units.map(({ code, label, dimos_code, geometry_detail }) => ({
            code, name: label, dimos_code, dimos: dimosName[dimos_code] || null, geometry: geometry_detail,
        })));
    }
    return cache;
};

export const clearDimoiCache = () => {
    cache = null;
};

const insideRing = (x, y, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

// Outer ring minus holes
const insidePolygon = (x, y, polygon) =>
    insideRing(x, y, polygon[0]) && !polygon.slice(1).some((hole) => insideRing(x, y, hole));

// Distance in km from a point to a segment (local flat-earth approximation, fine for a few km)
const segmentDistanceKm = (x, y, [ax, ay], [bx, by]) => {
    const kx = 111.32 * Math.cos((y * Math.PI) / 180);
    const ky = 110.57;
    const px = (x - ax) * kx, py = (y - ay) * ky;
    const vx = (bx - ax) * kx, vy = (by - ay) * ky;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * vx + py * vy) / len2));
    return Math.hypot(px - t * vx, py - t * vy);
};

const distanceKm = (x, y, polygons) => {
    let best = Infinity;
    for (const polygon of polygons) {
        for (const ring of polygon) {
            for (let i = 0; i < ring.length - 1; i++) {
                const d = segmentDistanceKm(x, y, ring[i], ring[i + 1]);
                if (d < best) best = d;
            }
        }
    }
    return best;
};

// The area (prepared with prepareAreas) that contains the point, else the nearest within
// NEAREST_MAX_KM: { ...area fields without polygons, method: "inside" | "nearest", distanceKm } or null
export const findAreaIn = (areas, lat, lon) => {
    const y = Number(lat);
    const x = Number(lon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const result = ({ polygons, bbox, ...fields }, method, distanceKm) => ({ ...fields, method, distanceKm });

    for (const d of areas) {
        const [minX, minY, maxX, maxY] = d.bbox;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        if (d.polygons.some((polygon) => insidePolygon(x, y, polygon))) return result(d, "inside", 0);
    }

    // NEAREST_MAX_KM / 80 degrees is at least NEAREST_MAX_KM in Greece: skip municipalities further away
    const margin = NEAREST_MAX_KM / 80;
    let nearest = null;
    for (const d of areas) {
        const [minX, minY, maxX, maxY] = d.bbox;
        if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) continue;
        const dist = distanceKm(x, y, d.polygons);
        if (dist <= NEAREST_MAX_KM && (!nearest || dist < nearest.distanceKm)) {
            nearest = result(d, "nearest", dist);
        }
    }
    return nearest;
};

// Municipal unit and municipality at (lat, lon):
// { de_code, dimotiki_enotita, dimos_code, dimos, method, distanceKm } or null
export const findPlace = async (lat, lon) => {
    const unit = findAreaIn(await loadUnits(), lat, lon);
    if (!unit) return null;
    return {
        de_code: unit.code, dimotiki_enotita: unit.name,
        dimos_code: unit.dimos_code, dimos: unit.dimos,
        method: unit.method, distanceKm: unit.distanceKm,
    };
};

// The municipality at (lat, lon): { code, name, method, distanceKm, de_code, dimotiki_enotita } or null
export const findDimos = async (lat, lon) => {
    const place = await findPlace(lat, lon);
    if (!place) return null;
    return {
        code: place.dimos_code, name: place.dimos, method: place.method, distanceKm: place.distanceKm,
        de_code: place.de_code, dimotiki_enotita: place.dimotiki_enotita,
    };
};

// The fields to store for a provider at (lat, lon): { dimos, dimos_code, dimotiki_enotita, de_code }
export const dimosFields = async (lat, lon) => {
    const place = await findPlace(lat, lon);
    return {
        dimos: place ? place.dimos : null,
        dimos_code: place ? place.dimos_code : null,
        dimotiki_enotita: place ? place.dimotiki_enotita : null,
        de_code: place ? place.de_code : null,
    };
};
