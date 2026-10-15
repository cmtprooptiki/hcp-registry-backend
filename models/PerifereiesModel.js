import { Sequelize } from "sequelize";
import db from "../config/Database.js";

const { DataTypes } = Sequelize;

// Greek administrative regions (Περιφέρειες, 13). A region has many municipalities (Dimoi).
// Filled automatically at startup from data/perifereies.json (see utils/setupDimoi.js).
const Perifereies = db.define('Perifereies', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
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

export default Perifereies;
