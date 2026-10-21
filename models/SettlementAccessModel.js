import { Sequelize } from "sequelize";
import db from "../config/Database.js";

const { DataTypes } = Sequelize;

// Road distance of every settlement (Οικισμός, its ΕΛΣΤΑΤ point) to the nearest health structure, for the
// remote areas of the map. Filled at startup from data/settlement_access.json (utils/setupSettlementAccess.js),
// which scripts/access/compute_access.py makes. Roads only, no ferries; null = no road connection.
const SettlementAccess = db.define('SettlementAccess', {
    // -> Oikismoi.id
    oikismos_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: false
    },
    // to the nearest Hospital / Health Centre / TOMY / Multipurpose Regional Clinic
    road_km: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
    road_min: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    // -> HCProviders.id of that structure
    nearest_id: { type: DataTypes.INTEGER, allowNull: true },
    straight_km: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
    // to the nearest Regional Clinic (Π.Ι.), which does not count for the criterion
    pi_road_km: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
    pi_road_min: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    pi_nearest_id: { type: DataTypes.INTEGER, allowNull: true },
    // distance from the settlement point to the road (km)
    snap_km: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    // its road piece is not connected in OpenStreetMap and was joined to the network (worth a check)
    bridged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
    freezeTableName: true,
    timestamps: false
});

export default SettlementAccess;
