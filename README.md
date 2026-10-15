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

## Regions (Περιφέρειες), regional units (Περιφερειακές Ενότητες), municipalities (Δήμοι) and municipal units (Δημοτικές Ενότητες)

The hierarchy is region → regional units → municipalities → municipal units → settlements:

- 13 regions in `data/perifereies.json`, 74 regional units in `data/perifereiakes_enotites.json` (`PerifereiakesEnotites.perifereia_id` → `Perifereies.id`), 333 municipalities in `data/dimoi.json` (`Dimoi.pe_code` → `PerifereiakesEnotites.code`, `Dimoi.perifereia_id` → `Perifereies.id`; Mount Athos (ΑΓΙΟ ΟΡΟΣ) is in no regional unit), 1,035 municipal units in `data/dimotikes_enotites.json` (`DimotikesEnotites.dimos_code` → `Dimoi.code`). Municipalities that are not divided have one unit with their own name.
- Boundaries: the municipal units of ΕΛΣΤΑΤ (file adm_pol_dimotikes_enotites.json, EPSG:2100), converted to WGS84 **with** the ΕΓΣΑ87 → WGS84 datum shift. The boundaries of municipalities, regional units and regions are the union of their units, simplified together (~250 m) so they share the same borders on the map. Each unit also has a more detailed boundary (`geometry_detail`, ~40 m) used only by the backend to place providers.
- Before 2026-10-15 the boundaries came from the "Χάρτης δομών ΠΦΥ" map, and they (and the settlement and clinic positions) were ~300 m south-west of the true position (converted without the datum shift). Moving to the new boundaries changed the municipality of 21 providers near municipality borders in Athens and Thessaloniki.
- A unit's municipality comes from its settlements' ΕΛΣΤΑΤ codes (Kallikratis codes, mapped to the current municipality codes; the units of the five municipalities split in 2019 follow their settlements).

Every provider has a municipality (`dimos`, `dimos_code`) and a municipal unit (`dimotiki_enotita` = the unit's label, `de_code` → `DimotikesEnotites.code`): the unit whose detailed boundary contains its `lat`/`lon`, and that unit's municipality. A provider's regional unit and region are those of its municipality.

- At startup the backend fills the tables and links them, adds missing columns, and loads a table again when its data file changed (the version of each file is kept in the `DataVersions` table). When boundaries, settlements or clinic positions changed, it recomputes the place of every provider; otherwise only of providers missing one. Nothing to run by hand.
- Creating a provider, or changing its `lat`/`lon`, sets its municipality, unit and settlement again. The client cannot set them directly.
- The boundaries are simplified, so a provider on the coast can fall a few metres into the sea; it then gets the nearest unit within 3 km.
- `node scripts/assign-dimoi.js` recomputes all providers and lists the ones worth checking (`--dry-run` to only look).

API (logged-in admin/hcp users):

- `GET /dimoi` – all municipalities: `code`, `name`, `perifereia`, `perifereia_id`, `pe_code`, `population` (2021 census), `nisiotikos` / `mikros_nisiotikos` / `oreinos` (island / small island / mountain municipality), `pfy_ky` / `pfy_pi` / `pfy_ppi` (number of Κέντρα Υγείας / Περιφερειακά Ιατρεία / Πολυδύναμα Περιφερειακά Ιατρεία in the "Χάρτης δομών ΠΦΥ" data), `de_count` (number of municipal units), `oikismoi_count` (number of settlements), `label` (name, plus the region for the two ΗΡΑΚΛΕΙΟΥ)
- `GET /dimoi/geometry?codes=7301,7101` – GeoJSON FeatureCollection with the boundaries of those municipalities
- `GET /dimoi/at?lat=35.36&lon=24.47` – the municipality and unit at a point (`code`, `name`, `de_code`, `dimotiki_enotita`), 404 if there is none (e.g. at sea)
- `GET /dimoi/:code/oikismoi` – a municipality with its settlements
- `GET /dimoi/:code/dimotikes-enotites` – a municipality with its municipal units
- `GET /dimotikes-enotites` (optionally `?dimos_code=7301,7302`) – municipal units: `code`, `name`, `label` (name, plus the municipality when another unit has the same name), `official_name`, `dimos_code`, `area_km2`, `oikismoi_count`
- `GET /dimotikes-enotites/geometry?codes=730101,730102` – GeoJSON FeatureCollection with the boundaries of those units
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
- The first versions of `data/iatreia.json` had the positions ~300 m south-west (no datum shift). At startup, once per database, clinics still exactly at their old position (`data/iatreia_coords_previous.json`) are moved to the corrected one; clinics moved by a user keep their position.

## Settlements (Οικισμοί)

Every municipal unit has one or more settlements: the 13,548 settlements of ΕΛΣΤΑΤ, as points (no boundaries), in `data/oikismoi.json` (from the file Oikismoi-Greece.geojson). Table `Oikismoi`: `id` (id in that file), `code` (ΕΛΣΤΑΤ code), `name` (without the article, e.g. `Κάρυστος`), `official_name` (`Κάρυστος,η`), `koinotita` (Τοπική / Δημοτική Κοινότητα), `lat`, `lon`, `dimos_code` → `Dimoi.code`, `de_code` → `DimotikesEnotites.code`.

- Positions are computed from the file's EPSG:2100 points with the datum shift (the file's own lat/lon columns lack it and are ~300 m off).
- The municipal unit of a settlement comes from its ΕΛΣΤΑΤ code (first 6 digits), not from the boundaries; its municipality is the unit's. (Πειραιάς's two settlements have no unit in their code: they get the unit at their position.)
- Every provider has a settlement (`HCProviders.oikismos`, `oikismos_id` → `Oikismoi.id`): the nearest settlement of its municipal unit. Like the municipality, it is set from `lat`/`lon` when a provider is created or its coordinates change, and at startup for providers without one; the client cannot set it. `node scripts/assign-dimoi.js` recomputes it too.
- Exception: the 75 regional clinics whose village the source couldn't identify (`location_accuracy` = `Municipality seat (settlement not identified)`) sit at the seat of their municipality, so they get no settlement. Changing a clinic's coordinates clears its `location_accuracy` (the position is then the user's) and sets its settlement.
- At startup the backend fills the `Oikismoi` table (if it is empty or its data file changed) and adds the missing columns.

API (logged-in admin/hcp users):

- `GET /oikismoi?dimos_code=7301,7302` (or `?de_code=730101`) – the settlements of those municipalities (or municipal units): `id`, `name`, `koinotita`, `lat`, `lon`, `dimos_code`, `de_code`
