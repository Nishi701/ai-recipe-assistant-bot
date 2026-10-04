import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.Gemini_API_Key;
const PORT = process.env.PORT || 5000;
const MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];

const ALLOWED_DIETS = [
  "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Nut-free",
  "Egg-free", "High-protein", "Low-carb", "Halal",
];
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

if (!API_KEY) {
  console.error("Missing Gemini_API_Key in backend/.env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const SYSTEM_PROMPT = `You are "ChefAI", a friendly and expert cooking assistant.
Only help with food, recipes, ingredients, substitutions, meal planning, cooking techniques, nutrition basics and kitchen tips.
If the user asks about something unrelated to food or cooking, politely say you can only help with cooking and steer back to food.

IMPORTANT: Whenever the user asks for a recipe or dish idea, ALWAYS give exactly 3 different recipes.
- Each recipe must use a different main ingredient combination, flavour profile or cooking method
  (for example: one classic, one quick/easy, one creative twist).
- If the user lists ingredients, build each recipe around a different mix of those ingredients,
  and mention any extra ingredients needed.
- Start with one short friendly sentence, then give the 3 recipes, then end with one short follow-up question.
- Put a line containing only --- between recipes AND after the 3rd recipe (before the follow-up question).

Use this Markdown format for EACH recipe:

## 1. Recipe Name
**Style:** classic / quick / creative | **Prep:** ... | **Cook:** ... | **Serves:** ...
**Key ingredients:** the ingredients that make this version different

### Ingredients
- item with quantity

### Instructions
1. Step one
2. Step two

### Tip
- one helpful tip or variation

SPECIAL REQUESTS (do NOT give 3 recipes for these; answer only what is asked, keep it short):
1. Scale servings: rewrite ONLY that one recipe in the same format above (starting with "## Recipe Name"),
   with every ingredient quantity recalculated for the new number of servings and cooking times adjusted if needed.
   Update the "Serves" value. Do not use --- lines.
2. Nutrition: give approximate values PER SERVING for that recipe as a bullet list (not a table):
   Calories, Protein, Carbs, Fat, Fibre. Use "###" headings only (never "##"), and say these are estimates.
3. Shopping list: list every ingredient needed, grouped under "###" headings by aisle
   (Fruits & Vegetables, Dairy & Eggs, Grains & Pantry, Spices & Sauces, Meat & Fish, Other)
   as "- item - quantity" bullets. Put common pantry staples (salt, oil, water) under "### Probably already at home".
   Never use "##" headings or --- lines. If several recipes are given, merge duplicate ingredients and add up quantities.
4. Photo: if an image is attached, first give a short bullet list titled "### What I can see" with the food
   ingredients visible (say so if you are unsure), then give the usual 3 recipes using those ingredients.
   If the image has no food, politely say so and ask for a food or fridge photo.

Ask about allergies when relevant.
Use metric and common household measures (cups, tbsp).`;

// ---------- Retry helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (err) => `${err?.status} ${err?.code} ${err?.message}`;
const isBusy = (err) => /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(errText(err));
const isNotFound = (err) => /404|NOT_FOUND/i.test(errText(err));

async function openStream(contents, systemInstruction, temperature) {
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: { systemInstruction, temperature },
        });
        const iterator = stream[Symbol.asyncIterator]();
        const first = await iterator.next();
        console.log(`Using model: ${model} (temperature ${temperature})`);
        return { iterator, first };
      } catch (err) {
        lastErr = err;
        console.error(`[${model}] attempt ${attempt} failed:`, err.message);
        if (isNotFound(err)) break;
        if (!isBusy(err)) throw err;
        await sleep(attempt * 1500);
      }
    }
  }
  throw lastErr;
}

// ---------- App ----------
const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "8mb" })); // room for one photo

app.get("/", (req, res) => res.send("ChefAI backend running"));

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, diet, temperature, image } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const contents = messages
      .filter((m) => !m.error && typeof m.text === "string" && m.text.trim())
      .slice(-20)
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));

    if (contents.length === 0) {
      return res.status(400).json({ error: "No valid messages" });
    }

    // Attach the photo (if any) to the latest user message
    const last = contents[contents.length - 1];
    if (
      image &&
      last.role === "user" &&
      ALLOWED_MIME.includes(image.mimeType) &&
      typeof image.data === "string" &&
      image.data.length < 6_000_000
    ) {
      last.parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }

    // Temperature: clamp to 0.1 - 0.9
    const temp = Math.min(0.9, Math.max(0.1, Number(temperature) || 0.7));

    const diets = Array.isArray(diet) ? diet.filter((d) => ALLOWED_DIETS.includes(d)) : [];
    const systemInstruction = diets.length
      ? `${SYSTEM_PROMPT}\n\nSTRICT USER DIET FILTERS: ${diets.join(", ")}.
Every recipe MUST comply with ALL of these filters. Never use an ingredient that breaks them.
Mention the active filters in your one-sentence intro.`
      : SYSTEM_PROMPT;

    const { iterator, first } = await openStream(contents, systemInstruction, temp);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let clientClosed = false;
    res.on("close", () => (clientClosed = true));

    try {
      if (!first.done && first.value?.text) res.write(first.value.text);
      if (!first.done) {
        while (!clientClosed) {
          const { value, done } = await iterator.next();
          if (done) break;
          if (value?.text) res.write(value.text);
        }
      }
    } catch (streamErr) {
      console.error("Stream error:", streamErr.message);
      if (!clientClosed) res.write("\n\n⚠️ The response was interrupted. Please try again.");
    }

    res.end();
  } catch (err) {
    console.error("Gemini error:", err.message);
    const status = isBusy(err) ? 503 : 500;
    const message = isBusy(err)
      ? "Gemini is very busy right now. Please try again in a minute."
      : "Chef ran into a problem. Please try again.";
    if (!res.headersSent) res.status(status).json({ error: message });
    else res.end();
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));