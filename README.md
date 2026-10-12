# HCProviders registry backend

Express + Sequelize API for healthcare providers (HCProviders), their info (hcpInfo) and the users assigned to them, backed by MySQL.

## Setup

1. Create an empty MySQL database (utf8mb4 is required for the Greek names):

   ```sql
   CREATE DATABASE hcp_registry CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Copy `.env.example` to `.env` and fill in the connection settings:

   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=hcp_registry
   DB_USER=root
   DB_PASSWORD=
   DB_SSL=false        # set to true for hosted MySQL that requires SSL
   ```

3. `npm install` and `npm start`. Tables are created automatically on startup (`db.sync()`).
