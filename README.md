# HCProviders registry backend

Express + Sequelize API for healthcare providers (HCProviders), their info (hcpInfo) and the users assigned to them, backed by MySQL.

## Setup

1. Create an empty MySQL database (utf8mb4 is required for the Greek names):

   ```sql
   CREATE DATABASE hcp_registry CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Copy `.env.example` to `.env` and fill in the connection settings:

   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=hcp_registry
   DB_USER=root
   DB_PASSWORD=
   DB_SSL=false        # set to true for hosted MySQL that requires SSL
   ```

3. `npm install` and `npm start`. Tables are created automatically on startup (`db.sync()`).

## Regions (Περιφέρειες), regional units (Περιφερειακές Ενότητες) and municipalities (Δήμοι)

Every provider has a municipality (`dimos`, `dimos_code`) that the backend finds from its `lat`/`lon`, using the boundaries of the 333 municipalities in `data/dimoi.json` (source: ΕΛΣΤΑΤ, from the "Χάρτης δομών ΠΦΥ" map). The hierarchy is region → regional units → municipalities: the 13 regions are in `data/perifereies.json`, the 74 regional units in `data/perifereiakes_enotites.json` (`PerifereiakesEnotites.perifereia_id` → `Perifereies.id`; boundaries = union of their municipalities), and every municipality points to both (`Dimoi.pe_code` → `PerifereiakesEnotites.code`, `Dimoi.perifereia_id` → `Perifereies.id`). Mount Athos (ΑΓΙΟ ΟΡΟΣ) is in no regional unit. A provider's region and regional unit are those of its municipality.

- At startup the backend fills the `Perifereies`, `PerifereiakesEnotites` and `Dimoi` tables and links them, adds missing columns (`Dimoi.perifereia_id` / `pe_code`, `HCProviders.dimos` / `dimos_code`), and sets the municipality of every provider that doesn't have one yet. Nothing to run by hand.
- Creating a provider, or changing its `lat`/`lon`, sets its municipality again. The client cannot set it directly.
- The boundaries are simplified, so a provider on the coast can fall a few metres into the sea; it then gets the nearest municipality within 3 km.
- `node scripts/assign-dimoi.js` recomputes all providers and lists the ones worth checking (`--dry-run` to only look).

API (logged-in admin/hcp users):

- `GET /dimoi` – all municipalities: `code`, `name`, `perifereia`, `perifereia_id`, `pe_code`, `population` (2021 census), `nisiotikos` / `mikros_nisiotikos` / `oreinos` (island / small island / mountain municipality), `pfy_ky` / `pfy_pi` / `pfy_ppi` (number of Κέντρα Υγείας / Περιφερειακά Ιατρεία / Πολυδύναμα Περιφερειακά Ιατρεία in the "Χάρτης δομών ΠΦΥ" data), `oikismoi_count` (number of settlements), `label` (name, plus the region for the two ΗΡΑΚΛΕΙΟΥ)
- `GET /dimoi/geometry?codes=7301,7101` – GeoJSON FeatureCollection with the boundaries of those municipalities
- `GET /dimoi/at?lat=35.36&lon=24.47` – the municipality at a point (`code`, `name`), 404 if there is none (e.g. at sea)
- `GET /dimoi/:code/oikismoi` – a municipality with its settlements
- `GET /perifereies` – the 13 regions: `id`, `name`, `dimoi_count`
- `GET /perifereies/:id/dimoi` – a region with its municipalities
- `GET /perifereies/geometry?ids=10,13` – GeoJSON FeatureCollection with the boundaries of those regions
- `GET /perifereiakes-enotites` (optionally `?perifereia_id=10`) – regional units: `code`, `name`, `perifereia_id`, `dimoi_count`
- `GET /perifereiakes-enotites/:code/dimoi` – a regional unit with its municipalities
- `GET /perifereiakes-enotites/geometry?codes=73,45` – GeoJSON FeatureCollection with the boundaries of those regional units

## Regional clinics (Περιφερειακά Ιατρεία and Πολυδύναμα Περιφερειακά Ιατρεία)

The 1,431 Περιφερειακά Ιατρεία (`type_Of_Hcp` = `Regional Clinic`) and 81 Πολυδύναμα Περιφερειακά Ιατρεία (`Multipurpose Regional Clinic`) of the "Χάρτης δομών ΠΦΥ" map are ordinary HCProviders rows, next to the hospitals, health centres and TOMY. They come from `data/iatreia.json`:

- At startup the backend adds the columns `source_id` and `location_accuracy` to `HCProviders` if they are missing, and imports the clinics **once**: only when no provider has a `source_id` yet. Clinics deleted or edited later are left as they are.
- `source_id` is the clinic's id in the map's data (e.g. `S0086`); `Q4ALL_code` is empty for them.
- `HEALTH_Center_In_The_Network` is left empty: the map's data only has an official clinic → Κέντρο Υγείας link for the 3rd ΥΠΕ, the rest is an estimate (same municipality or nearest). Databases that imported the first version (which had it) get it cleared at startup, except on clinics edited since.
- `ype` is the ΥΠΕ number; the municipality is found from `lat`/`lon` like for every provider.
- `lat`/`lon` are the position of the clinic's settlement (village), not of the building. `location_accuracy` says how it was found: `Settlement`, `Settlement (approximate)` or `Municipality seat (settlement not identified)`.

## Settlements (Οικισμοί)

Every municipality has one or more settlements: the 13,548 settlements of ΕΛΣΤΑΤ, as points (no boundaries), in `data/oikismoi.json` (from the file Oikismoi-Greece.geojson). Table `Oikismoi`: `id` (id in that file), `code` (ΕΛΣΤΑΤ code), `name` (without the article, e.g. `Κάρυστος`), `official_name` (`Κάρυστος,η`), `koinotita` (Τοπική / Δημοτική Κοινότητα), `lat`, `lon`, `dimos_code` → `Dimoi.code`.

- The municipality of a settlement comes from its ΕΛΣΤΑΤ code, not from the boundaries (they are simplified and miss islets). Those codes are the 2011 (Kallikratis) ones: they were mapped to the current municipality codes, and the settlements of the five municipalities split in 2019 (Κέρκυρα, Κεφαλονιά, Λέσβος, Σάμος, Σερβίων - Βελβεντού) go to the new municipality whose boundary holds them (or the nearest one).
- Every provider has a settlement (`HCProviders.oikismos`, `oikismos_id` → `Oikismoi.id`): the nearest settlement of its municipality. Like the municipality, it is set from `lat`/`lon` when a provider is created or its coordinates change, and at startup for providers without one; the client cannot set it. `node scripts/assign-dimoi.js` recomputes it too.
- Exception: the 75 regional clinics whose village the source couldn't identify (`location_accuracy` = `Municipality seat (settlement not identified)`) sit at the seat of their municipality, so they get no settlement. Changing a clinic's coordinates clears its `location_accuracy` (the position is then the user's) and sets its settlement.
- At startup the backend fills the `Oikismoi` table (if it is empty or out of date) and adds the two `HCProviders` columns if they are missing.

API (logged-in admin/hcp users):

- `GET /oikismoi?dimos_code=7301,7302` – the settlements of those municipalities: `id`, `name`, `koinotita`, `lat`, `lon`, `dimos_code`
