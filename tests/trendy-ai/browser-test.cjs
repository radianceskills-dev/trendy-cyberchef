const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {chromium} = require("playwright-core");

const root = path.resolve(process.argv[2] || "build/prod");
const chrome = process.argv[3] || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const types = {".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".ico": "image/x-icon"};

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
    }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
});

(async () => {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({executablePath: chrome, headless: true});
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    let requestBody;
    await page.addInitScript(() => {
        localStorage.setItem("trendytools.ai.v1", JSON.stringify({
            transport: "openai",
            provider: "custom",
            providerLabel: "Mock provider",
            endpoint: "https://mock.invalid/v1/chat/completions",
            apiKey: "test-key",
            model: "test-model",
        }));
    });
    await page.route("https://mock.invalid/v1/chat/completions", async route => {
        requestBody = route.request().postDataJSON();
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({choices: [{message: {content: JSON.stringify({
                version: 1,
                title: "Decode and hash",
                steps: [
                    {operation: "From Base64", arguments: {}},
                    {operation: "SHA2", arguments: {size: "256"}},
                ],
                warnings: [],
            })}}]}),
        });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => window.app?.appLoaded && window.app?.workerLoaded && window.app?.waitersLoaded);
    await page.evaluate(() => window.app.setInput("PRIVATE-CYBERCHEF-INPUT"));
    await page.click("#trendy-ai-recipe-button");
    await page.fill("#trendy-ai-recipe-prompt", "Decode Base64 then hash with SHA-256");
    await page.click("#trendy-ai-recipe-generate");
    await page.waitForSelector("#trendy-ai-recipe-apply:not(.d-none)");
    if (JSON.stringify(requestBody).includes("PRIVATE-CYBERCHEF-INPUT")) throw new Error("CyberChef input leaked into provider request.");
    const before = await page.evaluate(() => ({input: window.app.manager.input.getInput(), recipe: window.app.getRecipeConfig()}));
    if (before.recipe.length !== 0) throw new Error("Recipe changed before review confirmation.");
    await page.click("#trendy-ai-recipe-apply");
    const after = await page.evaluate(() => ({input: window.app.manager.input.getInput(), recipe: window.app.getRecipeConfig()}));
    if (after.input !== "PRIVATE-CYBERCHEF-INPUT") throw new Error("CyberChef input changed when recipe loaded.");
    if (after.recipe.length !== 2 || after.recipe[0].op !== "From Base64" || after.recipe[1].op !== "SHA2") throw new Error("Reviewed recipe was not loaded correctly.");
    console.log("CyberChef AI browser test passed.");
    await browser.close();
    server.close();
})().catch(error => {
    console.error(error);
    server.close();
    process.exitCode = 1;
});
