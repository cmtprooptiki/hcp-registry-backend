import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST = "localhost",
  DB_PORT = 3306,
  DB_SSL = "false",
} = process.env;

const db = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: Number(DB_PORT),
  dialect: "mysql",
  dialectOptions: {
    charset: "utf8mb4",
    ...(DB_SSL === "true" && {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    }),
  },
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  },
  logging: false,
});

export default db;
