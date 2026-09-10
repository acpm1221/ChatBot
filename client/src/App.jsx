import { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API = "http://localhost:5000";
const SESSION_ID = "session-" + Math.random().toString(36).slice(2, 8);

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
    </svg>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(null); // null | "loading" | "success" | "error"
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleFile = (f) => {
    if (f && f.type === "application/pdf") setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploadStatus("loading");
    try {
      const res = await axios.post(`${API}/upload`, formData);
      setUploadedDocs((prev) => [...prev, { name: file.name, chunks: res.data.chunks }]);
      setUploadStatus("success");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (err) {
      setUploadStatus("error");
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/chat`, { question: q, sessionId: SESSION_ID });
      setMessages((prev) => [...prev, {
        role: "ai",
        content: res.data.answer,
        sources: res.data.sources || [],
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "ai",
        content: "Sorry, something went wrong. Please try again.",
        error: true,
      }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <BotIcon />
            <span>DocChat</span>
          </div>
          <p className="sidebar-subtitle">AI-powered document Q&amp;A</p>
        </div>

        {/* Upload zone */}
        <div
          className={`drop-zone ${dragOver ? "drag-active" : ""} ${file ? "has-file" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadIcon />
          <p>{file ? file.name : "Drop a PDF here"}</p>
          <span>{file ? `${(file.size / 1024).toFixed(1)} KB` : "or click to browse"}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>

        <button
          className={`upload-btn ${!file ? "disabled" : ""} ${uploadStatus === "loading" ? "uploading" : ""}`}
          onClick={handleUpload}
          disabled={!file || uploadStatus === "loading"}
        >
          {uploadStatus === "loading" ? (
            <><span className="spinner" />Ingesting…</>
          ) : uploadStatus === "success" ? (
            "✓ Ingested!"
          ) : uploadStatus === "error" ? (
            "✗ Failed — retry"
          ) : (
            "Upload & Ingest PDF"
          )}
        </button>

        {/* Uploaded docs list */}
        {uploadedDocs.length > 0 && (
          <div className="docs-list">
            <p className="docs-label">Indexed Documents</p>
            {uploadedDocs.map((d, i) => (
              <div key={i} className="doc-item">
                <FileIcon />
                <div>
                  <span className="doc-name">{d.name}</span>
                  <span className="doc-meta">{d.chunks} chunks</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sidebar-footer">
          <p>Powered by Gemini 1.5 Flash</p>
          <p>Session: {SESSION_ID}</p>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="chat-area">
        <div className="chat-messages">
          {isEmpty && (
            <div className="empty-state">
              <div className="empty-icon"><BotIcon /></div>
              <h2>Chat with Your Documents</h2>
              <p>Upload a PDF on the left, then ask me anything about it.</p>
              <div className="suggestions">
                {["What is this document about?", "Summarize the key points", "What are the main findings?"].map((s) => (
                  <button key={s} className="suggestion-chip" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              {m.role === "ai" && (
                <div className="avatar"><BotIcon /></div>
              )}
              <div className={`bubble ${m.role} ${m.error ? "error" : ""}`}>
                <p>{m.content}</p>
                {m.sources && m.sources.length > 0 && (
                  <div className="sources">
                    {m.sources.map((s, j) => (
                      <span key={j} className="source-tag"><FileIcon />{s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message ai">
              <div className="avatar"><BotIcon /></div>
              <div className="bubble ai typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="input-bar">
          <div className="input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Ask something about your document…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              rows={1}
            />
            <button
              className={`send-btn ${(!input.trim() || loading) ? "disabled" : ""}`}
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              <SendIcon />
            </button>
          </div>
          <p className="input-hint">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </main>
    </div>
  );
}
