# Deployment: Portainer + Nginx Proxy Manager

One stack with three containers (the database is managed with the existing phpMyAdmin stack):

| Service | Image | Port on the server | What |
|---|---|---|---|
| `db` | mysql:8.0 | — (network `healthmap_net` only, name `healthmap-db`) | database, data in volume `db_data` |
| `backend` | built from this repo | `BACKEND_PORT` (5010) → 5000 | API; uploaded images in volume `uploads` |
| `frontend` | built from `hcp-frontend-map` | `FRONTEND_PORT` (3010) → 80 | React build served by nginx |

The two app images are built by Portainer straight from GitHub (`build.context` = repo URL with a
read-only token), so nothing has to be copied to the server.

## 1. GitHub token (once)

GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
resource owner `cmtprooptiki`, repositories `hcp-registry-backend` and `hcp-frontend-map`,
permission **Contents: Read-only**. Keep it for the stack variable `GITHUB_TOKEN`.

## 2. DNS

Two names pointing to the server, e.g. `app.healthiq-registry.gr` (web app) and
`api.healthiq-registry.gr` (API).

## 3. Stack in Portainer

Stacks → Add stack → name `healthmap` → **Web editor** → paste `deploy/docker-compose.yml`.
Under **Environment variables** → Advanced mode → paste `deploy/stack.env.example` and fill in the
real values (`APP_URL` / `API_URL` = the two https addresses). **Deploy the stack.**
The first build takes several minutes (the React build needs ~2–4 GB RAM).

## 4. Database (with the existing phpMyAdmin stack)

The HealthMap stack must be deployed first (it creates the network `healthmap_net`, subnet 192.168.230.0/24; check in Portainer → Networks that no other network uses it).
In the phpMyAdmin stack's compose, join that network and list both servers:

```yaml
services:
  phpmyadmin:
    # ...as it is...
    environment:
      PMA_HOSTS: <its current database host>,healthmap-db   # replaces PMA_HOST; a server menu on the login page
      UPLOAD_LIMIT: 512M
    networks: [default, healthmap_net]

networks:
  healthmap_net:
    external: true
```

Update that stack, then:

1. Local phpMyAdmin → database `hcp_registry` → Export → Quick, SQL.
2. Server phpMyAdmin → server `healthmap-db`, user `root` / `MYSQL_ROOT_PASSWORD` → database
   `hcp_registry` → Import → the .sql file.
3. Portainer → Containers → `backend` → Restart. Its log should end with `Server running on port 5000...`.
4. Delete the .sql file from your computer (it holds password hashes).

The database user of the app (`DB_USER`) gets rights on `DB_NAME` automatically (MySQL image).

## 5. Nginx Proxy Manager

Two Proxy Hosts, both with **SSL → Request a new certificate, Force SSL, HTTP/2**:

| Domain | Forward to | Websockets |
|---|---|---|
| `app.healthiq-registry.gr` | `http://<server IP>:3010` | — |
| `api.healthiq-registry.gr` | `http://<server IP>:5010` | **on** (online users, socket.io) |

On the API host, Advanced → Custom Nginx configuration (uploads up to 50 MB):

```
client_max_body_size 50m;
```

HTTPS is required: in production the login cookie is `Secure` / `SameSite=None`.

## Updates

Push to `main` → Portainer → Stacks → healthmap → **Update the stack** (the images are rebuilt from
GitHub because of `pull_policy: build`). The database and the uploads stay in their volumes.

`REACT_APP_API_URL` is written into the web app when it is built: after changing `API_URL`,
update the stack so the frontend is rebuilt.

## Backups

The data are in the volumes `healthmap_db_data` and `healthmap_uploads`. Database dump:

```
docker exec healthmap-db-1 sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction hcp_registry' > hcp_registry.sql
```
