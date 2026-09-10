import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { ingestDocument } from "./src/loadDocs.js";
import { askQuestion } from "./src/ragChain.js";
import { clearSession } from "./src/chatHistory.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Upload + ingest a PDF
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        const filePath = req.file.path;
        const chunkCount = await ingestDocument(filePath, req.file.originalname);
        res.json({ message: "Document ingested", chunks: chunkCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Ask a question
app.post("/chat", async (req, res) => {
    try {
        const { question, sessionId } = req.body;
        const result = await askQuestion(question, sessionId || "default");
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Clear session history
app.delete("/session/:id", (req, res) => {
    clearSession(req.params.id);
    res.json({ message: "Session cleared" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
