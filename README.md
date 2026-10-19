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

The hierarchy is region → regional units → municipalities → municipal units → communities → settlements (communities: see below):

- 13 regions in `data/perifereies.json`, 74 regional units in `data/perifereiakes_enotites.json` (`PerifereiakesEnotites.perifereia_id` → `Perifereies.id`), 333 municipalities in `data/dimoi.json` (`Dimoi.pe_code` → `PerifereiakesEnotites.code`, `Dimoi.perifereia_id` → `Perifereies.id`; Mount Athos (ΑΓΙΟ ΟΡΟΣ) is in no regional unit), 1,037 municipal units in `data/dimotikes_enotites.json` (`DimotikesEnotites.dimos_code` → `Dimoi.code`). Municipalities that are not divided have one unit with their own name.
- Municipal units follow the 2021 census (ΕΛΣΤΑΤ file MON_PLI_DHM_OIKISN_2021.xlsx): its codes, names and μόνιμος πληθυσμός (`population`); `code_2011` is the 2011 code. Two units were created since 2011: Δ.Ε. Δηλεσίου (Δήμος Τανάγρας, from parts of Οινοφύτων and Σχηματαρίου) and Δ.Ε. Ανάληψης (Δήμος Σητείας, from 4 communities of Μακρύ Γιαλού of Δήμος Ιεράπετρας: Λιθίνες, Περιβολάκια, Πεύκοι, Χρυσοπηγή). Ανάληψης is made of whole communities, so its boundary is exact (since 2026-10-16); Δηλεσίου takes parts of two communities, split along the Voronoi cells of their settlements (approximate).
- Boundaries: since 2026-10-16 every level is built from the communities of ΕΛΣΤΑΤ (file dimotikes_topikes_koinotites.geojson, 2011, EPSG:2100; before, from the municipal units file adm_pol_dimotikes_enotites.json, which has the same borders), converted to WGS84 **with** the ΕΓΣΑ87 → WGS84 datum shift. Municipal units, municipalities, regional units and regions are the union of their communities, simplified together (~250 m) so they share the same borders on the map. Each unit also has a more detailed boundary (`geometry_detail`, ~40 m) used only by the backend to place providers.
- Before 2026-10-15 the boundaries came from the "Χάρτης δομών ΠΦΥ" map, and they (and the settlement and clinic positions) were ~300 m south-west of the true position (converted without the datum shift). Moving to the new boundaries changed the municipality of 21 providers near municipality borders in Athens and Thessaloniki.
- A unit's municipality is the one of the 2021 census (the census municipality codes are the ones of `data/dimoi.json`).

Every provider has a municipality (`dimos`, `dimos_code`) and a municipal unit (`dimotiki_enotita` = the unit's label, `de_code` → `DimotikesEnotites.code`): the unit whose detailed boundary contains its `lat`/`lon`, and that unit's municipality. A provider's regional unit and region are those of its municipality.

- At startup the backend fills the tables and links them, adds missing columns, and loads a table again when its data file changed (the version of each file is kept in the `DataVersions` table). When boundaries, settlements or clinic positions changed, it recomputes the place of every provider; otherwise only of providers missing one. Nothing to run by hand.
- Creating a provider, or changing its `lat`/`lon`, sets its municipality, unit, settlement and community again. The client cannot set them directly.
- The boundaries are simplified, so a provider on the coast can fall a few metres into the sea; it then gets the nearest unit within 3 km.
- `node scripts/assign-dimoi.js` recomputes all providers and lists the ones worth checking (`--dry-run` to only look).

API (logged-in admin/hcp users):

- `GET /dimoi` – all municipalities: `code`, `name`, `perifereia`, `perifereia_id`, `pe_code`, `population` (2021 census), `nisiotikos` / `mikros_nisiotikos` / `oreinos` (island / small island / mountain municipality), `pfy_ky` / `pfy_pi` / `pfy_ppi` (number of Κέντρα Υγείας / Περιφερειακά Ιατρεία / Πολυδύναμα Περιφερειακά Ιατρεία in the "Χάρτης δομών ΠΦΥ" data), `de_count` (number of municipal units), `oikismoi_count` (number of settlements), `label` (name, plus the region for the two ΗΡΑΚΛΕΙΟΥ)
- `GET /dimoi/geometry?codes=7301,7101` – GeoJSON FeatureCollection with the boundaries of those municipalities
- `GET /dimoi/at?lat=35.36&lon=24.47` – the municipality and unit at a point (`code`, `name`, `de_code`, `dimotiki_enotita`), 404 if there is none (e.g. at sea)
- `GET /dimoi/:code/oikismoi` – a municipality with its settlements
- `GET /dimoi/:code/dimotikes-enotites` – a municipality with its municipal units
- `GET /dimotikes-enotites` (optionally `?dimos_code=7301,7302`) – municipal units: `code`, `name`, `label` (name, plus the municipality when another unit has the same name), `official_name`, `dimos_code`, `area_km2`, `population` (2021), `code_2011`, `oikismoi_count`, `koinotites_count`
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

Every municipal unit has one or more settlements: the 13,548 settlements of ΕΛΣΤΑΤ, as points (no boundaries), in `data/oikismoi.json` (from the file Oikismoi-Greece.geojson). Table `Oikismoi`: `id` (id in that file), `code` (ΕΛΣΤΑΤ 2011 code), `name` (without the article, e.g. `Κάρυστος`), `official_name` (`Κάρυστος,η`), `koinotita` (its community now, 2021 census name, e.g. `Δημοτική Κοινότητα Καρύστου`), `koinotita_code` → `Koinotites.code`, `lat`, `lon`, `dimos_code` → `Dimoi.code`, `de_code` → `DimotikesEnotites.code`, `population` (μόνιμος πληθυσμός 2021), `census_code` (the settlement's code in the 2021 census).

- Population: from the 2021 census file MON_PLI_DHM_OIKISN_2021.xlsx (ΕΛΣΤΑΤ, 13,586 settlements). The census uses the current codes, so settlements were matched by name inside their municipality (and community / unit when a name repeats): 13,433 of our settlements found (99.94% of the population); 115 have no population (`null`: abolished or renamed since 2011); 153 census settlements (6,711 people) are not in the settlements file (new since 2011), so they are not on the map.

- Positions are computed from the file's EPSG:2100 points with the datum shift (the file's own lat/lon columns lack it and are ~300 m off).
- The municipal unit and municipality of a settlement are those of the 2021 census (for the 115 not found there: the successor of their 2011 unit), not the boundaries.
- Every provider has a settlement (`HCProviders.oikismos`, `oikismos_id` → `Oikismoi.id`): the nearest settlement of its municipal unit. Like the municipality, it is set from `lat`/`lon` when a provider is created or its coordinates change, and at startup for providers without one; the client cannot set it. `node scripts/assign-dimoi.js` recomputes it too.
- Exception: the 75 regional clinics whose village the source couldn't identify (`location_accuracy` = `Municipality seat (settlement not identified)`) sit at the seat of their municipality, so they get no settlement. Changing a clinic's coordinates clears its `location_accuracy` (the position is then the user's) and sets its settlement.
- At startup the backend fills the `Oikismoi` table (if it is empty or its data file changed) and adds the missing columns.

API (logged-in admin/hcp users):

- `GET /oikismoi?dimos_code=7301,7302` (or `?de_code=730101`, `?koinotita_code=73020101`) – the settlements of those municipalities (or municipal units, communities): `id`, `name`, `koinotita`, `koinotita_code`, `lat`, `lon`, `dimos_code`, `de_code`, `population`
- `GET /oikismoi/names` – every settlement, without coordinates (`id`, `name`, `koinotita`, `koinotita_code`, `dimos_code`, `de_code`), for the map's search box

## Communities (Δημοτικές Κοινότητες)

Every municipal unit has one or more communities, and every community one or more settlements: 6,139 communities in `data/koinotites.json`, table `Koinotites`: `code` (2021 census code, 8 digits), `name` (e.g. `Σπηλίου`), `label` (`Δ.Κ. Σπηλίου`), `official_name` (`Δημοτική Κοινότητα Σπηλίου`), `kind`, `de_code` → `DimotikesEnotites.code`, `dimos_code`, `population` (μόνιμος πληθυσμός 2021, including settlements not in the settlements file), `in_census`, `approximate`, `code_2011`, `area_km2`, `geometry` (~100 m).

- Boundaries: the user's file dimotikes_topikes_koinotites.geojson (ΕΛΣΤΑΤ/geodata, 6,131 communities of 2011, EPSG:2100), converted with the datum shift. Codes, names and population: the 2021 census (6,135 communities; since 2019 all are called Δημοτική Κοινότητα).
- A 2011 community = the census community of its settlements. 7 were renamed (e.g. Λίμνη → Ζαραβίνα, Καλλιθέα → Ζαραφώνα); 11 were divided since 2011 (e.g. Χαλκούτσι out of Σκάλα Ωρωπού, Κινέτα out of Μέγαρα, Δήλεσι out of Οινόφυτα): they are split along the Voronoi cells of their settlements (`approximate` = true, 20 communities); 4 of 2011 are not in the census (Τριβούνου, Κουμαριάς, Ανθοχωρίου and Μαραθούσσης Αρκαδίας): kept with their 2011 code and name, `in_census` = false, no population.
- `kind` = `pseudo` for the 68 units without communities (e.g. Αθηναίων, Πειραιώς, Σκύρου; census name "ΨΕΥΔΟΔΗΜΟΤΙΚΗ ΚΟΙΝΟΤΗΤΑ …"): one record covering the whole unit, named after it.
- The community of a settlement is its census community, kept inside the settlement's unit (2 settlements the census puts in a community of another, older unit stay in their unit's community).
- Every provider has a community (`HCProviders.koinotita` = its label, `koinotita_code` → `Koinotites.code`): the community of its settlement. Providers without a settlement (the 75 clinics at their municipality's seat) have none; `koinotita` is empty in units without communities (`pseudo`). Set like the settlement; the client cannot set them.
- At startup the backend fills the `Koinotites` table (if it is empty or its data file changed), before the settlements, and adds the missing columns.

API (logged-in admin/hcp users):

- `GET /koinotites?de_code=730201` (or `?dimos_code=7302`) – the communities of those municipal units (or municipalities): `code`, `name`, `label`, `official_name`, `kind`, `de_code`, `dimos_code`, `population`, `in_census`, `approximate`, `code_2011`, `area_km2`, `oikismoi_count`
- `GET /koinotites/geometry?codes=73020101,73020102` – GeoJSON FeatureCollection with the boundaries of those communities
- `GET /koinotites/names` – every community (not the `pseudo` ones): `code`, `label`, `de_code`, for the map's search box

## Coordinates of hospitals, Health Centres and TOMY

The 568 original providers have geocoded coordinates, and some were far from the place in their name (e.g. Κ.Υ. ΣΠΗΛΙΟΥ 9.5 km away in Αγκουσελιανά, Κ.Υ. ΚΑΤΕΡΙΝΗΣ in Άργος). They are checked **by name** (`Name_GR`, compared without accents, case and punctuation) against the settlement their name or address points to.

- `data/provider_places.json`: for every provider name, the ΕΛΣΤΑΤ settlement of its name / address (matched among the settlements of its ΥΠΕ, generator not in the repo) and when a position counts as consistent with it.
- At startup, once per version of the file (`DataVersions`), each provider of the database is found by its name and its **current** position is checked. It is kept when it is in that settlement, in a settlement that is itself named in its name or in the settlement part of its address (not the municipality / ΠΕ part: for "ΣΠΗΛΙ, ΑΓΙΟΥ ΒΑΣΙΛΕΙΟΥ, ΡΕΘΥΜΝΟ" the village Άγιος Βασίλειος does not count), within 1 km (settlement < 2,000 people), 2 km (< 10,000), 3 km (< 50,000), 5 km (< 200,000) or 8 km (Athens, Thessaloniki) of it, a hospital inside its municipality, a provider of a town > 20,000 inside the town's municipal unit, or — when its name matches a place elsewhere (Καμίνια, a neighbourhood of Piraeus, and a village on Λήμνος) — inside the area its address names. Otherwise it is moved to the settlement's ΕΛΣΤΑΤ point (village or town centre, not the building) with `location_accuracy` `Settlement centre (corrected from the name)` or `Town centre (corrected from the name)`, and its municipality, unit and settlement are recomputed. When the name matches several places (e.g. two Μαρκόπουλο in Attica) it is only listed for review. `updatedAt` is not changed.
- Every move is logged in the table `ProviderCoordinateFixes` (old and new position, where it was, distance).
- `node scripts/provider-coords.js` shows the result on the current database (moved / would be moved / to review / names not in the file); `--report` also writes `reports/provider_coordinates.csv` (every provider, opens in Excel); `--revert` puts the moved providers back (the startup then does not move them again).
- A first version of this step (2026-10-16 morning, `data/provider_coords_fix.json`) matched providers by `Q4ALL_code` and old position, and moved only those whose position was exactly the one of `hcproviders.json`; its moves are logged in the table too (`was_at` = "first version").
