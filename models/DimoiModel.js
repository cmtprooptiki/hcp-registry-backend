import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Perifereies from "./PerifereiesModel.js";
import PerifereiakesEnotites from "./PerifereiakesEnotitesModel.js";

const { DataTypes } = Sequelize;

// Greek municipalities (Kallikratis, 332 + Mount Athos) with their boundaries.
// Filled automatically at startup from data/dimoi.json (see utils/setupDimoi.js).
const Dimoi = db.define('Dimoi', {
    code: {
        type: DataTypes.STRING(4),
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(150),
        allowNull: false
    },
    perifereia: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    // The region (Περιφέρεια) this municipality belongs to
    perifereia_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // The regional unit (Περιφερειακή Ενότητα) this municipality belongs to
    // (null only for Mount Athos, which is self-governed and in no regional unit)
    pe_code: {
        type: DataTypes.STRING(2),
        allowNull: true
    },
    population: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // Island / small island / mountain municipality (Ν. 4555/2018), from the "Χάρτης δομών ΠΦΥ" data
    nisiotikos: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    },
    mikros_nisiotikos: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    },
    oreinos: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    },
    // Primary care (ΠΦΥ) structures in the municipality, from the "Χάρτης δομών ΠΦΥ" data
    // (counts only; these structures are not HCProviders): Κέντρα Υγείας, Περιφερειακά Ιατρεία,
    // Πολυδύναμα Περιφερειακά Ιατρεία
    pfy_ky: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    pfy_pi: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    pfy_ppi: {
        type: DataTypes.INTEGER,
        allowNull: true
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

// Region (Περιφέρεια) -> regional units (Περιφερειακές Ενότητες) -> municipalities (Δήμοι).
// perifereia_id is also kept on the municipality, so filtering by region needs no join.
Perifereies.hasMany(Dimoi, { foreignKey: 'perifereia_id', as: 'dimoi' });
Dimoi.belongsTo(Perifereies, { foreignKey: 'perifereia_id', as: 'region' });
PerifereiakesEnotites.hasMany(Dimoi, { foreignKey: 'pe_code', as: 'dimoi' });
Dimoi.belongsTo(PerifereiakesEnotites, { foreignKey: 'pe_code', as: 'perifereiaki_enotita' });

export default Dimoi;
