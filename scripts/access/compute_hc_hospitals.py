#!/usr/bin/env python3
"""Road distance of every Health Centre (Κ.Υ.) to its nearest Hospital, on the road graph of build_graph.py
(roads only, no ferries; joins of unconnected road pieces as in roadnet.py). Writes
data/health_centre_hospitals.json, served by GET /access/health-centres for the «Κ.Υ. – Νοσοκομεία» view.

    python3 scripts/access/compute_hc_hospitals.py [--graph reports/access/graph.npz]
        [--providers reports/providers_for_access.json] [--out data/health_centre_hospitals.json]

Besides the distance, each Health Centre gets the facts the view's exclusions use (the view applies them, so
they can be switched on and off without recomputing):
  capital  the capital of its regional unit (Π.Ε.), when the Κ.Υ. is in that town: in the municipal unit of the
           capital and within CAPITAL_KM of its ΕΛΣΤΑΤ point (a municipal unit can be a whole island);
  urban    'Αθήνα' / 'Θεσσαλονίκη' when it is in the urban area (πολεοδομικό συγκρότημα) of the city: URBAN below.
For a Κ.Υ. with no road to any hospital (islands) air_km / air_hospital give the nearest one in a straight line.
"""
import argparse, json, os, time
import numpy as np
from shapely.geometry import shape, Point
from shapely.prepared import prep
from roadnet import RoadNet, hav, providers_fingerprint, SNAP_SPEED

HC, HOSPITAL = 'Health Centre', 'Hospital'
CAPITAL_KM = 5.0
# capital of every regional unit (Π.Ε.): its ΕΛΣΤΑΤ settlement name (the Νήσων unit has its seat in Πειραιάς)
CAPITALS = {
    '01': 'Κομοτηνή', '02': 'Δράμα', '03': 'Αλεξανδρούπολις', '04': 'Θάσος', '05': 'Καβάλα', '06': 'Ξάνθη',
    '07': 'Θεσσαλονίκη', '08': 'Βέροια', '09': 'Κιλκίς', '10': 'Έδεσσα', '11': 'Κατερίνη', '12': 'Σέρραι',
    '13': 'Πολύγυρος', '14': 'Κοζάνη', '15': 'Γρεβενά', '16': 'Καστοριά', '17': 'Φλώρινα', '18': 'Ιωάννινα',
    '19': 'Άρτα', '20': 'Ηγουμενίτσα', '21': 'Πρέβεζα', '22': 'Λάρισα', '23': 'Καρδίτσα', '24': 'Βόλος',
    '25': 'Σκόπελος', '26': 'Τρίκαλα', '27': 'Λαμία', '28': 'Λεβάδεια', '29': 'Χαλκίς', '30': 'Καρπενήσιον',
    '31': 'Άμφισσα', '32': 'Κέρκυρα', '33': 'Ζάκυνθος', '34': 'Ιθάκη', '35': 'Αργοστόλιον', '36': 'Λευκάς',
    '37': 'Πάτραι', '38': 'Μεσολόγγιον', '39': 'Πύργος', '40': 'Τρίπολις', '41': 'Ναύπλιον', '42': 'Κόρινθος',
    '43': 'Σπάρτη', '44': 'Καλαμάτα', '45': 'Αθήναι', '46': 'Αμαρούσιον', '47': 'Περιστέριον', '48': 'Καλλιθέα',
    '49': 'Παλλήνη', '50': 'Ελευσίς', '51': 'Πειραιεύς', '52': ('51', 'Πειραιεύς'), '53': 'Μυτιλήνη',
    '54': 'Άγιος Κήρυκος', '55': 'Μύρινα', '56': 'Σάμος', '57': 'Χίος', '58': 'Ερμούπολις', '59': 'Άνδρος',
    '60': 'Θήρα', '61': 'Κάλυμνος (Ποθαία)', '62': 'Κάρπαθος', '63': 'Ιουλίδα', '64': 'Κως', '65': 'Μήλος', '66': 'Μύκονος',
    '67': 'Νάξος', '68': 'Πάρος', '69': 'Ρόδος', '70': 'Τήνος', '71': 'Ηράκλειον', '72': 'Άγιος Νικόλαος',
    '73': 'Ρέθυμνον', '74': 'Χανία',
}
# urban areas (πολεοδομικά συγκροτήματα): whole regional units, municipalities and municipal units
URBAN = {
    'Αθήνα': {
        'pe': ['45', '46', '47', '48', '51'],   # the four sectors of Athens and Piraeus
        'dimoi': ['4901', '4902'],              # Αχαρνών, Βάρης - Βούλας - Βουλιαγμένης
        'de': ['490301', '490802', '490901', '490902', '490903', '500200', '500501', '500502'],
        # Αγίου Στεφάνου, Γλυκών Νερών, Γέρακα, Ανθούσας, Παλλήνης, Ασπροπύργου, Άνω Λιοσίων, Ζεφυρίου
    },
    'Θεσσαλονίκη': {
        'pe': [],
        'dimoi': ['0701', '0702', '0707', '0708', '0710', '0711'],
        # Θεσσαλονίκης, Αμπελοκήπων - Μενεμένης, Καλαμαριάς, Κορδελιού - Ευόσμου, Νεάπολης - Συκεών, Παύλου Μελά
        'de': ['071201', '071202', '071401', '070601', '070401'],
        # Πανοράματος, Πυλαίας, Ωραιοκάστρου, Θέρμης, Εχεδώρου (Διαβατά, Σίνδος, Καλοχώρι)
    },
}

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = lambda f: os.path.join(ROOT, 'data', f)
ap = argparse.ArgumentParser()
ap.add_argument('--graph', default=os.path.join(ROOT, 'reports', 'access', 'graph.npz'))
ap.add_argument('--providers', default=os.path.join(ROOT, 'reports', 'providers_for_access.json'))
ap.add_argument('--data', default=os.path.join(ROOT, 'data'), help='folder of dimoi.json, dimotikes_enotites.json, ...')
ap.add_argument('--out', default=D('health_centre_hospitals.json'))
args = ap.parse_args()
data = lambda f: json.load(open(os.path.join(args.data, f)))

t0 = time.time()
log = lambda *a: print(f'[{round(time.time() - t0):>4}s]', *a, flush=True)

prov = [p for p in json.load(open(args.providers)) if p['type'] in (HC, HOSPITAL)]
hcs = [p for p in prov if p['type'] == HC]
hosp = [p for p in prov if p['type'] == HOSPITAL]
dimoi = {d['code']: d for d in data('dimoi.json')}
units = data('dimotikes_enotites.json')
pe_names = {p['code']: p['name'] for p in data('perifereiakes_enotites.json')}
settlements = data('oikismoi.json')

# --- place of every Health Centre (municipal unit polygon) and its capital / urban area -------------------------
shapes = [(u, prep(shape(u['geometry'])), shape(u['geometry'])) for u in units]
def unit_of(la, lo):
    pt = Point(lo, la)
    for u, pg, _ in shapes:
        if pg.contains(pt): return u
    return min(shapes, key=lambda s: s[2].distance(pt))[0]   # on the coast, just outside every polygon
pe_of = lambda dimos_code: dimoi[dimos_code]['pe_code'] or ''   # Άγιο Όρος has no regional unit

capitals = {}
for pe, spec in CAPITALS.items():
    in_pe, name = spec if isinstance(spec, tuple) else (pe, spec)
    found = [s for s in settlements if pe_of(s['dimos_code']) == in_pe and s['name'] == name]
    if not found: raise SystemExit(f'capital of {pe} not found: {name}')
    capitals[pe] = max(found, key=lambda s: s['population'] or 0)

def urban_of(pe, dimos, de):
    for name, u in URBAN.items():
        if pe in u['pe'] or dimos in u['dimoi'] or de in u['de']: return name
    return None

# --- roads --------------------------------------------------------------------------------------------------------
net = RoadNet(args.graph, os.path.join(args.data, 'dimoi.json'), log)
h_node, h_snap = net.snap([p['lat'] for p in hosp], [p['lon'] for p in hosp])
c_node, c_snap = net.snap([p['lat'] for p in hcs], [p['lon'] for p in hcs])
bridged = net.build(c_node)
dist, tmin, which = net.nearest(h_node, np.arange(len(hosp)), c_node)
log('shortest roads done')

records = []
for i, p in enumerate(hcs):
    u = unit_of(p['lat'], p['lon'])
    pe = pe_of(u['dimos_code'])
    cap = capitals.get(pe)
    cap_km = round(hav(p['lat'], p['lon'], cap['lat'], cap['lon']), 2) if cap else None
    rec = {'id': p['key'], 'pe_code': pe, 'pe': pe_names.get(pe, 'ΑΓΙΟ ΟΡΟΣ'), 'dimos_code': u['dimos_code'],
           'dimos': dimoi[u['dimos_code']]['name'], 'de_code': u['code'], 'de': u['label'],
           'capital': cap['name'] if cap and cap['de_code'] == u['code'] and cap_km <= CAPITAL_KM else None,
           'capital_km': cap_km, 'urban': urban_of(pe, u['dimos_code'], u['code']),
           'road_km': None, 'road_min': None, 'hospital': None, 'straight_km': None}
    w = which[i]
    if np.isfinite(dist[i]) and w >= 0:
        h = hosp[w]
        rec.update(road_km=round(float(dist[i] + c_snap[i] + h_snap[w]), 2),
                   road_min=round(float(tmin[i] + (c_snap[i] + h_snap[w]) / SNAP_SPEED * 60), 1),
                   hospital=h['key'], straight_km=round(hav(p['lat'], p['lon'], h['lat'], h['lon']), 2))
    air = min(hosp, key=lambda h: hav(p['lat'], p['lon'], h['lat'], h['lon']))
    rec.update(air_hospital=air['key'], air_km=round(hav(p['lat'], p['lon'], air['lat'], air['lon']), 2),
               snap_km=round(float(c_snap[i]), 2))
    if net.piece_of(c_node[i]) in bridged: rec['bridged'] = True
    records.append(rec)

out = {
    'about': 'Road distance (km, minutes) of every Health Centre to the nearest Hospital (hospital = provider id; '
             'null = no road connection, then air_km / air_hospital = nearest in a straight line), with its regional '
             'unit, municipality and municipal unit, the capital of its regional unit when it is in that town (capital) '
             'and the urban area it is in (urban). Roads only, no ferries. Made by scripts/access/compute_hc_hospitals.py; '
             'served by GET /access/health-centres.',
    'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
    'graph': net.meta,
    'providers': {HC: len(hcs), HOSPITAL: len(hosp)},
    'providers_fingerprint': providers_fingerprint(prov),
    'rules': {'capital_km': CAPITAL_KM,
              'capitals': {pe: {'name': s['name'], 'settlement_id': s['id'], 'de_code': s['de_code']} for pe, s in capitals.items()},
              'urban': URBAN},
    'records': records,
}
with open(args.out, 'w') as f:
    f.write('{\n')
    for k in ['about', 'generated_at', 'graph', 'providers', 'providers_fingerprint', 'rules']:
        f.write(f'"{k}": {json.dumps(out[k], ensure_ascii=False)},\n')
    f.write('"records": [\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in records) + '\n]\n}\n')
log('written', args.out, len(records), 'Health Centres,', sum(r['road_km'] is None for r in records), 'without road to a hospital,',
    sum(bool(r['capital']) for r in records), 'in a capital,', sum(bool(r['urban']) for r in records), 'in an urban area')
