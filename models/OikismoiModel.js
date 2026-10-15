import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Dimoi from "./DimoiModel.js";
import DimotikesEnotites from "./DimotikesEnotitesModel.js";

const { DataTypes } = Sequelize;

// Settlements (Οικισμοί) of ΕΛΣΤΑΤ, as points: every municipality (Δήμος) has one or more.
// Filled automatically at startup from data/oikismoi.json (see utils/setupOikismoi.js).
const Oikismoi = db.define('Oikismoi', {
    // id of the settlement in the source file (Oikismoi-Greece.geojson)
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: false
    },
    // ΕΛΣΤΑΤ (Kallikratis) code: municipality (4 digits), municipal unit (2), community (2), settlement (2).
    // Not unique: the source has one code twice.
    code: {
        type: DataTypes.STRING(10),
        allowNull: true
    },
    // Name without the article, e.g. "Κάρυστος" (official_name: "Κάρυστος,η")
    name: {
        type: DataTypes.STRING(200),
        allowNull: false
    },
    official_name: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    // Local / municipal community (Τοπική / Δημοτική Κοινότητα)
    koinotita: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    lat: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false
    },
    lon: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false
    },
    // The municipality (Δήμος) this settlement belongs to
    dimos_code: {
        type: DataTypes.STRING(4),
        allowNull: false
    },
    // The municipal unit (Δημοτική Ενότητα) this settlement belongs to (first 6 digits of its code)
    de_code: {
        type: DataTypes.STRING(6),
        allowNull: true
    }
}, {
    freezeTableName: true,
    timestamps: false,
    // (the de_code index is added in utils/setupOikismoi.js: on an existing table db.sync()
    // would try to create it before the column exists)
    indexes: [{ fields: ['dimos_code'] }]
});

// Municipality (Δήμος) -> settlements (Οικισμοί)
Dimoi.hasMany(Oikismoi, { foreignKey: 'dimos_code', sourceKey: 'code', as: 'oikismoi' });
Oikismoi.belongsTo(Dimoi, { foreignKey: 'dimos_code', targetKey: 'code', as: 'dimos' });
// Municipal unit (Δημοτική Ενότητα) -> settlements
DimotikesEnotites.hasMany(Oikismoi, { foreignKey: 'de_code', sourceKey: 'code', as: 'oikismoi' });
Oikismoi.belongsTo(DimotikesEnotites, { foreignKey: 'de_code', targetKey: 'code', as: 'dimotiki_enotita' });

export default Oikismoi;
