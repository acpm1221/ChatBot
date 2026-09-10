import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getVectorStore } from "./ragChain.js";

export async function ingestDocument(filePath, originalName) {
    // 1. Load
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();

    // Attach source filename to metadata (used later for citations)
    docs.forEach((d) => (d.metadata.source = originalName));

    // 2. Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });
    const chunks = await splitter.splitDocuments(docs);

    // 3. Embed + store (see ragChain.js for vectorStore setup)
    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments(chunks);

    return chunks.length;
}