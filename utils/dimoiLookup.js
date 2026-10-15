// Finds the municipality (Δήμος) that contains a point, using the boundaries in the Dimoi table.
//
// The boundaries are simplified, so a provider right on the coast can fall a few metres
// into the sea. When a point is inside no municipality we take the nearest one, but only
// if it is closer than NEAREST_MAX_KM; otherwise we return null.
import Dimoi from "../models/DimoiModel.js";

const NEAREST_MAX_KM = 3;

let cache = null; // [{ code, name, polygons, bbox }]

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

// Prepare municipality records ({ code, name, geometry }) for fast lookups
export const prepareDimoi = (records) =>
    records.map(({ code, name, geometry }) => {
        const geo = typeof geometry === "string" ? JSON.parse(geometry) : geometry;
        const polygons = toPolygons(geo);
        return { code, name, polygons, bbox: bboxOf(polygons) };
    });

const loadDimoi = async () => {
    if (!cache) {
        const rows = await Dimoi.findAll({ attributes: ["code", "name", "geometry"], raw: true });
        cache = prepareDimoi(rows);
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

// Returns { code, name, method: "inside" | "nearest", distanceKm } or null
export const findDimosIn = (dimoi, lat, lon) => {
    const y = Number(lat);
    const x = Number(lon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    for (const d of dimoi) {
        const [minX, minY, maxX, maxY] = d.bbox;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        if (d.polygons.some((polygon) => insidePolygon(x, y, polygon))) {
            return { code: d.code, name: d.name, method: "inside", distanceKm: 0 };
        }
    }

    // NEAREST_MAX_KM / 80 degrees is at least NEAREST_MAX_KM in Greece: skip municipalities further away
    const margin = NEAREST_MAX_KM / 80;
    let nearest = null;
    for (const d of dimoi) {
        const [minX, minY, maxX, maxY] = d.bbox;
        if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) continue;
        const dist = distanceKm(x, y, d.polygons);
        if (dist <= NEAREST_MAX_KM && (!nearest || dist < nearest.distanceKm)) {
            nearest = { code: d.code, name: d.name, method: "nearest", distanceKm: dist };
        }
    }
    return nearest;
};

export const findDimos = async (lat, lon) => findDimosIn(await loadDimoi(), lat, lon);

// The dimos / dimos_code fields to store for a provider at (lat, lon)
export const dimosFields = async (lat, lon) => {
    const found = await findDimos(lat, lon);
    return { dimos: found ? found.name : null, dimos_code: found ? found.code : null };
};
