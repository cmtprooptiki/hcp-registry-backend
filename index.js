import express from "express";
import cors from "cors";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import db from "./config/Database.js";

// Routes
import UserRoute from "./routes/userRoute.js";
import AuthRoute from "./routes/AuthRoute.js";
import HCProvidersRoute from "./routes/HCProvidersRoute.js";
import hcpInfoRoute from "./routes/hcpInfoRoute.js";
import DimoiRoute from "./routes/DimoiRoute.js";
import PerifereiesRoute from "./routes/PerifereiesRoute.js";
import PerifereiakesEnotitesRoute from "./routes/PerifereiakesEnotitesRoute.js";
import OikismoiRoute from "./routes/OikismoiRoute.js";
import DimotikesEnotitesRoute from "./routes/DimotikesEnotitesRoute.js";
import KoinotitesRoute from "./routes/KoinotitesRoute.js";
import { setupDimoi } from "./utils/setupDimoi.js";
import { prepareDimotikesEnotites } from "./utils/setupDimotikesEnotites.js";
import { prepareKoinotites } from "./utils/setupKoinotites.js";
import { setupIatreia } from "./utils/setupIatreia.js";
import { prepareOikismoiTables } from "./utils/setupOikismoi.js";
import { setupPlaces } from "./utils/setupPlaces.js";
import { setupProviderCoords } from "./utils/setupProviderCoords.js";

// Models (imported so they are registered before db.sync())
import "./models/UserModel.js";
import "./models/HCProvidersModel.js";
import "./models/hcpusersModel.js";
import "./models/hcpInfoModel.js";
import "./models/PerifereiesModel.js";
import "./models/PerifereiakesEnotitesModel.js";
import "./models/DimoiModel.js";
import "./models/DimotikesEnotitesModel.js";
import "./models/KoinotitesModel.js";
import "./models/OikismoiModel.js";
import "./models/DataVersionsModel.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000"];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
};

// Middleware
app.set("trust proxy", 1); // Trust Heroku proxy

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight

// Secure cross-site cookies need HTTPS, so only enable them in production
const isProduction = process.env.NODE_ENV === "production";

const sessionMiddleware = cookieSession({
  name: "session",
  keys: [process.env.SESS_SECRET],
  maxAge: 24 * 60 * 60 * 1000,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
});

app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use(sessionMiddleware);

// Routes
app.use(UserRoute);
app.use(AuthRoute);
app.use(HCProvidersRoute);
app.use(hcpInfoRoute);
app.use(DimoiRoute);
app.use(PerifereiesRoute);
app.use(PerifereiakesEnotitesRoute);
app.use(OikismoiRoute);
app.use(DimotikesEnotitesRoute);
app.use(KoinotitesRoute);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.use((socket, next) => {
  const session = socket.request?.session;
  if (session?.userId) return next();
  console.log("Unauthorized socket attempt");
  return next(new Error("Unauthorized socket connection"));
});

const onlineUsers = new Set();

io.on("connection", (socket) => {
  onlineUsers.add(socket.id);
  io.emit("response-online-users", onlineUsers.size);

  socket.on("request-online-users", () => {
    io.emit("response-online-users", onlineUsers.size);
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    io.emit("response-online-users", onlineUsers.size);
  });
});

// Start server once the database is ready
const PORT = process.env.PORT || process.env.APP_PORT || 5000;

(async () => {
  try {
    await db.authenticate();
    await db.sync();
    console.log("MySQL connected and models synced");
    // areas first (parents before children), then the clinics and coordinate fixes, then the place of every provider
    const seededAreas = await setupDimoi();                // regions, regional units, municipalities
    const seededUnits = await prepareDimotikesEnotites();  // municipal units (Δημοτικές Ενότητες)
    const seededCommunities = await prepareKoinotites();   // communities (Κοινότητες)
    const seededSettlements = await prepareOikismoiTables(); // settlements (Οικισμοί)
    const { moved } = await setupIatreia();                // regional clinics (ΠΙ / ΠΠΙ)
    const corrected = await setupProviderCoords();         // providers far from the place in their name
    await setupPlaces({ recompute: seededAreas || seededUnits || seededCommunities || seededSettlements || moved > 0 || corrected > 0 });

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}...`);
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exit(1);
  }
})();
