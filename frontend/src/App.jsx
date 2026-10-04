import { useState, useRef, useEffect, useLayoutEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API_URL = "http://localhost:5000/api/chat";
const STORAGE_KEY = "chefai_chat_history";
const SAVED_KEY = "chefai_saved_recipes";
const DIET_KEY = "chefai_diet_filters";
const THEME_KEY = "chefai_theme";
const TEMP_KEY = "chefai_temperature";

const PHOTO_PROMPT =
  "Here is a photo of my fridge/ingredients. Tell me what you can see, then suggest recipes.";

const SUGGESTIONS = [
  "Quick vegetarian dinner under 30 minutes",
  "What can I cook with eggs, rice and spinach?",
  "Easy gluten-free dessert",
  "High-protein breakfast ideas",
];

const DIETS = [
  "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Nut-free",
  "Egg-free", "High-protein", "Low-carb", "Halal",
];

// Quick builder options
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"];
const CUISINES = ["Indian", "Italian", "Chinese", "Mexican", "Mediterranean"];
const TIMES = ["15 minutes", "30 minutes", "1 hour"];
const INGREDIENTS = [
  "Eggs", "Rice", "Paneer", "Chicken", "Potato", "Tomato", "Onion", "Spinach",
  "Cheese", "Pasta", "Lentils", "Mushroom", "Bread", "Yogurt", "Capsicum", "Corn",
];

// ---------- localStorage helpers ----------
function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked - ignore */
  }
}

function loadHistory() {
  const saved = readJSON(STORAGE_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((m) => m && typeof m.text === "string" && m.text.trim());
}
function loadSaved() {
  const saved = readJSON(SAVED_KEY, []);
  return Array.isArray(saved) ? saved.filter((r) => r && r.text) : [];
}
function loadDiet() {
  const d = readJSON(DIET_KEY, []);
  return Array.isArray(d) ? d.filter((x) => DIETS.includes(x)) : [];
}
function loadTemp() {
  const t = Number(readJSON(TEMP_KEY, 0.7));
  return t >= 0.1 && t <= 0.9 ? Math.round(t * 10) / 10 : 0.7;
}
function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// ---------- Photo: shrink to max 1024px JPEG so uploads stay small ----------
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      URL.revokeObjectURL(url);
      resolve({ dataUrl, mimeType: "image/jpeg", data: dataUrl.split(",")[1] });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

// ---------- Split a model answer into intro / recipes / closing text ----------
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

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      className={`opt-chip ${active ? "active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

// One model answer, with action buttons under each recipe
function ModelMessage({ text, streaming, busy, savedList, onToggleSave, onAction }) {
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
                  <div className="card-actions">
                    <button
                      className={`save-btn ${isSaved ? "saved" : ""}`}
                      onClick={() => onToggleSave(p.recipe)}
                    >
                      {isSaved ? "★ Saved" : "☆ Save"}
                    </button>
                    <button
                      className="save-btn"
                      disabled={busy}
                      onClick={() => onAction("nutrition", p.recipe)}
                    >
                      🍎 Nutrition
                    </button>
                    <button
                      className="save-btn"
                      disabled={busy}
                      onClick={() => onAction("shopping", p.recipe)}
                    >
                      🛒 Shopping list
                    </button>
                    <select
                      className="save-btn act-select"
                      value=""
                      disabled={busy}
                      aria-label="Scale servings"
                      onChange={(e) => e.target.value && onAction("scale", p.recipe, e.target.value)}
                    >
                      <option value="">👥 Scale…</option>
                      {[1, 2, 4, 6, 8, 10].map((n) => (
                        <option key={n} value={n}>
                          For {n} {n === 1 ? "person" : "people"}
                        </option>
                      ))}
                    </select>
                  </div>
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
  const [diet, setDiet] = useState(loadDiet);
  const [saved, setSaved] = useState(loadSaved);
  const [view, setView] = useState("chat"); // "chat" | "cookbook"
  const [theme, setTheme] = useState(loadTheme);
  const [temperature, setTemperature] = useState(loadTemp);
  const [photo, setPhoto] = useState(null);
  const [notice, setNotice] = useState("");
  const [showBuilder, setShowBuilder] = useState(() => loadHistory().length === 0);
  const [b, setB] = useState({ meal: "", cuisine: "", time: "", items: [] });

  const bodyRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const fileRef = useRef(null);
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

  // Save chat once an answer is finished (photo previews are not stored)
  useEffect(() => {
    if (loading) return;
    writeJSON(
      STORAGE_KEY,
      messages.map((m) => {
        const copy = { ...m };
        delete copy.thumb;
        return copy;
      })
    );
  }, [messages, loading]);

  useEffect(() => writeJSON(DIET_KEY, diet), [diet]);
  useEffect(() => writeJSON(SAVED_KEY, saved), [saved]);
  useEffect(() => writeJSON(TEMP_KEY, temperature), [temperature]);

  // Apply theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const showNotice = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 4000);
  };

  const toggleDiet = (d) =>
    setDiet((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const toggleSave = (recipe) =>
    setSaved((cur) =>
      cur.some((r) => r.text === recipe.text)
        ? cur.filter((r) => r.text !== recipe.text)
        : [{ id: Date.now(), title: recipe.title, text: recipe.text }, ...cur]
    );

  const removeSaved = (id) => setSaved((cur) => cur.filter((r) => r.id !== id));

  const copyRecipe = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked - ignore */
    }
  };

  // ---------- Quick builder ----------
  const setSingle = (key, value) =>
    setB((c) => ({ ...c, [key]: c[key] === value ? "" : value }));
  const toggleItem = (item) =>
    setB((c) => ({
      ...c,
      items: c.items.includes(item) ? c.items.filter((x) => x !== item) : [...c.items, item],
    }));
  const builderReady = b.meal || b.cuisine || b.time || b.items.length > 0;

  const buildPrompt = () => {
    let p = `Give me ${b.meal ? b.meal.toLowerCase() : "recipe"} ideas`;
    if (b.cuisine) p += ` in ${b.cuisine} style`;
    if (b.time) p += ` that take under ${b.time}`;
    if (b.items.length) p += ` using ${b.items.join(", ").toLowerCase()}`;
    return p + ".";
  };

  const runBuilder = () => {
    sendMessage(buildPrompt());
    setB({ meal: "", cuisine: "", time: "", items: [] });
  };

  // ---------- Photo ----------
  const onPhotoPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await fileToImage(file));
    } catch {
      showNotice("Couldn't read that image. Please try a JPG or PNG photo.");
    }
  };

  // ---------- Recipe action buttons ----------
  const handleAction = (type, recipe, value) => {
    const t = recipe.title;
    if (type === "nutrition") sendMessage(`Give the approximate nutrition per serving for the "${t}" recipe.`);
    if (type === "shopping") sendMessage(`Make a shopping list for the "${t}" recipe.`);
    if (type === "scale") sendMessage(`Scale the "${t}" recipe to serve ${value} ${Number(value) === 1 ? "person" : "people"}.`);
  };

  const shoppingForSaved = () => {
    const list = saved.slice(0, 8);
    const names = list.map((r) => r.title).join(", ");
    const context =
      "Make ONE combined shopping list for these recipes, merging duplicate ingredients and adding up quantities.\n\n" +
      list.map((r) => r.text).join("\n\n=====\n\n");
    setView("chat");
    sendMessage(`Combined shopping list for my saved recipes: ${names}`, context);
  };

  // ---------- Send ----------
  const sendMessage = async (override, context) => {
    const withPhoto = override === undefined && photo;
    const text = (override ?? input).trim() || (withPhoto ? PHOTO_PROMPT : "");
    if (!text || loading) return;

    const userMsg = { role: "user", text };
    if (context) userMsg.context = context;
    if (withPhoto) {
      userMsg.hasImage = true;
      userMsg.thumb = photo.dataUrl;
    }
    const image = withPhoto ? { mimeType: photo.mimeType, data: photo.data } : undefined;

    const history = [...messages, userMsg];
    stickToBottom.current = true;
    setMessages([...history, { role: "model", text: "" }]);
    setInput("");
    if (withPhoto) setPhoto(null);
    setShowBuilder(false);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({
            role: m.role,
            text: m.context || m.text,
            error: m.error,
          })),
          diet,
          temperature,
          image,
        }),
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
        setMessages([...history, { role: "model", text: `⚠️ ${err.message}`, error: true }]);
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
    setShowBuilder(true);
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
  const tempLabel = temperature <= 0.3 ? "Precise" : temperature <= 0.6 ? "Balanced" : "Creative";
  const canSend = input.trim() || photo;

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
            <button
              className="clear-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark or light mode"
              title="Toggle theme"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button className="clear-btn" onClick={() => setView(inCookbook ? "chat" : "cookbook")}>
              {inCookbook ? "← Chat" : <>📖<span className="hide-sm"> Cookbook</span> ({saved.length})</>}
            </button>
            {!inCookbook && messages.length > 0 && (
              <button className="clear-btn" onClick={clearChat}>
                New<span className="hide-sm"> chat</span>
              </button>
            )}
          </div>
        </header>

        {/* ---------- Diet filter bar ---------- */}
        {!inCookbook && (
          <div className="diet-bar" role="group" aria-label="Diet filters">
            <span className="diet-label">Diet:</span>
            {DIETS.map((d) => (
              <button
                key={d}
                className={`diet-chip ${diet.includes(d) ? "active" : ""}`}
                onClick={() => toggleDiet(d)}
                aria-pressed={diet.includes(d)}
              >
                {d}
              </button>
            ))}
            {diet.length > 0 && (
              <button className="diet-clear" onClick={() => setDiet([])}>
                Clear
              </button>
            )}
          </div>
        )}

        {/* ---------- Cookbook view ---------- */}
        {inCookbook ? (
          <main className="chat-body">
            {saved.length === 0 ? (
              <div className="welcome">
                <div className="welcome-icon">📖</div>
                <h2>Your cookbook is empty</h2>
                <p>Tap “Save” under any recipe in the chat and it will appear here.</p>
              </div>
            ) : (
              <>
                <button className="primary-sm" onClick={shoppingForSaved} disabled={loading}>
                  🛒 Shopping list for all saved
                </button>
                {saved.map((r) => (
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
                ))}
              </>
            )}
          </main>
        ) : (
          <>
            <main className="chat-body" ref={bodyRef} onScroll={handleScroll}>
              {messages.length === 0 && (
                <div className="welcome">
                  <div className="welcome-icon">👨‍🍳</div>
                  <h2>What are we cooking today?</h2>
                  <p>Tap the ✨ builder below, snap a 📷 photo of your fridge, or try one of these:</p>
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
                      Chef is cooking…
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
                        busy={loading}
                        savedList={saved}
                        onToggleSave={toggleSave}
                        onAction={handleAction}
                      />
                    ) : (
                      <>
                        {m.thumb && <img className="thumb" src={m.thumb} alt="Your upload" />}
                        {!m.thumb && m.hasImage && <div className="photo-tag">📷 Photo attached</div>}
                        {m.text}
                      </>
                    )}
                  </div>
                );
              })}
            </main>

            <div className="composer">
              {/* Quick builder */}
              {showBuilder && (
                <div className="builder">
                  <div className="b-row">
                    <span className="b-label">Meal</span>
                    {MEALS.map((x) => (
                      <Chip key={x} active={b.meal === x} onClick={() => setSingle("meal", x)}>{x}</Chip>
                    ))}
                  </div>
                  <div className="b-row">
                    <span className="b-label">Cuisine</span>
                    {CUISINES.map((x) => (
                      <Chip key={x} active={b.cuisine === x} onClick={() => setSingle("cuisine", x)}>{x}</Chip>
                    ))}
                  </div>
                  <div className="b-row">
                    <span className="b-label">Time</span>
                    {TIMES.map((x) => (
                      <Chip key={x} active={b.time === x} onClick={() => setSingle("time", x)}>{x}</Chip>
                    ))}
                  </div>
                  <div className="b-row">
                    <span className="b-label">I have</span>
                    {INGREDIENTS.map((x) => (
                      <Chip key={x} active={b.items.includes(x)} onClick={() => toggleItem(x)}>{x}</Chip>
                    ))}
                  </div>
                  <div className="b-actions">
                    <button className="primary-sm" disabled={!builderReady || loading} onClick={runBuilder}>
                      Get 3 recipes
                    </button>
                    {builderReady && (
                      <button
                        className="link-btn"
                        onClick={() => setB({ meal: "", cuisine: "", time: "", items: [] })}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Photo preview */}
              {photo && (
                <div className="photo-preview">
                  <img src={photo.dataUrl} alt="Selected" />
                  <span>Photo ready. Press Send, or add a note first.</span>
                  <button onClick={() => setPhoto(null)} aria-label="Remove photo">✕</button>
                </div>
              )}

              {notice && <div className="notice">{notice}</div>}

              {/* Toolbar: builder, photo, temperature */}
              <div className="toolbar">
                <button
                  className={`tool-btn ${showBuilder ? "on" : ""}`}
                  onClick={() => setShowBuilder((s) => !s)}
                >
                  ✨ Builder
                </button>
                <button className="tool-btn" onClick={() => fileRef.current?.click()} disabled={loading}>
                  📷 Photo
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onPhotoPicked}
                />
                <label className="temp" title="Low = precise and consistent, High = creative and varied">
                  <span>🌡</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(Math.round(Number(e.target.value) * 10) / 10)}
                    aria-label="Creativity (temperature)"
                  />
                  <b>{temperature.toFixed(1)}</b>
                  <small>{tempLabel}</small>
                </label>
              </div>

              <footer className="chat-input">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    photo
                      ? "Add a note about your photo (optional)…"
                      : diet.length
                      ? `Ask for a recipe (${diet.join(", ")})…`
                      : "Or type what you want to cook…"
                  }
                  aria-label="Message"
                />
                {loading ? (
                  <button className="stop-btn" onClick={stopGenerating}>
                    Stop
                  </button>
                ) : (
                  <button onClick={() => sendMessage()} disabled={!canSend}>
                    Send
                  </button>
                )}
              </footer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
