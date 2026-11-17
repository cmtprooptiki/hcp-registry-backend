#!/usr/bin/env python3
"""Remote settlements -> the Health Centre (Κ.Υ.) or Multipurpose Regional Clinic (Π.Π.Ι.) that would serve them in
the programme, with their population aged 50+ (census 2021). Writes data/program_units.json, served by
GET /access/program-units for the «Πρόγραμμα: μονάδες & οικισμοί» tab.

    python3 scripts/access/compute_program_units.py SAM03_C01.xlsx [--graph reports/access/graph.npz]
        [--providers reports/providers_for_access.json] [--out data/program_units.json]

Eligible settlements: those of the remote-areas view with the programme's criteria (data/settlement_access.json):
inhabited, fewer than POP_MAX residents and more than KM by road from every Hospital / Κ.Υ. / ΤΟΜΥ / Π.Π.Ι.
(or no road to one at all).

Units: the Κ.Υ., the Π.Π.Ι. and the hospitals that are also a Health Centre (Γ.Ν. - Κ.Υ., e.g. Κυθήρων, Λήμνου,
Φιλιατών: the name says Κ.Υ. / Κέντρο Υγείας).
Assignment (an ESTIMATE: there are no official areas of responsibility of the Κ.Υ. / Π.Π.Ι. in the data):
each eligible settlement goes to exactly ONE unit, so no population is counted twice:
  1. the unit nearest by road (roads only, no ferries, joins of unconnected road pieces as in roadnet.py);
  2. a settlement with no road to any unit (an island without one) goes to the unit nearest in a straight line
     (usually the one on the coast opposite or on the main island), marked rule = 'air'.
Population 50+: ΕΛΣΤΑΤ SAM03 Γ01, settlement rows (the 10 last digits of the code = Oikismoi.census_code), groups
50-54, 55-59, 60-64, 65-69, 70-74, 75+ of both sexes; null when the settlement is missing from that table.
"""
import argparse, json, os, re, time
import numpy as np
import openpyxl
from shapely.geometry import shape, Point
from shapely.prepared import prep
from roadnet import RoadNet, hav, providers_fingerprint, SNAP_SPEED

POP_MAX, KM = 10000, 14.0
UNIT_TYPES = ('Health Centre', 'Multipurpose Regional Clinic')
HOSPITAL_HC = re.compile(r'Κ\.?\s?Υ\.?|Κέντρο Υγείας')   # hospitals that are also a Health Centre
is_unit = lambda p: p['type'] in UNIT_TYPES or (p['type'] == 'Hospital' and bool(HOSPITAL_HC.search(p['name'])))
GROUPS = ['50-54', '55-59', '60-64', '65-69', '70-74', '75+']
NO_BRIDGE = {3219, 4413}   # as compute_access.py: settlements whose road piece is never joined

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('ages', help='ΕΛΣΤΑΤ SAM03 Γ01 (settlements) .xlsx')
ap.add_argument('--graph', default=os.path.join(ROOT, 'reports', 'access', 'graph.npz'))
ap.add_argument('--providers', default=os.path.join(ROOT, 'reports', 'providers_for_access.json'))
ap.add_argument('--data', default=os.path.join(ROOT, 'data'))
ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'program_units.json'))
args = ap.parse_args()
data = lambda f: json.load(open(os.path.join(args.data, f)))
t0 = time.time()
log = lambda *a: print(f'[{round(time.time() - t0):>4}s]', *a, flush=True)

# --- ages 50+ of every settlement ------------------------------------------------------------------------------------
rows = list(openpyxl.load_workbook(args.ages, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
head = [str(c).replace(' ', '') if c is not None else '' for c in rows[5][14:20]]
if head != GROUPS: raise SystemExit(f'unexpected age groups: {head}')
num = lambda v: int(float(v)) if v not in (None, '', '-') else 0
ages = {str(r[1]).strip().split('.')[0][-10:]: [num(v) for v in r[14:20]] for r in rows[6:] if r[0] == 8}
log(len(ages), 'settlements in the age table')

# --- eligible settlements ----------------------------------------------------------------------------------------------
sett = {s['id']: s for s in data('oikismoi.json')}
access = {r['id']: r for r in data('settlement_access.json')['records']}
eligible = [s for s in sett.values() if s['population'] and s['population'] < POP_MAX
            and (access.get(s['id'], {}).get('road_km') is None or access[s['id']]['road_km'] > KM)]
log(len(eligible), 'eligible settlements,', sum(s['population'] for s in eligible), 'residents')

# --- units and places --------------------------------------------------------------------------------------------------
prov = json.load(open(args.providers))
units = [p for p in prov if is_unit(p)]
dimoi = {d['code']: d for d in data('dimoi.json')}
pe_names = {p['code']: p['name'] for p in data('perifereiakes_enotites.json')}
shapes = [(d['code'], prep(shape(d['geometry'])), shape(d['geometry'])) for d in dimoi.values()]
def dimos_of(la, lo):
    pt = Point(lo, la)
    for code, pg, _ in shapes:
        if pg.contains(pt): return code
    return min(shapes, key=lambda s: s[2].distance(pt))[0]

net = RoadNet(args.graph, os.path.join(args.data, 'dimoi.json'), log)
u_node, u_snap = net.snap([u['lat'] for u in units], [u['lon'] for u in units])
s_node, s_snap = net.snap([s['lat'] for s in eligible], [s['lon'] for s in eligible])
net.build(s_node, [s_node[i] for i, s in enumerate(eligible) if s['id'] in NO_BRIDGE])
dist, tmin, which = net.nearest(u_node, np.arange(len(units)), s_node)
log('shortest roads done')

records, used = [], set()
for i, s in enumerate(eligible):
    w = which[i]
    if np.isfinite(dist[i]) and w >= 0:
        u = units[w]; rule = 'road'
        km = round(float(dist[i] + s_snap[i] + u_snap[w]), 2)
        mins = round(float(tmin[i] + (s_snap[i] + u_snap[w]) / SNAP_SPEED * 60), 1)
    else:
        u = min(units, key=lambda x: hav(s['lat'], s['lon'], x['lat'], x['lon'])); rule = 'air'; km = mins = None
    used.add(u['key'])
    a = ages.get(s.get('census_code'))
    acc = access.get(s['id'], {})
    records.append({'id': s['id'], 'name': s['name'], 'dimos_code': s['dimos_code'], 'population': s['population'],
                    'unit': u['key'], 'rule': rule, 'km': km, 'min': mins,
                    'air_km': round(hav(s['lat'], s['lon'], u['lat'], u['lon']), 2),
                    'status': 'pi' if acc.get('pi_road_km') is not None and acc['pi_road_km'] <= KM else 'none',
                    'a50': a})
unit_places = {}
for u in units:
    if u['key'] in used:
        d = dimos_of(u['lat'], u['lon'])
        unit_places[u['key']] = {'dimos_code': d, 'dimos': dimoi[d]['name'], 'pe': pe_names.get(dimoi[d]['pe_code'] or '', 'ΑΓΙΟ ΟΡΟΣ'),
                                 'hospital_hc': u['type'] == 'Hospital'}
sett_pe = {code: pe_names.get(d['pe_code'] or '', 'ΑΓΙΟ ΟΡΟΣ') for code, d in dimoi.items()}

out = {
    'about': 'Eligible (remote) settlements of the programme, each assigned to ONE Health Centre or Multipurpose Regional '
             'Clinic (unit = provider id): the nearest by road, or in a straight line when no road reaches one (rule air). '
             'An estimate: there are no official areas of responsibility. a50 = residents 50-54, 55-59, 60-64, 65-69, '
             '70-74, 75+ (census 2021). Made by scripts/access/compute_program_units.py; served by GET /access/program-units.',
    'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
    'graph': net.meta,
    'criteria': {'pop_max': POP_MAX, 'km': KM, 'from': 'data/settlement_access.json'},
    'groups': GROUPS,
    'source_ages': 'statistics.gr, Απογραφή Πληθυσμού-Κατοικιών 2021: SAM03 Γ01 (οικισμοί)',
    'providers_fingerprint': providers_fingerprint(prov),
    'units': unit_places,
    'dimos_names': {code: d['name'] for code, d in dimoi.items()},
    'dimos_pe': sett_pe,
    'records': records,
}
with open(args.out, 'w') as f:
    f.write('{\n')
    for k in [k for k in out if k != 'records']:
        f.write(f'"{k}": {json.dumps(out[k], ensure_ascii=False)},\n')
    f.write('"records": [\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in records) + '\n]\n}\n')
log('written', args.out, len(records), 'settlements to', len(used), 'units;', sum(r['rule'] == 'air' for r in records),
    'by straight line;', sum(r['a50'] is None for r in records), 'without age figures')
