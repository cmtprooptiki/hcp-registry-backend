import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Dimoi from "./DimoiModel.js";

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
    // ΕΛΣΤΑΤ (Kallikratis) code: municipality, municipal unit, community, settlement.
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
    }
}, {
    freezeTableName: true,
    timestamps: false,
    indexes: [{ fields: ['dimos_code'] }]
});

// Municipality (Δήμος) -> settlements (Οικισμοί)
Dimoi.hasMany(Oikismoi, { foreignKey: 'dimos_code', sourceKey: 'code', as: 'oikismoi' });
Oikismoi.belongsTo(Dimoi, { foreignKey: 'dimos_code', targetKey: 'code', as: 'dimos' });

export default Oikismoi;
