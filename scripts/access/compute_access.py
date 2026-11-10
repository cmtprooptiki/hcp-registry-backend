#!/usr/bin/env python3
"""Road distance of every settlement (ΕΛΣΤΑΤ point of data/oikismoi.json) to its nearest health structure
(Hospital, Health Centre, TOMY, Multipurpose Regional Clinic) and to its nearest Regional Clinic (Π.Ι.),
on the drivable road graph made by build_graph.py. Writes data/settlement_access.json, which the backend
loads at startup (utils/setupSettlementAccess.js). Only roads count: no ferries.

    python3 scripts/access/compute_access.py [--graph reports/access/graph.npz]
        [--providers reports/providers_for_access.json] [--out data/settlement_access.json]

The thresholds (14 km, < 10.000 inhabitants) are NOT applied here: the file holds the distances and the
map applies the thresholds, so they can change without recomputing.

Unconnected road pieces are joined as described in roadnet.py; the settlements that use a join are marked
"bridged" so they can be checked. NO_BRIDGE lists the settlements whose piece is never joined.
"""
import argparse, json, os, time
import numpy as np
from roadnet import RoadNet, hav, providers_fingerprint, MIN_COMPONENT, BRIDGE_MAX_KM, BRIDGE_DETOUR, SNAP_SPEED

QUALIFYING = {'Hospital', 'Health Centre', 'TOMY', 'Multipurpose Regional Clinic'}
REGIONAL_CLINIC = 'Regional Clinic'
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

net = RoadNet(args.graph, args.municipalities, log)
prov = json.load(open(args.providers))
sett = json.load(open(args.settlements))

p_node, p_snap = net.snap([p['lat'] for p in prov], [p['lon'] for p in prov])
s_node, s_snap = net.snap([s['lat'] for s in sett], [s['lon'] for s in sett])
bridged = net.build(s_node, [s_node[i] for i, s in enumerate(sett) if s['id'] in NO_BRIDGE])

types = np.array([p['type'] for p in prov])
def nearest(mask):
    ids = np.where(mask)[0]
    return net.nearest(p_node[ids], ids, s_node)
dq, tq, wq = nearest(np.isin(types, list(QUALIFYING)))
dp, tp, wp = nearest(types == REGIONAL_CLINIC)
log('shortest roads done')

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
    if net.piece_of(s_node[i]) in bridged: rec['bridged'] = True
    records.append(rec)

counts = {}
for p in prov: counts[p['type']] = counts.get(p['type'], 0) + 1
out = {
    'about': 'Road distance (km, minutes) of every settlement of data/oikismoi.json (its ΕΛΣΤΑΤ point) to the nearest '
             'Hospital / Health Centre / TOMY / Multipurpose Regional Clinic (road_km, nearest = provider id) and to the '
             'nearest Regional Clinic (pi_road_km, pi_nearest). null = no road connection (islands without such a unit). '
             'Roads only, no ferries. Made by scripts/access/compute_access.py; loaded by utils/setupSettlementAccess.js.',
    'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
    'graph': net.meta,
    'providers': counts,
    'providers_fingerprint': providers_fingerprint(prov),
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
