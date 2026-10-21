#!/usr/bin/env python3
"""Road distance of every settlement (ΕΛΣΤΑΤ point of data/oikismoi.json) to its nearest health structure
(Hospital, Health Centre, TOMY, Multipurpose Regional Clinic) and to its nearest Regional Clinic (Π.Ι.),
on the drivable road graph made by build_graph.py. Writes data/settlement_access.json, which the backend
loads at startup (utils/setupSettlementAccess.js). Only roads count: no ferries.

    python3 scripts/access/compute_access.py [--graph reports/access/graph.npz]
        [--providers reports/providers_for_access.json] [--out data/settlement_access.json]

The thresholds (14 km, < 10.000 inhabitants) are NOT applied here: the file holds the distances and the
map applies the thresholds, so they can change without recomputing.

Road pieces that OpenStreetMap leaves unconnected to the network (a short unlabelled dirt road, a gate)
are joined to the nearest large network when the gap is at most BRIDGE_MAX_KM, the join runs over land
(the municipality polygons of data/dimoi.json, so never over sea) and the settlement is not in NO_BRIDGE.
The join counts BRIDGE_DETOUR times its straight length; the settlements that use one are marked
"bridged" so they can be checked.
"""
import argparse, hashlib, json, math, os, time
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
from scipy.spatial import cKDTree
from shapely.geometry import shape, LineString
from shapely.ops import unary_union
from shapely.prepared import prep

QUALIFYING = {'Hospital', 'Health Centre', 'TOMY', 'Multipurpose Regional Clinic'}
REGIONAL_CLINIC = 'Regional Clinic'
MIN_COMPONENT = 25        # snap to road pieces with at least this many nodes (not to a lone driveway)
SMALL_FALLBACK_KM = 2.0   # ...unless no such piece is within this distance (small islands)
BIG_NETWORK = 5000        # networks with at least this many nodes (mainland, Crete, Evia, Rhodes, ...)
BRIDGE_MAX_KM = 2.0
BRIDGE_DETOUR = 1.5
BRIDGE_SPEED = 20         # km/h over a join
SNAP_SPEED = 30           # km/h from the settlement / provider point to the road
NO_BRIDGE = {   # settlement id -> why its road piece is never joined (the municipality polygon covers the water)
    3219: 'Νήσος Ιωαννίνων: island in lake Pamvotida, reached by boat',
    4413: 'Σκορπιός: private island, reached by boat',
}

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('--graph', default=os.path.join(ROOT, 'reports', 'access', 'graph.npz'))
ap.add_argument('--providers', default=os.path.join(ROOT, 'reports', 'providers_for_access.json'))
ap.add_argument('--settlements', default=os.path.join(ROOT, 'data', 'oikismoi.json'))
ap.add_argument('--municipalities', default=os.path.join(ROOT, 'data', 'dimoi.json'))
ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'settlement_access.json'))
args = ap.parse_args()

t0 = time.time()
log = lambda *a: print(f'[{round(time.time() - t0):>4}s]', *a, flush=True)

g = np.load(args.graph)
lat, lon, u, v, L, T = g['lat'], g['lon'], g['u'], g['v'], g['L'], g['T']
n = len(lat)
keep = u != v
u, v, L, T = u[keep], v[keep], L[keep].astype(np.float64), T[keep].astype(np.float64)
graph_meta = json.loads(str(g['meta'])) if 'meta' in g.files else {}

C = math.cos(math.radians(38.5))
xy = lambda la, lo: np.column_stack([np.asarray(lo) * 111.32 * C, np.asarray(la) * 110.57])

ones = np.ones(len(u) * 2, dtype=np.int8)
ncomp, comp = connected_components(csr_matrix((ones, (np.concatenate([u, v]), np.concatenate([v, u]))), shape=(n, n)),
                                   directed=False)
size = np.bincount(comp)
log('graph', n, 'nodes', len(u), 'edges', ncomp, 'pieces')

prov = json.load(open(args.providers))
sett = json.load(open(args.settlements))
dimoi = json.load(open(args.municipalities))

big = size[comp] >= MIN_COMPONENT
idx_big = np.where(big)[0]
tree_big = cKDTree(xy(lat[idx_big], lon[idx_big]))
tree_all = cKDTree(xy(lat, lon))
def snap(la, lo):
    d1, i1 = tree_big.query(xy(la, lo)); i1 = idx_big[i1]
    d2, i2 = tree_all.query(xy(la, lo))
    use_small = (d1 > SMALL_FALLBACK_KM) & (d2 < d1)
    return np.where(use_small, i2, i1), np.where(use_small, d2, d1)

P_lat = np.array([p['lat'] for p in prov], dtype=float); P_lon = np.array([p['lon'] for p in prov], dtype=float)
p_node, p_snap = snap(P_lat, P_lon)
S_lat = np.array([s['lat'] for s in sett], dtype=float); S_lon = np.array([s['lon'] for s in sett], dtype=float)
s_node, s_snap = snap(S_lat, S_lon)

# --- joins for unconnected road pieces --------------------------------------------------------------
land = prep(unary_union([shape(d['geometry']) for d in dimoi]).buffer(0.0005))   # ~50 m for the coastline
idx_net = np.where(size[comp] >= BIG_NETWORK)[0]
tree_net = cKDTree(xy(lat[idx_net], lon[idx_net]))
no_bridge_comps = {int(comp[s_node[i]]) for i, s in enumerate(sett) if s['id'] in NO_BRIDGE}
cand = sorted({int(c) for c in comp[s_node] if size[c] < BIG_NETWORK} - no_bridge_comps)
bu, bv, bL, bT, bridged = [], [], [], [], set()
for c in cand:
    nodes = np.where(comp == c)[0]
    d, k = tree_net.query(xy(lat[nodes], lon[nodes]))
    j = int(np.argmin(d))
    if d[j] > BRIDGE_MAX_KM: continue
    a, b = int(nodes[j]), int(idx_net[k[j]])
    if not land.contains(LineString([(lon[a], lat[a]), (lon[b], lat[b])])): continue
    km = float(d[j]) * BRIDGE_DETOUR
    bu.append(a); bv.append(b); bL.append(km * 1000); bT.append(km / BRIDGE_SPEED * 3600)
    bridged.add(c)
log(len(cand), 'unconnected pieces with settlements,', len(bridged), 'joined to a network')
u = np.concatenate([u, bu]).astype(np.int64); v = np.concatenate([v, bv]).astype(np.int64)
L = np.concatenate([L, bL]); T = np.concatenate([T, bT])

rows = np.concatenate([u, v]); cols = np.concatenate([v, u])
GL = csr_matrix((np.concatenate([L, L]) / 1000.0, (rows, cols)), shape=(n, n))   # km
GT = csr_matrix((np.concatenate([T, T]) / 60.0, (rows, cols)), shape=(n, n))     # minutes

def nearest(mask):
    ids = np.where(mask)[0]
    src_nodes = p_node[ids]
    dist, _, src = dijkstra(GL, directed=False, indices=src_nodes, min_only=True, return_predecessors=True)
    tmin = dijkstra(GT, directed=False, indices=src_nodes, min_only=True)
    node_to_prov = {}
    for k, nd in enumerate(src_nodes): node_to_prov.setdefault(int(nd), ids[k])
    s = src[s_node]
    which = np.array([node_to_prov.get(int(x), -1) if x >= 0 else -1 for x in s])
    return dist[s_node], tmin[s_node], which

types = np.array([p['type'] for p in prov])
dq, tq, wq = nearest(np.isin(types, list(QUALIFYING)))
dp, tp, wp = nearest(types == REGIONAL_CLINIC)
log('shortest roads done')

def hav(a, b, c, d):
    r = math.radians; h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

records = []
for i, s in enumerate(sett):
    def pack(d, tm, w):
        if not np.isfinite(d) or w < 0: return None, None, None, None
        km = d + s_snap[i] + p_snap[w]
        mins = tm + (s_snap[i] + p_snap[w]) / SNAP_SPEED * 60
        return round(float(km), 2), round(float(mins), 1), prov[w]['key'], round(hav(s['lat'], s['lon'], prov[w]['lat'], prov[w]['lon']), 2)
    km, mins, key, straight = pack(dq[i], tq[i], wq[i])
    pkm, pmins, pkey, _ = pack(dp[i], tp[i], wp[i])
    rec = {'id': s['id'], 'road_km': km, 'road_min': mins, 'nearest': key, 'straight_km': straight,
           'pi_road_km': pkm, 'pi_road_min': pmins, 'pi_nearest': pkey, 'snap_km': round(float(s_snap[i]), 2)}
    if int(comp[s_node[i]]) in bridged: rec['bridged'] = True
    records.append(rec)

counts = {}
for p in prov: counts[p['type']] = counts.get(p['type'], 0) + 1
# same as providersFingerprint() of utils/setupSettlementAccess.js: tells the backend whether the providers
# changed since this computation (then the map says that the distances must be recomputed)
lines = sorted((p['key'], f"{p['key']}|{p['type']}|{p['lat']:.5f}|{p['lon']:.5f}") for p in prov)
fingerprint = hashlib.sha1('\n'.join(l for _, l in lines).encode('utf8')).hexdigest()
out = {
    'about': 'Road distance (km, minutes) of every settlement of data/oikismoi.json (its ΕΛΣΤΑΤ point) to the nearest '
             'Hospital / Health Centre / TOMY / Multipurpose Regional Clinic (road_km, nearest = provider id) and to the '
             'nearest Regional Clinic (pi_road_km, pi_nearest). null = no road connection (islands without such a unit). '
             'Roads only, no ferries. Made by scripts/access/compute_access.py; loaded by utils/setupSettlementAccess.js.',
    'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
    'graph': graph_meta,
    'providers': counts,
    'providers_fingerprint': fingerprint,
    'params': {'min_component': MIN_COMPONENT, 'bridge_max_km': BRIDGE_MAX_KM, 'bridge_detour': BRIDGE_DETOUR,
               'snap_speed_kmh': SNAP_SPEED, 'no_bridge': NO_BRIDGE},
    'records': records,
}
with open(args.out, 'w') as f:
    f.write('{\n')
    for k in ['about', 'generated_at', 'graph', 'providers', 'providers_fingerprint', 'params']:
        f.write(f'"{k}": {json.dumps(out[k], ensure_ascii=False)},\n')
    f.write('"records": [\n' + ',\n'.join(json.dumps(r, separators=(",", ":")) for r in records) + '\n]\n}\n')
unreach = sum(1 for r in records if r['road_km'] is None)
log('written', args.out, len(records), 'settlements,', unreach, 'without road connection,', len([r for r in records if r.get('bridged')]), 'via a join')
