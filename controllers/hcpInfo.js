import hcpInfo from "../models/hcpInfoModel.js";

// Get all hcpInfo rows
export const getHcpInfo = async (req, res) => {
    try {
        const response = await hcpInfo.findAll();
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Get a specific hcpInfo row by ID
export const getHcpInfoById = async (req, res) => {
    try {
        const response = await hcpInfo.findOne({
            where: { id: req.params.id }
        });
        if (!response) return res.status(404).json({ msg: "HCP info not found" });
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Create a new hcpInfo row
export const createHcpInfo = async (req, res) => {
    try {
        await hcpInfo.create(req.body);
        res.status(201).json({ msg: "HCP info created successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};

// Bulk create hcpInfo rows from an uploaded JSON file
export const createHcpInfoJson = async (req, res) => {
    try {
        // req.file is available because of multer
        const HcpInfoData = JSON.parse(req.file.buffer.toString());

        for (const data of HcpInfoData) {
            await hcpInfo.create(data);
        }

        res.status(201).json({ msg: "HCP info created successfully" });
    } catch (error) {
        console.error(error);
        res.status(400).json({ msg: error.message });
    }
};

// Update an existing hcpInfo row
export const updateHcpInfo = async (req, res) => {
    const HcpInfo = await hcpInfo.findOne({
        where: { id: req.params.id }
    });

    if (!HcpInfo) return res.status(404).json({ msg: "HCP info not found" });

    try {
        await hcpInfo.update(req.body, {
            where: { id: req.params.id }
        });
        res.status(200).json({ msg: "HCP info updated successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};

// Delete an hcpInfo row
export const deleteHcpInfo = async (req, res) => {
    const HcpInfo = await hcpInfo.findOne({
        where: { id: req.params.id }
    });

    if (!HcpInfo) return res.status(404).json({ msg: "HCP info not found" });

    try {
        await hcpInfo.destroy({
            where: { id: req.params.id }
        });
        res.status(200).json({ msg: "HCP info deleted successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};

// Get all hcpInfo rows of a specific HCProvider
export const getHcpProviderInfoByHcpId = async (req, res) => {
    try {
        const response = await hcpInfo.findAll({
            where: { hcp_id: req.params.hcp_id }
        });
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};
