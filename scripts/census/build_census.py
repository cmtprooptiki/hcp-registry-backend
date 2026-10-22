#!/usr/bin/env python3
"""Census 2021 (ΕΛΣΤΑΤ) figures of every settlement -> data/settlement_census.json, loaded at startup by
utils/setupSettlementCensus.js and served with the road distances (GET /access/settlements).

    python3 scripts/census/build_census.py SAM03_C01.xlsx SAM05_C01.xlsx SAM08_01.xls [--out data/settlement_census.json]

Inputs (statistics.gr, Απογραφή Πληθυσμού-Κατοικιών 2021):
  SAM03 "Δημογραφικά χαρακτηριστικά" -> Γ01 Μόνιμος πληθυσμός κατά φύλο και ομάδες ηλικιών. Οικισμοί
  SAM05 "Χαρακτηριστικά κατοικιών - νοικοκυριών" -> Γ01 Κανονικές κατοικίες κατά κατάσταση κατοικίας και
        μη κανονικές κατοικίες. Οικισμοί
  SAM08 "Αστικότητα – Ορεινότητα – Έκταση" -> Μόνιμος πληθυσμός κατά αστικότητα, ορεινότητα και έκταση
        (urbanity / mountainousness are given per community, Δημοτική / Τοπική Κοινότητα)

Matching: the 10 last digits of the ΕΛΣΤΑΤ settlement code (13 digits) are Oikismoi.census_code; the 8 last
digits of the community code (11 digits) are Oikismoi.koinotita_code.
Needs: pip install openpyxl xlrd
"""
import argparse, json, os, time
import openpyxl, xlrd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('ages'); ap.add_argument('dwellings'); ap.add_argument('mountains')
ap.add_argument('--settlements', default=os.path.join(ROOT, 'data', 'oikismoi.json'))
ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'settlement_census.json'))
args = ap.parse_args()

def rows(path):
    if path.endswith('.xls'):
        sh = xlrd.open_workbook(path).sheet_by_index(0)
        for i in range(sh.nrows): yield sh.row_values(i)
    else:
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        for r in ws.iter_rows(values_only=True): yield list(r)

def level(r):
    try: return int(float(str(r[0]).strip()))
    except (ValueError, TypeError): return None

def code(r): return str(r[1]).strip().split('.')[0]
def num(v):
    s = str(v).strip() if v is not None else ''
    return int(float(s)) if s not in ('', '-', 'None') else 0

# ages: [total, 0-4, 5-9, ..., 60-64, 65-69, 70-74, 75+] of both sexes (columns 3..19)
ages = {code(r)[-10:]: [num(v) for v in r[3:20]] for r in rows(args.ages) if level(r) == 8}
# dwellings: total, regular, occupied, vacant, for rent, for sale, holiday (εξοχικές), secondary (δευτερεύουσες), other, non-regular
dwell = {code(r)[-10:]: [num(v) for v in r[3:13]] for r in rows(args.dwellings) if level(r) == 8}
# communities: urbanity 1 = urban, 2 = rural; mountainousness Π (lowland) / Η (semi-mountainous) / Ο (mountainous)
comm = {}
for r in rows(args.mountains):
    if level(r) == 7:
        comm[code(r)[-8:]] = {'urban': str(r[4]).strip().split('.')[0] or None, 'mountain': str(r[5]).strip() or None}

records, missing = [], 0
for s in json.load(open(args.settlements)):
    cc = s.get('census_code')
    a, d = ages.get(cc), dwell.get(cc)
    c = comm.get(s.get('koinotita_code') or '', {})
    if not a and not c:
        missing += 1
        continue
    rec = {'id': s['id']}
    if a:
        rec.update(pop2021=a[0], age65=a[14] + a[15] + a[16], age75=a[16])
    if d:
        rec.update(dw_occupied=d[2], dw_vacant=d[3], dw_holiday=d[6] + d[7])
    if c.get('mountain') in ('Π', 'Η', 'Ο'): rec['mountain'] = c['mountain']
    if c.get('urban') in ('1', '2'): rec['urban'] = int(c['urban'])
    records.append(rec)

out = {
    'about': 'Census 2021 (ΕΛΣΤΑΤ) figures of the settlements of data/oikismoi.json: pop2021 (μόνιμος πληθυσμός of the '
             'age table), age65 / age75 (aged 65+ / 75+), dw_occupied / dw_vacant (κανονικές κατοικίες κατοικούμενες / '
             'κενές), dw_holiday (εξοχικές + δευτερεύουσες, a sign of seasonal population), mountain (of its community: '
             'Π πεδινή, Η ημιορεινή, Ο ορεινή), urban (of its community: 1 αστική, 2 αγροτική). '
             'Made by scripts/census/build_census.py; loaded by utils/setupSettlementCensus.js.',
    'source': 'statistics.gr, Απογραφή Πληθυσμού-Κατοικιών 2021: SAM03 Γ01, SAM05 Γ01, SAM08',
    'generated_at': time.strftime('%Y-%m-%d'),
    'records': records,
}
with open(args.out, 'w') as f:
    f.write('{\n')
    for k in ['about', 'source', 'generated_at']:
        f.write(f'"{k}": {json.dumps(out[k], ensure_ascii=False)},\n')
    f.write('"records": [\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in records) + '\n]\n}\n')
print(f'{args.out}: {len(records)} settlements ({missing} without census figures)')
