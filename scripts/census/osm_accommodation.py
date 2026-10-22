#!/usr/bin/env python3
"""Tourist accommodation of every settlement from OpenStreetMap -> field acc_osm of data/settlement_census.json.

    python3 scripts/census/osm_accommodation.py ../greece-latest.osm.pbf [--census data/settlement_census.json]

Counts the OSM points / areas tagged tourism = hotel, apartment, guest_house, hostel, motel, chalet,
camp_site, caravan_site, resort and gives each to the nearest settlement (data/oikismoi.json) within 3 km.
Extra information only (the census counts dwellings, not hotels or rooms to let): it is the number of
establishments, not beds, and OSM is not complete, so it is a lower bound. Run it after build_census.py
(which rewrites the file) and whenever a newer OSM extract is used. Needs: pip install osmium numpy scipy
"""
import argparse, json, math, os, time
import numpy as np
import osmium
from scipy.spatial import cKDTree

KINDS = {'hotel', 'apartment', 'guest_house', 'hostel', 'motel', 'chalet', 'camp_site', 'caravan_site', 'resort'}
MAX_KM = 3.0
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('pbf')
ap.add_argument('--settlements', default=os.path.join(ROOT, 'data', 'oikismoi.json'))
ap.add_argument('--census', default=os.path.join(ROOT, 'data', 'settlement_census.json'))
args = ap.parse_args()

points = []
fp = osmium.FileProcessor(args.pbf).with_locations().with_filter(osmium.filter.TagFilter(*[('tourism', k) for k in KINDS]))
for o in fp:
    if o.tags.get('tourism') not in KINDS: continue
    if o.is_node():
        if o.location.valid(): points.append((o.location.lat, o.location.lon))
    elif o.is_way():
        pts = [(n.lat, n.lon) for n in o.nodes if n.location.valid()]
        if pts: points.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))

sett = json.load(open(args.settlements))
C = math.cos(math.radians(38.5))
xy = lambda la, lo: np.column_stack([np.asarray(lo) * 111.32 * C, np.asarray(la) * 110.57])
tree = cKDTree(xy([s['lat'] for s in sett], [s['lon'] for s in sett]))
d, i = tree.query(xy([p[0] for p in points], [p[1] for p in points]))
counts = {}
for dd, ii in zip(d, i):
    if dd <= MAX_KM: counts[sett[ii]['id']] = counts.get(sett[ii]['id'], 0) + 1

census = json.load(open(args.census))
by_id = {r['id']: r for r in census['records']}
for sid, n in counts.items():
    if sid not in by_id:
        by_id[sid] = {'id': sid}
        census['records'].append(by_id[sid])
for r in census['records']:
    r['acc_osm'] = counts.get(r['id'], 0)
census['osm_accommodation'] = (f"acc_osm: tourist accommodation establishments in OpenStreetMap ({os.path.basename(args.pbf)}, "
                               f"{time.strftime('%Y-%m-%d')}) within {MAX_KM:g} km, by scripts/census/osm_accommodation.py")
with open(args.census, 'w') as f:
    f.write('{\n')
    for k in [k for k in census if k != 'records']:
        f.write(f'"{k}": {json.dumps(census[k], ensure_ascii=False)},\n')
    f.write('"records": [\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in census['records']) + '\n]\n}\n')
print(f'{len(points)} accommodation points, {sum(counts.values())} given to {len(counts)} settlements -> {args.census}')
