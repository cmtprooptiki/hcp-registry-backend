import { Sequelize } from "sequelize";
import db from "../config/Database.js";

const { DataTypes } = Sequelize;

// Census 2021 (ΕΛΣΤΑΤ) figures of every settlement (Οικισμός), for the remote-areas view of the map.
// Filled at startup from data/settlement_census.json (utils/setupSettlementCensus.js), which
// scripts/census/build_census.py makes from the ΕΛΣΤΑΤ tables.
const SettlementCensus = db.define('SettlementCensus', {
    // -> Oikismoi.id
    oikismos_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: false },
    // μόνιμος πληθυσμός of the age table (may differ by 1-2 from Oikismoi.population, an earlier release)
    pop2021: { type: DataTypes.INTEGER, allowNull: true },
    // aged 65+ / 75+
    age65: { type: DataTypes.INTEGER, allowNull: true },
    age75: { type: DataTypes.INTEGER, allowNull: true },
    // κανονικές κατοικίες: κατοικούμενες, κενές, and of the empty ones εξοχικές + δευτερεύουσες (seasonal population)
    dw_occupied: { type: DataTypes.INTEGER, allowNull: true },
    dw_vacant: { type: DataTypes.INTEGER, allowNull: true },
    dw_holiday: { type: DataTypes.INTEGER, allowNull: true },
    // of its community: Π πεδινή, Η ημιορεινή, Ο ορεινή
    mountain: { type: DataTypes.STRING(1), allowNull: true },
    // of its community: 1 αστική, 2 αγροτική
    urban: { type: DataTypes.TINYINT, allowNull: true }
}, {
    freezeTableName: true,
    timestamps: false
});

export default SettlementCensus;
