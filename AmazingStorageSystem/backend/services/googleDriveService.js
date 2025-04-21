const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

const drive = google.drive({ version: "v3", auth: oauth2Client });

const uploadFile = async (file) => {
  const response = await drive.files.create({
    requestBody: { name: file.originalname, mimeType: file.mimetype },
    media: { mimeType: file.mimetype, body: file.buffer },
  });

  return response.data;
};

module.exports = { uploadFile };
