import { useState, useRef, useEffect, useLayoutEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API_URL = "http://localhost:5000/api/chat";
const STORAGE_KEY = "chefai_chat_history";
const SAVED_KEY = "chefai_saved_recipes"; // NEW

const SUGGESTIONS = [
  "Quick vegetarian dinner under 30 minutes",
  "What can I cook with eggs, rice and spinach?",
  "Easy gluten-free dessert",
  "High-protein breakfast ideas",
];

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return [];
    return saved.filter((m) => m && typeof m.text === "string" && m.text.trim());
  } catch {
    return [];
  }
}

// NEW: load saved recipes safely
function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY));
    return Array.isArray(saved) ? saved.filter((r) => r && r.text) : [];
  } catch {
    return [];
  }
}

// NEW: split an answer into intro text and individual recipes
function parseMessage(text) {
  return text.split(/\n\s*-{3,}\s*(?:\n|$)/).map((part) => {
    const m = part.match(/^##\s+(.+)$/m);
    if (!m) return { intro: part, recipe: null };
    const title = m[1].replace(/^\d+\.\s*/, "").replace(/\*+/g, "").trim();
    return {
      intro: part.slice(0, m.index),
      recipe: { title, text: part.slice(m.index).trim() },
    };
  });
}

// NEW: renders one model answer with a Save button on each recipe
function ModelMessage({ text, streaming, savedList, onToggleSave }) {
  const parts = parseMessage(text);
  return (
    <>
      {parts.map((p, i) => {
        const isSaved = p.recipe && savedList.some((r) => r.text === p.recipe.text);
        return (
          <div key={i}>
            {p.intro.trim() && <ReactMarkdown>{p.intro}</ReactMarkdown>}
            {p.recipe && (
              <div className="recipe-card">
                <ReactMarkdown>{p.recipe.text}</ReactMarkdown>
                {!streaming && (
                  <button
                    className={`save-btn ${isSaved ? "saved" : ""}`}
                    onClick={() => onToggleSave(p.recipe)}
                  >
                    {isSaved ? "★ Saved" : "☆ Save recipe"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function App() {
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(loadSaved); // NEW
  const [view, setView] = useState("chat"); // NEW: "chat" | "cookbook"

  const bodyRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const stickToBottom = useRef(true);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, view]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [input, view]);

  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, loading]);

  // NEW: save the cookbook whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  // NEW
  const toggleSave = (recipe) =>
    setSaved((cur) =>
      cur.some((r) => r.text === recipe.text)
        ? cur.filter((r) => r.text !== recipe.text)
        : [{ id: Date.now(), title: recipe.title, text: recipe.text }, ...cur]
    );

  // NEW
  const removeSaved = (id) => setSaved((cur) => cur.filter((r) => r.id !== id));

  // NEW
  const copyRecipe = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked - ignore */
    }
  };

  const sendMessage = async (override) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;

    const history = [...messages, { role: "user", text }];
    stickToBottom.current = true;
    setMessages([...history, { role: "model", text: "" }]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "model", text: full }]);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setMessages(full ? [...history, { role: "model", text: full }] : history);
      } else {
        setMessages([
          ...history,
          { role: "model", text: `⚠️ ${err.message}`, error: true },
        ]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stopGenerating = () => abortRef.current?.abort();

  // Clears the chat only; saved recipes are kept
  const clearChat = () => {
    if (loading) stopGenerating();
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const inCookbook = view === "cookbook";

  return (
    <div className="app">
      <div className="chat">
        <header className="chat-header">
          <div className="brand">
            <span className="brand-icon">🍳</span>
            <div className="brand-text">
              <h1>ChefAI</h1>
              <span>Recipe Assistant</span>
            </div>
          </div>
          <div className="header-actions">
            {/* NEW: Cookbook toggle */}
            <button
              className="clear-btn"
              onClick={() => setView(inCookbook ? "chat" : "cookbook")}
            >
              {inCookbook ? "← Chat" : `📖 Cookbook (${saved.length})`}
            </button>
            {!inCookbook && messages.length > 0 && (
              <button className="clear-btn" onClick={clearChat}>
                New chat
              </button>
            )}
          </div>
        </header>

        {inCookbook ? (
          /* NEW: Cookbook view */
          <main className="chat-body">
            {saved.length === 0 ? (
              <div className="welcome">
                <div className="welcome-icon">📖</div>
                <h2>Your cookbook is empty</h2>
                <p>Tap “Save recipe” under any recipe in the chat and it will appear here.</p>
              </div>
            ) : (
              saved.map((r) => (
                <div key={r.id} className="recipe-card">
                  <ReactMarkdown>{r.text}</ReactMarkdown>
                  <div className="card-actions">
                    <button className="save-btn" onClick={() => copyRecipe(r.text)}>
                      Copy
                    </button>
                    <button className="save-btn danger" onClick={() => removeSaved(r.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </main>
        ) : (
          <>
            <main className="chat-body" ref={bodyRef} onScroll={handleScroll}>
              {messages.length === 0 && (
                <div className="welcome">
                  <div className="welcome-icon">👨‍🍳</div>
                  <h2>What are we cooking today?</h2>
                  <p>Ask for a dish and I'll give you 3 different recipe ideas.</p>
                  <div className="chips">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => sendMessage(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => {
                if (m.role === "model" && !m.text) {
                  return (
                    <div key={i} className="bubble model typing">
                      <span className="dots">
                        <i></i>
                        <i></i>
                        <i></i>
                      </span>
                      Chef is cooking up 3 ideas
                    </div>
                  );
                }
                const streaming = loading && i === messages.length - 1;
                return (
                  <div key={i} className={`bubble ${m.role} ${m.error ? "error" : ""}`}>
                    {m.role === "model" && !m.error ? (
                      <ModelMessage
                        text={m.text}
                        streaming={streaming}
                        savedList={saved}
                        onToggleSave={toggleSave}
                      />
                    ) : (
                      m.text
                    )}
                  </div>
                );
              })}
            </main>

            <footer className="chat-input">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask for a recipe…"
                aria-label="Message"
              />
              {loading ? (
                <button className="stop-btn" onClick={stopGenerating}>
                  Stop
                </button>
              ) : (
                <button onClick={() => sendMessage()} disabled={!input.trim()}>
                  Send
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}