import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import HCProviders from "./HCProvidersModel.js";
import Users from "./UserModel.js";
const {DataTypes} = Sequelize;

const hcpusers = db.define('hcpusers',{
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    }
},{
    freezeTableName: true
});
hcpusers.belongsTo(HCProviders, { foreignKey: 'hcp_id' });
hcpusers.belongsTo(Users,{foreignKey:'user_id'})

export default hcpusers;