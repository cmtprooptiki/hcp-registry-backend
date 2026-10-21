#!/usr/bin/env python3
"""Drivable road graph of Greece from an OpenStreetMap extract -> graph.npz (node lat/lon, undirected edges with
length in m and time in s), used by compute_access.py.

    python3 scripts/access/build_graph.py ../greece-latest.osm.pbf [reports/access/graph.npz]

The extract comes from https://download.geofabrik.de/europe/greece.html (about 350 MB). Needs about 4 GB of RAM
and 2-3 minutes. Rebuild it only when you want a newer road network; a change of providers needs only
compute_access.py.
"""
import sys, os, json, math, time
import numpy as np
import osmium

SPEED = {  # km/h, typical for Greece
    'motorway': 100, 'motorway_link': 60, 'trunk': 80, 'trunk_link': 50, 'primary': 65, 'primary_link': 45,
    'secondary': 55, 'secondary_link': 40, 'tertiary': 45, 'tertiary_link': 35, 'unclassified': 35,
    'residential': 25, 'living_street': 10, 'service': 15, 'road': 30,
}
TRACK_OK = {'grade1': 25, 'grade2': 20}  # tracks with a good surface count (many villages hang on them)

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.u = []; self.v = []; self.L = []; self.T = []
        self.coords = {}
        self.n = 0
    def way(self, w):
        t = w.tags
        hw = t.get('highway')
        if hw is None: return
        if hw == 'track':
            sp = TRACK_OK.get(t.get('tracktype', ''))
            if sp is None: return
        else:
            sp = SPEED.get(hw)
            if sp is None: return
        if t.get('access') in ('no', 'private') or t.get('motor_vehicle') == 'no' or t.get('motorcar') == 'no': return
        if t.get('area') == 'yes': return
        prev = None
        for nd in w.nodes:
            loc = nd.location
            if not loc.valid(): prev = None; continue
            ref = nd.ref
            if ref not in self.coords: self.coords[ref] = (loc.lat, loc.lon)
            if prev is not None:
                (la1, lo1), (la2, lo2) = self.coords[prev], self.coords[ref]
                r = math.radians
                h = math.sin(r(la2 - la1) / 2) ** 2 + math.cos(r(la1)) * math.cos(r(la2)) * math.sin(r(lo2 - lo1) / 2) ** 2
                d = 12742000 * math.asin(math.sqrt(h))
                self.u.append(prev); self.v.append(ref); self.L.append(d); self.T.append(d / (sp / 3.6))
            prev = ref
        self.n += 1
        if self.n % 200000 == 0: print('ways', self.n, 'edges', len(self.u), flush=True)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'reports', 'access', 'graph.npz')
os.makedirs(os.path.dirname(dst), exist_ok=True)
t0 = time.time()
h = H()
h.apply_file(src, locations=True, idx='flex_mem')
print('read in', round(time.time() - t0), 's; ways', h.n, 'edges', len(h.u), 'nodes', len(h.coords), flush=True)
ids = np.fromiter(h.coords.keys(), dtype=np.int64, count=len(h.coords))
ll = np.array(list(h.coords.values()), dtype=np.float64)
order = np.argsort(ids); ids = ids[order]; ll = ll[order]
u = np.searchsorted(ids, np.array(h.u, dtype=np.int64)); v = np.searchsorted(ids, np.array(h.v, dtype=np.int64))
meta = {'source': os.path.basename(src), 'source_date': time.strftime('%Y-%m-%d', time.localtime(os.path.getmtime(src))),
        'built_at': time.strftime('%Y-%m-%d'), 'nodes': int(len(ids)), 'edges': len(h.u)}
np.savez_compressed(dst, meta=json.dumps(meta), lat=ll[:, 0], lon=ll[:, 1], u=u.astype(np.int32), v=v.astype(np.int32),
                    L=np.array(h.L, dtype=np.float32), T=np.array(h.T, dtype=np.float32))
print('saved in', round(time.time() - t0), 's', flush=True)
