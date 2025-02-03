import { google } from 'googleapis';
import { File } from '../models/fileModel.js';
import { User } from '../models/userModel.js'; 
import dotenv from 'dotenv';

dotenv.config();

// Function to create a Google Drive client for each account
const getDriveClient = (accessToken) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    return google.drive({ version: 'v3', auth });
};

// function to fetch files from a single Google Drive account
const fetchFilesFromDrive = async (driveClient) => {
    try {
        const response = await driveClient.files.list({
            pageSize: 100, // fetches up to 100 files
            fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
        });
        return response.data.files;
    } catch (error) {
        console.error('Error fetching files:', error);
        return [];
    }
};

// **Function to merge files 
export const mergeStorage = async (req, res) => {
    try {
        const userId = req.user.id; 
        const user = await User.findById(userId);

        if (!user || !user.driveAccounts || user.driveAccounts.length === 0) {
            return res.status(400).json({ message: 'No linked Google Drive accounts.' });
        }

        let allFiles = [];

        for (const account of user.driveAccounts) {
            const driveClient = getDriveClient(account.accessToken);
            const files = await fetchFilesFromDrive(driveClient);
            
            allFiles = [...allFiles, ...files.map(file => ({
                ...file,
                driveAccount: account.email, 
            }))];
        }

        res.json({ files: allFiles });
    } catch (error) {
        console.error('Error merging storage:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

