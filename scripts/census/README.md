# Census 2021 figures of the settlements

`data/settlement_census.json` holds, for every settlement of `data/oikismoi.json`, figures of the
2021 census (ΕΛΣΤΑΤ) used by the map's «Απομακρυσμένες περιοχές» view:

| Field | What | ΕΛΣΤΑΤ table |
|---|---|---|
| `age65`, `age75` | residents aged 65+ / 75+ (`pop2021` = total of that table) | SAM03 Γ01 (ομάδες ηλικιών, οικισμοί) |
| `dw_occupied`, `dw_vacant`, `dw_holiday` | κανονικές κατοικίες κατοικούμενες / κενές; εξοχικές + δευτερεύουσες (seasonal population) | SAM05 Γ01 (κατάσταση κατοικίας, οικισμοί) |
| `mountain`, `urban` | of the settlement's community: Π πεδινή / Η ημιορεινή / Ο ορεινή; 1 αστική / 2 αγροτική | SAM08 (αστικότητα, ορεινότητα, έκταση) |

`utils/setupSettlementCensus.js` loads it into `SettlementCensus` at startup (once per file version) and
`GET /access/settlements` serves it with the road distances.

## Rebuild

Download the three tables from statistics.gr (Απογραφή Πληθυσμού-Κατοικιών 2021 → «Δημογραφικά
χαρακτηριστικά» SAM03 → Γ01; «Χαρακτηριστικά κατοικιών - νοικοκυριών» SAM05 → Γ01; «Αστικότητα –
Ορεινότητα – Έκταση» SAM08), then:

```bash
python3 -m pip install openpyxl xlrd
python3 scripts/census/build_census.py SAM03_C01.xlsx SAM05_C01.xlsx SAM08_01.xls
```

Settlements are matched by code: the 10 last digits of the ΕΛΣΤΑΤ settlement code are
`Oikismoi.census_code`, the 8 last digits of the community code are `Oikismoi.koinotita_code`.
