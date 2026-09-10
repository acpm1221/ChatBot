import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { VectorStore } from "@langchain/core/vectorstores";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough, RunnableBranch } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { getSessionHistory, addToHistory } from "./chatHistory.js";
import dotenv from "dotenv";
dotenv.config();

// ── Minimal cosine-similarity in-memory vector store ────────────────────────
class SimpleMemoryVectorStore extends VectorStore {
  constructor(embeddings) {
    super(embeddings, {});
    this._items = []; // { doc, embedding }[]
  }
  _vectorstoreType() { return "simple-memory"; }

  async addDocuments(docs) {
    const texts = docs.map((d) => d.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);
    for (let i = 0; i < docs.length; i++) {
      this._items.push({ doc: docs[i], embedding: embeddings[i] });
    }
  }

  async similaritySearchVectorWithScore(queryEmbedding, k) {
    if (this._items.length === 0) return [];
    const cos = (a, b) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2;
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
    };
    const scored = this._items.map(({ doc, embedding }) => [doc, cos(queryEmbedding, embedding)]);
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, k);
  }
}

// ── Singletons ───────────────────────────────────────────────────────────────
let vectorStoreInstance = null;
let ragChainInstance = null;

export async function getVectorStore() {
  if (!vectorStoreInstance) {
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      modelName: "gemini-embedding-001",
    });
    vectorStoreInstance = new SimpleMemoryVectorStore(embeddings);
  }
  return vectorStoreInstance;
}

// ── LCEL-based RAG chain ─────────────────────────────────────────────────────
async function buildRagChain() {
  const vs = await getVectorStore();
  const retriever = vs.asRetriever({ k: 4 });

  const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-3.6-flash",
    temperature: 0,
  });

  // Step 1 — rephrase follow-ups as standalone questions
  const contextualizePrompt = ChatPromptTemplate.fromMessages([
    ["system", "Given the chat history and the latest user question, rewrite it as a standalone question. Do NOT answer it, just reformulate if needed, otherwise return it as-is."],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);

  const rephraseChain = contextualizePrompt.pipe(llm).pipe(new StringOutputParser());

  // Only rephrase when there IS history
  const conditionalRephrase = RunnableBranch.from([
    [
      (input) => input.chat_history && input.chat_history.length > 0,
      rephraseChain,
    ],
    // No history — just pass the input through
    (input) => input.input,
  ]);

  // Step 2 — retrieve docs based on (possibly rephrased) question
  const retrieveAndFormat = RunnableSequence.from([
    { input: conditionalRephrase, chat_history: (x) => x.chat_history },
    async (rephrased) => {
      const docs = await retriever.invoke(
        typeof rephrased.input === "string" ? rephrased.input : rephrased.input
      );
      return { docs, context: docs.map((d) => d.pageContent).join("\n\n") };
    },
  ]);

  // Step 3 — generate answer
  const qaPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a helpful assistant. Answer the user's question using ONLY the context below.
If the answer is not in the context, say "I don't have that information in the uploaded documents."
Cite the source file(s) at the end of your answer.

Context:
{context}`,
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);

  const answerChain = qaPrompt.pipe(llm).pipe(new StringOutputParser());

  return { retriever, rephraseChain: conditionalRephrase, answerChain };
}

export async function askQuestion(question, sessionId) {
  if (!ragChainInstance) {
    ragChainInstance = await buildRagChain();
  }

  const { retriever, rephraseChain, answerChain } = ragChainInstance;
  const history = getSessionHistory(sessionId);

  // 1. Rephrase if needed
  const standaloneQ = history.length > 0
    ? await rephraseChain.invoke({ input: question, chat_history: history })
    : question;

  // 2. Retrieve
  const docs = await retriever.invoke(standaloneQ);
  const context = docs.map((d) => d.pageContent).join("\n\n");

  // 3. Answer
  const answer = await answerChain.invoke({
    input: question,
    chat_history: history,
    context,
  });

  addToHistory(sessionId, question, answer);

  const sources = [...new Set(docs.map((d) => d.metadata?.source).filter(Boolean))];

  return { answer, sources };
}
