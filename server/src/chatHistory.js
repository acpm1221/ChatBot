import { HumanMessage, AIMessage } from "@langchain/core/messages";

// In-memory store: { sessionId: [messages] }
// Swap for Redis/DB in production
const sessions = {};

export function getSessionHistory(sessionId) {
  return sessions[sessionId] || [];
}

export function addToHistory(sessionId, userMsg, aiMsg) {
  if (!sessions[sessionId]) sessions[sessionId] = [];
  sessions[sessionId].push(new HumanMessage(userMsg));
  sessions[sessionId].push(new AIMessage(aiMsg));

  // Keep only last 10 turns to avoid context bloat
  if (sessions[sessionId].length > 20) {
    sessions[sessionId] = sessions[sessionId].slice(-20);
  }
}

export function clearSession(sessionId) {
  delete sessions[sessionId];
}
