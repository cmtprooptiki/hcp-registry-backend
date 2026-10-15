import HCProviders from "../models/HCProvidersModel.js";
import hcpusers from "../models/hcpusersModel.js";
import { placeFields } from "../utils/oikismoiLookup.js";

// The municipality and the settlement are always derived from the coordinates, never sent by the client
const withoutDimos = ({ dimos, dimos_code, oikismos, oikismos_id, ...data }) => data;

// Get all HCProviders
export const getHCProviders = async (req, res) => {
    try {
        const response = await HCProviders.findAll();
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Get a specific HCProvider by ID
export const getHCProvidersById = async (req, res) => {
    try {
        const response = await HCProviders.findOne({
            where: { id: req.params.id }
        });
        if (!response) return res.status(404).json({ msg: "HCProvider not found" });
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Get the HCProviders assigned to a user (through the hcpusers join table)
export const getHCProvidersByUserId = async (req, res) => {
    try {
        const rows = await hcpusers.findAll({
            attributes: ["hcp_id"],
            where: { user_id: req.params.id }
        });

        if (rows.length === 0) {
            return res.status(404).json({ msg: "No providers found for this user" });
        }

        const providerIds = rows.map(row => row.hcp_id);

        const providers = await HCProviders.findAll({
            where: { id: providerIds }
        });

        res.status(200).json(providers);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Create a new HCProvider
export const createHCProviders = async (req, res) => {
    try {
        const data = withoutDimos(req.body);
        await HCProviders.create({ ...data, ...(await placeFields(data.lat, data.lon)) });
        res.status(201).json({ msg: "HCProvider created successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};

// Bulk create HCProviders from an uploaded JSON file
export const createHCProvidersJson = async (req, res) => {
    try {
        // req.file is available because of multer
        const HCProvidersData = JSON.parse(req.file.buffer.toString());

        for (const record of HCProvidersData) {
            const data = withoutDimos(record);
            await HCProviders.create({ ...data, ...(await placeFields(data.lat, data.lon)) });
        }

        res.status(201).json({ msg: "HCProviders created successfully" });
    } catch (error) {
        console.error(error);
        res.status(400).json({ msg: error.message });
    }
};

// Update an existing HCProvider
export const updateHCProviders = async (req, res) => {
    const HCProvider = await HCProviders.findOne({
        where: { id: req.params.id }
    });

    if (!HCProvider) return res.status(404).json({ msg: "HCProvider not found" });

    try {
        let data = withoutDimos(req.body);

        // New coordinates -> find the municipality and the settlement again. The position is now
        // the user's: an imported clinic's location_accuracy no longer applies.
        if ("lat" in data || "lon" in data) {
            const lat = "lat" in data ? data.lat : HCProvider.lat;
            const lon = "lon" in data ? data.lon : HCProvider.lon;
            data = { ...data, ...(await placeFields(lat, lon)) };
            if (HCProvider.location_accuracy) data.location_accuracy = null;
        }

        await HCProviders.update(data, {
            where: { id: req.params.id }
        });
        res.status(200).json({
            msg: "HCProvider updated successfully",
            dimos: data.dimos, dimos_code: data.dimos_code,
            oikismos: data.oikismos, oikismos_id: data.oikismos_id,
        });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};

// Delete an HCProvider
export const deleteHCProvider = async (req, res) => {
    const HCProvider = await HCProviders.findOne({
        where: { id: req.params.id }
    });

    if (!HCProvider) return res.status(404).json({ msg: "HCProvider not found" });

    try {
        await HCProvider.destroy();
        res.status(200).json({ msg: "HCProvider deleted successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};
