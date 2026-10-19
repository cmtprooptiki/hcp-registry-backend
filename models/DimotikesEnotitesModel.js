import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Dimoi from "./DimoiModel.js";

const { DataTypes } = Sequelize;

// Municipal units (Δημοτικές Ενότητες, 1037: the division of the 2021 census) with their boundaries.
// A municipality (Δήμος) has one or more municipal units, a municipal unit one or more
// settlements (Οικισμοί). Filled automatically at startup from data/dimotikes_enotites.json
// (see utils/setupDimotikesEnotites.js).
const DimotikesEnotites = db.define('DimotikesEnotites', {
    // ΕΛΣΤΑΤ code of the 2021 census, 6 digits (municipality code + 2)
    code: {
        type: DataTypes.STRING(6),
        primaryKey: true
    },
    // e.g. "ΚΟΜΟΤΗΝΗΣ" (official_name: "ΔΗΜΟΤΙΚΗ ΕΝΟΤΗΤΑ ΚΟΜΟΤΗΝΗΣ"). Municipalities that are not
    // divided have one unit with the municipality's name (official_name "ΔΗΜΟΣ ...").
    name: {
        type: DataTypes.STRING(150),
        allowNull: false
    },
    // name, plus the municipality when the name exists more than once, e.g. "ΦΕΡΩΝ (Δ. ΑΛΕΞΑΝΔΡΟΥΠΟΛΗΣ)"
    label: {
        type: DataTypes.STRING(250),
        allowNull: false
    },
    official_name: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    // The municipality (Δήμος) this unit belongs to
    dimos_code: {
        type: DataTypes.STRING(4),
        allowNull: false
    },
    area_km2: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    // Μόνιμος πληθυσμός, 2021 census
    population: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // ΕΛΣΤΑΤ 2011 (Kallikratis) code of the same unit; null for the two units created since
    // (Δηλεσίου, whose boundary is approximate, and Ανάληψης)
    code_2011: {
        type: DataTypes.STRING(6),
        allowNull: true
    },
    // GeoJSON (Multi)Polygon as text: simplified (~250 m) for the map...
    geometry: {
        type: DataTypes.TEXT('long'),
        allowNull: false
    },
    // ...and more detailed (~40 m), used only by the backend to place providers
    geometry_detail: {
        type: DataTypes.TEXT('long'),
        allowNull: false
    }
}, {
    freezeTableName: true,
    timestamps: false,
    indexes: [{ fields: ['dimos_code'] }]
});

// Municipality (Δήμος) -> municipal units (Δημοτικές Ενότητες)
Dimoi.hasMany(DimotikesEnotites, { foreignKey: 'dimos_code', sourceKey: 'code', as: 'dimotikes_enotites' });
DimotikesEnotites.belongsTo(Dimoi, { foreignKey: 'dimos_code', targetKey: 'code', as: 'dimos' });

export default DimotikesEnotites;
