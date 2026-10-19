import { Sequelize } from "sequelize";
import db from "../config/Database.js";

const { DataTypes } = Sequelize;

// Log of the providers moved to the settlement of their name (utils/setupProviderCoords.js):
// old and new position, so the move can be listed and undone (scripts/provider-coords.js --revert).
const ProviderCoordinateFixes = db.define('ProviderCoordinateFixes', {
    provider_id: { type: DataTypes.INTEGER, allowNull: false },
    Name_GR: { type: DataTypes.STRING(199), allowNull: true },
    from_lat: { type: DataTypes.DECIMAL(10, 8), allowNull: false },
    from_lon: { type: DataTypes.DECIMAL(11, 8), allowNull: false },
    to_lat: { type: DataTypes.DECIMAL(10, 8), allowNull: false },
    to_lon: { type: DataTypes.DECIMAL(11, 8), allowNull: false },
    settlement: { type: DataTypes.STRING(150), allowNull: true },
    dimos: { type: DataTypes.STRING(150), allowNull: true },
    // where the provider was: "Αγκουσελιανά (Δ. ΑΓΙΟΥ ΒΑΣΙΛΕΙΟΥ)", and how far from the settlement of its name
    was_at: { type: DataTypes.STRING(250), allowNull: true },
    km: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
    // previous location_accuracy, restored by --revert
    previous_accuracy: { type: DataTypes.STRING(100), allowNull: true },
}, {
    freezeTableName: true,
    indexes: [{ fields: ['provider_id'] }],
});

export default ProviderCoordinateFixes;
