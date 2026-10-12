import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import HCProviders from "./HCProvidersModel.js";

const {DataTypes} = Sequelize;


const hcpInfo = db.define('hcpInfo', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ype:
    {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    Q4ALL_code:
    {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    Name_EN:
    {
        type: DataTypes.STRING(199),
        allowNull: true
    },
    Sector:
    {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    Department:
    {
        type: DataTypes.STRING(199),
        allowNull: true
    },
    Unit:
    {
        type: DataTypes.STRING(199),
        allowNull: true
    },
    Number_Of_Beds:
    {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    

},{
    freezeTableName: true
})

hcpInfo.belongsTo(HCProviders,{foreignKey: {name: 'hcp_id',allowNull: true}})

export default hcpInfo