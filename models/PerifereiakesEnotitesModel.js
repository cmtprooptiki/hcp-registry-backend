import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Perifereies from "./PerifereiesModel.js";

const { DataTypes } = Sequelize;

// Regional units (Περιφερειακές Ενότητες, 74). A region has many regional units,
// a regional unit has one or more municipalities (Dimoi).
// code = first two digits of its municipalities' codes (e.g. 73 ΡΕΘΥΜΝΟΥ -> 7301 ΡΕΘΥΜΝΗΣ).
// Filled automatically at startup from data/perifereiakes_enotites.json (see utils/setupDimoi.js);
// boundaries = union of the boundaries of its municipalities.
const PerifereiakesEnotites = db.define('PerifereiakesEnotites', {
    code: {
        type: DataTypes.STRING(2),
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    // The region (Περιφέρεια) this regional unit belongs to
    perifereia_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    // GeoJSON Polygon / MultiPolygon stored as text (works on MySQL and MariaDB)
    geometry: {
        type: DataTypes.TEXT('long'),
        allowNull: false
    }
}, {
    freezeTableName: true,
    timestamps: false
});

// A region has many regional units, a regional unit belongs to one region
Perifereies.hasMany(PerifereiakesEnotites, { foreignKey: 'perifereia_id', as: 'perifereiakes_enotites' });
PerifereiakesEnotites.belongsTo(Perifereies, { foreignKey: 'perifereia_id', as: 'region' });

export default PerifereiakesEnotites;
