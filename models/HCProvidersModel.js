import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Users from "./UserModel.js";

const {DataTypes} = Sequelize;


const HCProviders = db.define('HCProviders', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ype:
    {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    Q4ALL_code:
    {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    type_Of_Hcp:
    {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    Name_GR:
    {
        type: DataTypes.STRING(199),
        allowNull: true
    },
    Name_EN:
    {
        type: DataTypes.STRING(199),
        allowNull: true
    },
    category_As_Per_HealthAtlas:
    {
        type: DataTypes.STRING(199),
        allowNull: true
    },
    category_As_Per_Sha_2011_Elstat:
    {
        type: DataTypes.STRING(199),
        allowNull: true
    },
    lat:
    {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false,
        validate:{
            notEmpty: true
        }
    },
    lon:{
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false,
        validate:{
            notEmpty: true
        }
    },
    address:
    {
        type:DataTypes.TEXT,
        allowNull: true
    },
    post_Code:
    {
        type: DataTypes.INTEGER
    },
    email_Contact:
    {
        type: DataTypes.STRING(250),
        allowNull: true
    },
    general_Email_Contact:
    {
        type: DataTypes.STRING(260),
        allowNull: true
    },
    website:
    {
        type: DataTypes.STRING(200),
        allowNull:true
    },
    Idika_Ehr:
    {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    Odipy_Inidcator_Collection:
    {
        type: DataTypes.STRING(200),
        allowNull:true
    },
    Drg_Mature_Usage:
    {
        type: DataTypes.STRING(200),
        allowNull:true
    },
    HEALTH_Center_In_The_Network:
    {
        type: DataTypes.STRING(200),
        allowNull:true
    },
    // Municipality (Δήμος), filled automatically from lat/lon (see utils/dimoiLookup.js)
    dimos:
    {
        type: DataTypes.STRING(150),
        allowNull: true
    },
    dimos_code:
    {
        type: DataTypes.STRING(4),
        allowNull: true
    },
    // Municipal unit (Δημοτική Ενότητα), filled automatically from lat/lon (see utils/dimoiLookup.js);
    // de_code -> DimotikesEnotites.code
    dimotiki_enotita:
    {
        type: DataTypes.STRING(250),
        allowNull: true
    },
    de_code:
    {
        type: DataTypes.STRING(6),
        allowNull: true
    },
    // Settlement (Οικισμός): the nearest settlement of the municipal unit, filled automatically
    // (see utils/oikismoiLookup.js); oikismos_id -> Oikismoi.id
    oikismos:
    {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    oikismos_id:
    {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // Περιφερειακά Ιατρεία / ΠΠΙ imported from "Χάρτης δομών ΠΦΥ" (see utils/setupIatreia.js):
    // their id there (e.g. "S0086") and how exact their position is
    source_id:
    {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    location_accuracy:
    {
        type: DataTypes.STRING(100),
        allowNull: true
    }

},{
    freezeTableName: true
})

HCProviders.belongsTo(Users,{foreignKey: {name: 'user_Id',allowNull: true}})

export default HCProviders
