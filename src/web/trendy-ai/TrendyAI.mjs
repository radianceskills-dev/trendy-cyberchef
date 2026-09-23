/* eslint-disable */
import {buildOperationPrompt, normalizeRecipe, parseRecipeResponse} from "./RecipeSchema.mjs";

const STORAGE_KEY = "trendytools.ai.v1";
const PROVIDERS = {
    openrouter: {label: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/chat/completions"},
    bai: {label: "B.AI", endpoint: "https://api.b.ai/v1/chat/completions"},
};

function readSettings() {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (value?.transport === "puter" && value.provider === "puter") return {...value, providerLabel: "Puter"};
        if (value?.provider === "opencode") {
            value.provider = "custom";
            value.providerLabel = "Custom provider";
            value.endpoint = "https://opencode.ai/zen/v1/chat/completions";
        }
        if (!value || (!PROVIDERS[value.provider] && value.provider !== "custom")) return null;
        if (typeof value.apiKey !== "string" || !value.apiKey.trim()) return null;
        if (typeof value.model !== "string" || !value.model.trim()) return null;
        const endpoint = PROVIDERS[value.provider]?.endpoint || value.endpoint;
        if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) return null;
        return {...value, endpoint, providerLabel: PROVIDERS[value.provider]?.label || value.providerLabel || "Custom provider"};
    } catch {
        return null;
    }
}

function extractContent(payload) {
    const content = payload?.choices?.[0]?.message?.content ?? payload?.message?.content ?? payload;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map(part => typeof part === "string" ? part : part?.text || "").join("");
    return "";
}

function loadPuter() {
    if (window.puter) return Promise.resolve(window.puter);
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://js.puter.com/v2/";
        script.onload = () => window.puter ? resolve(window.puter) : reject(new Error("Puter.js did not initialize."));
        script.onerror = () => reject(new Error("Could not load Puter.js."));
        document.head.appendChild(script);
    });
}

function systemPrompt(app) {
    return `You create CyberChef recipes from natural-language transformation requests.
Return raw JSON only. Do not use Markdown fences or explanatory text.
Schema: {"version":1,"title":"short title","steps":[{"operation":"exact operation name","arguments":{}}],"warnings":[]}

Rules:
- Use only operations listed below and exact names.
- Use named arguments and omit optional arguments when defaults are suitable.
- Never invent secrets, passwords, input data, output data, files, or network operations.
- Maximum 12 steps.
- If the request is ambiguous, return the safest deterministic interpretation and add a warning.

Available operations:
${buildOperationPrompt(app.operations)}`;
}

function addText(parent, tag, text, className="") {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    parent.appendChild(el);
    return el;
}

export function initTrendyAI(app) {
    const button = document.getElementById("trendy-ai-recipe-button");
    const modal = document.getElementById("trendy-ai-recipe-modal");
    if (!button || !modal || button.dataset.initialized === "true") return;
    button.dataset.initialized = "true";
    const prompt = document.getElementById("trendy-ai-recipe-prompt");
    const generate = document.getElementById("trendy-ai-recipe-generate");
    const apply = document.getElementById("trendy-ai-recipe-apply");
    const provider = document.getElementById("trendy-ai-recipe-provider");
    const status = document.getElementById("trendy-ai-recipe-status");
    const review = document.getElementById("trendy-ai-recipe-review");
    let controller;
    let proposal;
    let previousFocus;

    function setStatus(message, type="") {
        status.textContent = message;
        status.dataset.type = type;
    }

    function updateState() {
        const settings = readSettings();
        provider.textContent = settings ? settings.providerLabel : "Not configured";
        provider.dataset.ready = String(Boolean(settings));
        generate.disabled = !settings || !prompt.value.trim() || Boolean(controller);
        if (!settings && !controller) setStatus("Configure AI on the Trendy Tools dashboard first.", "warning");
    }

    function resetProposal() {
        proposal = null;
        review.replaceChildren();
        review.classList.add("d-none");
        apply.classList.add("d-none");
    }

    function renderProposal(recipe) {
        review.replaceChildren();
        review.classList.remove("d-none");
        addText(review, "h5", recipe.title);
        addText(review, "p", "Review every operation and argument before loading. No input data was sent and nothing has run.");
        const list = document.createElement("ol");
        for (const step of recipe.steps) {
            const item = document.createElement("li");
            addText(item, "strong", step.operation);
            addText(item, "code", Object.keys(step.arguments).length ? JSON.stringify(step.arguments) : "Default arguments");
            list.appendChild(item);
        }
        review.appendChild(list);
        for (const warning of recipe.warnings) addText(review, "p", warning, "trendy-ai-recipe-warning");
        apply.classList.remove("d-none");
        setStatus("Recipe proposal ready. Nothing has been loaded yet.", "success");
    }

    async function generateRecipe() {
        const settings = readSettings();
        const request = prompt.value.trim();
        if (!settings || !request || controller) return;
        resetProposal();
        controller = new AbortController();
        updateState();
        setStatus(`Creating with ${settings.providerLabel}...`);
        try {
            const messages = [{role: "system", content: systemPrompt(app)}, {role: "user", content: request}];
            let payload;
            if (settings.transport === "puter") {
                payload = await (await loadPuter()).ai.chat(messages, {model: settings.model || "gpt-5-nano", temperature: 0.1, normalize: true});
            } else {
                const response = await fetch(settings.endpoint, {
                    method: "POST",
                    headers: {"Authorization": `Bearer ${settings.apiKey.trim()}`, "Content-Type": "application/json"},
                    body: JSON.stringify({model: settings.model.trim(), messages, temperature: 0.1}),
                    signal: controller.signal,
                });
                try { payload = await response.json(); } catch { payload = {}; }
                if (!response.ok) throw new Error(payload?.error?.message || `Provider request failed (${response.status}).`);
            }
            proposal = normalizeRecipe(parseRecipeResponse(extractContent(payload)), app.operations);
            renderProposal(proposal);
        } catch (error) {
            resetProposal();
            setStatus(error.name === "AbortError" ? "Generation cancelled." : error.message || "Could not create a recipe.", "error");
        } finally {
            controller = undefined;
            updateState();
        }
    }

    function close() {
        controller?.abort();
        modal.classList.add("d-none");
        modal.setAttribute("aria-hidden", "true");
        previousFocus?.focus?.();
    }

    button.addEventListener("click", () => {
        previousFocus = document.activeElement;
        modal.classList.remove("d-none");
        modal.setAttribute("aria-hidden", "false");
        updateState();
        prompt.focus();
    });
    modal.querySelectorAll("[data-trendy-ai-recipe-close]").forEach(el => el.addEventListener("click", close));
    prompt.addEventListener("input", () => { resetProposal(); updateState(); });
    prompt.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            generateRecipe();
        }
    });
    generate.addEventListener("click", generateRecipe);
    apply.addEventListener("click", () => {
        if (!proposal) return;
        if (app.getRecipeConfig().length && !window.confirm("Replace the current recipe with this reviewed AI proposal?")) return;
        app.setRecipeConfig(proposal.config);
        window.dispatchEvent(app.manager.statechange);
        close();
    });
    window.addEventListener("storage", event => { if (event.key === STORAGE_KEY) updateState(); });
    window.addEventListener("focus", updateState);
    updateState();
}
