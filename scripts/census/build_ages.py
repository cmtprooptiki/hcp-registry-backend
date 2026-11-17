#!/usr/bin/env python3
"""Population by 5-year age group (census 2021, ΕΛΣΤΑΤ) of every regional unit (Π.Ε.) and municipality (Δήμος)
-> data/population_ages.json, served by GET /population/ages for the «Πληθυσμός ανά ηλικία» view.

    python3 scripts/census/build_ages.py SAM03_C01.xlsx [--out data/population_ages.json]

Input: statistics.gr, Απογραφή Πληθυσμού-Κατοικιών 2021, SAM03 «Δημογραφικά χαρακτηριστικά» ->
Γ01 Μόνιμος πληθυσμός κατά φύλο και ομάδες ηλικιών. Οικισμοί (the same file as build_census.py).
The figures are ΕΛΣΤΑΤ's own rows of each regional unit / municipality (not sums of settlements).
Matching: the 2 last digits of the ΕΛΣΤΑΤ regional unit code (5 digits) are PerifereiakesEnotites.code; the
4 last digits of the municipality code (7 digits) are Dimoi.code.
Each area: [total, 0-4, 5-9, ..., 70-74, 75+] for both sexes (t), men (m) and women (f).
Needs: pip install openpyxl
"""
import argparse, json, os, time
import openpyxl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('ages')
ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'population_ages.json'))
args = ap.parse_args()

GROUPS = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49',
          '50-54', '55-59', '60-64', '65-69', '70-74', '75+']
ws = openpyxl.load_workbook(args.ages, read_only=True, data_only=True).worksheets[0]
rows = list(ws.iter_rows(values_only=True))
# the header row of the groups must be the one the columns below assume
head = [str(c).replace(' ', '') if c is not None else '' for c in rows[5][4:20]]
if head != [g.replace(' ', '') for g in GROUPS]:
    raise SystemExit(f'unexpected age groups in the file: {head}')

num = lambda v: int(float(v)) if v not in (None, '', '-') else 0
levels = {'pe': {}, 'dimos': {}}
country = None
for r in rows[6:]:
    if not isinstance(r[0], int): continue
    t, m, f = [num(v) for v in r[3:20]], [num(v) for v in r[20:37]], [num(v) for v in r[37:54]]
    rec = {'name': str(r[2]).strip(), 't': t, 'm': m, 'f': f}
    code = str(r[1]).strip()
    if r[0] == 0: country = rec
    elif r[0] == 4: levels['pe'][code[-2:]] = rec
    elif r[0] == 5: levels['dimos'][code[-4:]] = rec

out = {
    'about': 'Population by 5-year age group of every regional unit (pe, by PerifereiakesEnotites.code) and municipality '
             '(dimos, by Dimoi.code), and of the whole country: t / m / f = both sexes / men / women, each '
             '[total, then the groups]. Made by scripts/census/build_ages.py; served by GET /population/ages.',
    'source': 'statistics.gr, Απογραφή Πληθυσμού-Κατοικιών 2021: SAM03 Γ01 (μόνιμος πληθυσμός κατά φύλο και ομάδες ηλικιών)',
    'generated_at': time.strftime('%Y-%m-%d'),
    'groups': GROUPS,
    'country': country,
    'pe': levels['pe'],
    'dimos': levels['dimos'],
}
with open(args.out, 'w') as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
print(f"{args.out}: {len(levels['pe'])} regional units, {len(levels['dimos'])} municipalities")
