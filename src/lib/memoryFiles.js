function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function titleFromPrompt(prompt = "", fallback = "Imported memory") {
  const firstLine = normalizeText(prompt).split("\n").find(Boolean) || fallback;
  return firstLine.length > 72 ? `${firstLine.slice(0, 72).trim()}...` : firstLine;
}

function splitTextMemory(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error("This file is empty.");
  }

  const promptMatch = normalized.match(/(?:^|\n)prompt:\s*([\s\S]*?)(?:\n(?:answer|response):\s*|$)/i);
  const answerMatch = normalized.match(/(?:^|\n)(?:answer|response):\s*([\s\S]*)$/i);
  const prompt = normalizeText(promptMatch?.[1] || "");
  const answer = normalizeText(answerMatch?.[1] || normalized);

  return {
    heading: titleFromPrompt(prompt || answer),
    prompt: prompt || "Imported conversation",
    answer,
  };
}

export async function parseMemoryImportFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const raw = await file.text();

  if (name.endsWith(".json") || name.endsWith(".atlasmemory")) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Could not read ${file.name} as JSON.`);
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        heading: parsed.heading || parsed.memory_heading || titleFromPrompt(parsed.prompt || parsed.answer),
        prompt: parsed.prompt || "Imported conversation",
        answer: parsed.answer || parsed.response_summary || "",
        created_at: parsed.created_at || parsed.as_of || "",
        theme_id: parsed.theme_id || "imported-memory",
        theme_label: parsed.theme_label || "Imported Memory",
        horizon: parsed.horizon || "daily",
        analysis_mode: parsed.analysis_mode || "imported",
        importance_analysis: parsed.importance_analysis || "",
        local_impact_analysis: parsed.local_impact_analysis || "",
        global_impact_analysis: parsed.global_impact_analysis || "",
        emerging_theme_analysis: parsed.emerging_theme_analysis || "",
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    }

    throw new Error(`Unsupported JSON structure in ${file.name}.`);
  }

  if (/\.(txt|md|markdown|log)$/i.test(name)) {
    return splitTextMemory(raw);
  }

  throw new Error(`Unsupported file type for ${file.name}. Use .json, .atlasmemory, .txt, or .md.`);
}

export function exportMemoryEntryFile(memoryEntry) {
  const payload = {
    heading: memoryEntry?.heading || "Memory export",
    theme_id: memoryEntry?.theme_id || "unclassified",
    theme_label: memoryEntry?.theme_label || "Unclassified",
    created_at: memoryEntry?.created_at || memoryEntry?.as_of || new Date().toISOString(),
    prompt: memoryEntry?.prompt || "",
    answer: memoryEntry?.answer || "",
    horizon: memoryEntry?.horizon || "daily",
    analysis_mode: memoryEntry?.analysis_mode || "intelligence",
    importance_analysis: memoryEntry?.importance_analysis || "",
    local_impact_analysis: memoryEntry?.local_impact_analysis || "",
    global_impact_analysis: memoryEntry?.global_impact_analysis || "",
    emerging_theme_analysis: memoryEntry?.emerging_theme_analysis || "",
    sources: Array.isArray(memoryEntry?.sources) ? memoryEntry.sources : [],
  };

  const slug = String(memoryEntry?.heading || "memory-export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "memory-export";

  return {
    fileName: `${slug}.atlasmemory.json`,
    content: JSON.stringify(payload, null, 2),
  };
}
