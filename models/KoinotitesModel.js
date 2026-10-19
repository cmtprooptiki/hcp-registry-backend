import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import DimotikesEnotites from "./DimotikesEnotitesModel.js";

const { DataTypes } = Sequelize;

// Communities (Δημοτικές Κοινότητες, 6,139: the division of the 2021 census) with their boundaries.
// A municipal unit (Δημοτική Ενότητα) has one or more communities, a community one or more
// settlements (Οικισμοί). Filled automatically at startup from data/koinotites.json
// (see utils/setupKoinotites.js).
const Koinotites = db.define('Koinotites', {
    // ΕΛΣΤΑΤ code of the 2021 census, 8 digits (municipal unit code + 2); the 4 communities of 2011
    // that are not in the census keep their 2011 code
    code: {
        type: DataTypes.STRING(8),
        primaryKey: true
    },
    // e.g. "Κομοτηνής" (official_name: "Δημοτική Κοινότητα Κομοτηνής")
    name: {
        type: DataTypes.STRING(200),
        allowNull: false
    },
    // for lists and the map, e.g. "Δ.Κ. Κομοτηνής"
    label: {
        type: DataTypes.STRING(250),
        allowNull: false
    },
    official_name: {
        type: DataTypes.STRING(250),
        allowNull: true
    },
    // "community", or "pseudo": a municipal unit without communities (official_name
    // "ΨΕΥΔΟΔΗΜΟΤΙΚΗ ΚΟΙΝΟΤΗΤΑ ΑΘΗΝΑΙΩΝ"; name = the unit's name), the whole unit
    kind: {
        type: DataTypes.STRING(10),
        allowNull: false
    },
    // The municipal unit (Δημοτική Ενότητα) and municipality (Δήμος) this community belongs to
    de_code: {
        type: DataTypes.STRING(6),
        allowNull: true
    },
    dimos_code: {
        type: DataTypes.STRING(4),
        allowNull: false
    },
    // Μόνιμος πληθυσμός, 2021 census (null: not in the census)
    population: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    in_census: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    // true: the boundary was split along the settlements (a 2011 community divided since)
    approximate: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    // ΕΛΣΤΑΤ 2011 (Kallikratis) code of the same community in the boundary file, when unchanged
    code_2011: {
        type: DataTypes.STRING(8),
        allowNull: true
    },
    area_km2: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    // GeoJSON (Multi)Polygon as text, simplified (~100 m) for the map
    geometry: {
        type: DataTypes.TEXT('long'),
        allowNull: false
    }
}, {
    freezeTableName: true,
    timestamps: false,
    indexes: [{ fields: ['de_code'] }, { fields: ['dimos_code'] }]
});

// Municipal unit (Δημοτική Ενότητα) -> communities (Κοινότητες)
DimotikesEnotites.hasMany(Koinotites, { foreignKey: 'de_code', sourceKey: 'code', as: 'koinotites' });
Koinotites.belongsTo(DimotikesEnotites, { foreignKey: 'de_code', targetKey: 'code', as: 'dimotiki_enotita' });

export default Koinotites;
