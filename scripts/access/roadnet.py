"""Road network shared by compute_access.py and compute_hc_hospitals.py: the graph made by build_graph.py, the
snapping of points (settlements, providers) to it, the joins of road pieces that OpenStreetMap leaves unconnected,
and the multi-source shortest roads. Only roads count: no ferries.

Road pieces that OpenStreetMap leaves unconnected to the network (a short unlabelled dirt road, a gate) are joined
to the nearest large network when the gap is at most BRIDGE_MAX_KM, the join runs over land (the municipality
polygons of data/dimoi.json, so never over sea) and the piece does not hold a point listed as never joined.
The join counts BRIDGE_DETOUR times its straight length.
"""
import hashlib, json, math
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
from scipy.spatial import cKDTree
from shapely.geometry import shape, LineString
from shapely.ops import unary_union
from shapely.prepared import prep

MIN_COMPONENT = 25        # snap to road pieces with at least this many nodes (not to a lone driveway)
SMALL_FALLBACK_KM = 2.0   # ...unless no such piece is within this distance (small islands)
BIG_NETWORK = 5000        # networks with at least this many nodes (mainland, Crete, Evia, Rhodes, ...)
BRIDGE_MAX_KM = 2.0
BRIDGE_DETOUR = 1.5
BRIDGE_SPEED = 20         # km/h over a join
SNAP_SPEED = 30           # km/h from a point to the road

C = math.cos(math.radians(38.5))
def xy(la, lo):
    return np.column_stack([np.asarray(lo) * 111.32 * C, np.asarray(la) * 110.57])

def hav(a, b, c, d):
    r = math.radians; h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

def providers_fingerprint(providers):
    """Same as providersFingerprint() of utils/setupSettlementAccess.js, over the given providers: tells the
    backend whether they changed since a computation (then the app says that it must be redone)."""
    lines = sorted((p['key'], f"{p['key']}|{p['type']}|{p['lat']:.5f}|{p['lon']:.5f}") for p in providers)
    return hashlib.sha1('\n'.join(l for _, l in lines).encode('utf8')).hexdigest()


class RoadNet:
    def __init__(self, graph_path, municipalities_path, log=print):
        g = np.load(graph_path)
        self.lat, self.lon = g['lat'], g['lon']
        u, v, L, T = g['u'], g['v'], g['L'], g['T']
        self.n = len(self.lat)
        keep = u != v
        self.u, self.v = u[keep], v[keep]
        self.L, self.T = L[keep].astype(np.float64), T[keep].astype(np.float64)
        self.meta = json.loads(str(g['meta'])) if 'meta' in g.files else {}
        ones = np.ones(len(self.u) * 2, dtype=np.int8)
        ncomp, self.comp = connected_components(
            csr_matrix((ones, (np.concatenate([self.u, self.v]), np.concatenate([self.v, self.u]))), shape=(self.n, self.n)),
            directed=False)
        self.size = np.bincount(self.comp)
        log('graph', self.n, 'nodes', len(self.u), 'edges', ncomp, 'pieces')
        self.municipalities_path = municipalities_path
        self.log = log
        big = self.size[self.comp] >= MIN_COMPONENT
        self.idx_big = np.where(big)[0]
        self.tree_big = cKDTree(xy(self.lat[self.idx_big], self.lon[self.idx_big]))
        self.tree_all = cKDTree(xy(self.lat, self.lon))
        self.bridged = set()
        self.GL = self.GT = None

    def snap(self, la, lo):
        """Nearest road node of each point and the distance to it (km)."""
        la = np.asarray(la, dtype=float); lo = np.asarray(lo, dtype=float)
        d1, i1 = self.tree_big.query(xy(la, lo)); i1 = self.idx_big[i1]
        d2, i2 = self.tree_all.query(xy(la, lo))
        use_small = (d1 > SMALL_FALLBACK_KM) & (d2 < d1)
        return np.where(use_small, i2, i1), np.where(use_small, d2, d1)

    def build(self, point_nodes, no_bridge_nodes=()):
        """Joins the unconnected road pieces that hold one of point_nodes (except those of no_bridge_nodes) and
        makes the graph matrices. Returns the set of joined pieces (compare with piece_of())."""
        lat, lon, comp, size = self.lat, self.lon, self.comp, self.size
        dimoi = json.load(open(self.municipalities_path))
        land = prep(unary_union([shape(d['geometry']) for d in dimoi]).buffer(0.0005))   # ~50 m for the coastline
        idx_net = np.where(size[comp] >= BIG_NETWORK)[0]
        tree_net = cKDTree(xy(lat[idx_net], lon[idx_net]))
        no_bridge = {int(comp[nd]) for nd in no_bridge_nodes}
        cand = sorted({int(c) for c in comp[np.asarray(point_nodes)] if size[c] < BIG_NETWORK} - no_bridge)
        bu, bv, bL, bT = [], [], [], []
        for c in cand:
            nodes = np.where(comp == c)[0]
            d, k = tree_net.query(xy(lat[nodes], lon[nodes]))
            j = int(np.argmin(d))
            if d[j] > BRIDGE_MAX_KM: continue
            a, b = int(nodes[j]), int(idx_net[k[j]])
            if not land.contains(LineString([(lon[a], lat[a]), (lon[b], lat[b])])): continue
            km = float(d[j]) * BRIDGE_DETOUR
            bu.append(a); bv.append(b); bL.append(km * 1000); bT.append(km / BRIDGE_SPEED * 3600)
            self.bridged.add(c)
        self.log(len(cand), 'unconnected pieces with points,', len(self.bridged), 'joined to a network')
        u = np.concatenate([self.u, bu]).astype(np.int64); v = np.concatenate([self.v, bv]).astype(np.int64)
        L = np.concatenate([self.L, bL]); T = np.concatenate([self.T, bT])
        rows = np.concatenate([u, v]); cols = np.concatenate([v, u])
        self.GL = csr_matrix((np.concatenate([L, L]) / 1000.0, (rows, cols)), shape=(self.n, self.n))   # km
        self.GT = csr_matrix((np.concatenate([T, T]) / 60.0, (rows, cols)), shape=(self.n, self.n))     # minutes
        return self.bridged

    def piece_of(self, node):
        return int(self.comp[node])

    def nearest(self, source_nodes, source_ids, target_nodes):
        """Shortest road (km, minutes) from each target node to the nearest source node, and the id of that
        source (-1 when there is no road connection)."""
        dist, _, src = dijkstra(self.GL, directed=False, indices=source_nodes, min_only=True, return_predecessors=True)
        tmin = dijkstra(self.GT, directed=False, indices=source_nodes, min_only=True)
        node_to_src = {}
        for k, nd in enumerate(source_nodes): node_to_src.setdefault(int(nd), source_ids[k])
        s = src[target_nodes]
        which = np.array([node_to_src.get(int(x), -1) if x >= 0 else -1 for x in s])
        return dist[target_nodes], tmin[target_nodes], which
