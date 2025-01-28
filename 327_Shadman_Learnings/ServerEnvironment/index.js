//28-01-2025
/*Here the server side of the logic for app handling will be written. I am
planning on doing the slicing of the files in the frontend and backend will
just upload the sliced files. For now, these are my thoughts. Feel free to 
make or suggest changes. */

const express = require("express");
const PORT = 3000;
const app = express();

app.get("/test", (req,res)=>{
    res.send("Hello World");
})

app.listen(PORT, ()=> {
    console.log(`Server is running on port ${PORT}`);
})