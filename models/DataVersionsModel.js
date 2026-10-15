import { Sequelize } from "sequelize";
import db from "../config/Database.js";

const { DataTypes } = Sequelize;

// Which version of each data/*.json file (or one-off data fix) is in the database, so that a
// changed file is loaded again at the next start (see utils/dataVersions.js).
const DataVersions = db.define('DataVersions', {
    // e.g. "dimoi.json", or the name of a one-off fix
    name: {
        type: DataTypes.STRING(100),
        primaryKey: true
    },
    // SHA-1 of the file contents (or "done" for a fix)
    version: {
        type: DataTypes.STRING(64),
        allowNull: false
    }
}, {
    freezeTableName: true
});

export default DataVersions;
