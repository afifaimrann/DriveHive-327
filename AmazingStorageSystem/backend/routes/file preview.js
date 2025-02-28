// wrote this ahead of time. didnt had time to check
//28 feb


const fetchFile = async (fileUrl, isChunked) => {
    try {
        const response = await axios.get(fileUrl, { responseType: "stream" });

        return new Promise((resolve, reject) => {
            let data = [];

            response.data.on("data", (chunk) => {
                data.push(chunk);
                if (isChunked) {
                    // if chunked stream the response
                    response.data.pause(); // pause the stream after sending a chunk
                    setTimeout(() => response.data.resume(), 100); // resume after a delay
                }
            });

            response.data.on("end", () => {
                resolve(Buffer.concat(data));
            });

            response.data.on("error", (err) => reject(err));
        });
    } catch (error) {
        throw new Error(error.message);
    }
};

// file  preview
app.get("/preview", async (req, res) => {
    try {
        const { url, chunked } = req.query;
        if (!url) {
            return res.status(400).json({ error: "File URL is required" });
        }

        const isChunked = chunked === "true";
        const fileBuffer = await fetchFile(url, isChunked);

        res.setHeader("Content-Type", "application/octet-stream");
        res.send(fileBuffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
