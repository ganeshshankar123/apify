// File: main.js
import { Actor } from 'apify';
import cheerio from 'cheerio';

// Configurable constants
const DEFAULT_START_URL = 'https://www.3gpp.org/'; // replace with actual CR list start URL
const ROWS_PER_CHUNK = 20; // change as needed

await Actor.init();
const input = await Actor.getInput();
const startUrl = input.startUrl || DEFAULT_START_URL;
const maxPages = input.maxPages || 0; // 0 = no limit
const saveRawHtml = input.saveRawHtml !== false; // default true
const saveChunkHtml = input.saveChunkHtml !== false; // default true

const browser = await Actor.launchPlaywrightChromium({
    // headless: false, // uncomment for debugging
});
const context = await browser.newContext();
const page = await context.newPage();

console.log('Navigating to', startUrl);
await page.goto(startUrl, { waitUntil: 'networkidle' });

let pageIndex = 0;
let totalRows = 0;

// Helper: extract table rows from page HTML using cheerio
function extractRowsFromHtml(html) {
    const $ = cheerio.load(html);
    // Heuristic: find the main table that contains change requests
    // You may want to tune selector to the exact table used on 3gpp site
    const table = $('table').first();
    const rows = [];
    table.find('tr').each((i, el) => {
        const cells = [];
        $(el).find('th, td').each((j, td) => {
            const txt = $(td).text().trim().replace(/[\t\n\r]+/g, ' ');
            cells.push(txt);
        });
        // exclude header-only rows
        if (cells.length > 0 && cells.some(c => c !== '')) rows.push(cells);
    });
    return rows;
}

// Helper: chunk an array into smaller arrays of size n
function chunkArray(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

// Main loop: paginate until no next or reached maxPages
while (true) {
    pageIndex += 1;
    console.log(`Processing page #${pageIndex}`);

    await page.waitForLoadState('networkidle');
    const html = await page.content();

    if (saveRawHtml) {
        const key = `raw_page_${pageIndex}.html`;
        await Actor.setValue(key, html, { contentType: 'text/html' });
    }

    // Extract rows
    const rows = extractRowsFromHtml(html);
    totalRows += rows.length;

    // Push raw rows to dataset (one item per row)
    for (const r of rows) {
        await Actor.pushData({ page: pageIndex, row: r });
    }

    // Create chunked HTML files and dataset entries
    const chunks = chunkArray(rows, ROWS_PER_CHUNK);
    for (let ci = 0; ci < chunks.length; ci++) {
        const chunkRows = chunks[ci];
        // Build a small HTML snippet for the chunk
        const chunkHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body><table> ${chunkRows.map(r => `<tr>${r.map(c => `<td>${Actor.escapeHtml ? Actor.escapeHtml(c) : c}</td>`).join('')}</tr>`).join('')} </table></body></html>`;
        const chunkKey = `page_${pageIndex}_chunk_${ci + 1}.html`;
        if (saveChunkHtml) await Actor.setValue(chunkKey, chunkHtml, { contentType: 'text/html' });

        // Add chunk metadata to dataset
        await Actor.pushData({ page: pageIndex, chunk: ci + 1, rowsCount: chunkRows.length, rows: chunkRows });
    }

    // Attempt to find "next" link. You may need to adjust selectors for 3GPP site.
    const nextCandidate = await page.$('a[rel="next"], a.next, a:has-text("Next"), a:has-text("next")');
    const hasNext = !!nextCandidate;

    if (maxPages > 0 && pageIndex >= maxPages) {
        console.log('Reached maxPages limit, stopping.');
        break;
    }

    if (!hasNext) {
        // Try another heuristic: look for a pager with an active page number and a following sibling
        const nextFromPager = await page.$('ul.pagination li.active + li a, .pager a.next');
        if (nextFromPager) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle' }),
                nextFromPager.click(),
            ]);
            continue;
        }
        console.log('No next link found, finishing.');
        break;
    }

    // Click next and continue
    try {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle' }),
            nextCandidate.click(),
        ]);
    } catch (err) {
        console.log('Clicking next failed, trying JS-driven navigation or scrolling... ', err.message);
        try {
            await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
            await page.waitForTimeout(1000);
        } catch (e) {
            console.warn('Fallback scroll failed', e.message);
            break;
        }
    }
}

console.log(`Finished. Pages processed: ${pageIndex}. Total rows found: ${totalRows}`);
await browser.close();
await Actor.exit();


// File: package.json

/*
{
  "name": "apify-3gpp-cr-actor",
  "version": "1.0.0",
  "description": "Apify actor to scrape 3GPP Change Requests (CR) tables, save per-page and per-chunk HTML, and push rows to dataset.",
  "main": "main.js",
  "scripts": {
    "start": "node main.js"
  },
  "dependencies": {
    "apify": "^3.0.0",
    "cheerio": "^1.0.0-rc.12"
  }
}
*/


// File: apify.json

/*
{
  "version": "0.2.0",
  "name": "apify-3gpp-cr-actor",
  "title": "3GPP CR Table Scraper",
  "description": "Scrapes 3GPP Change Requests tables, saves raw HTML and chunked HTML, and stores rows in dataset.",
  "buildTag": "latest",
  "platform": "apify",
  "input": {
    "type": "object",
    "properties": {
      "startUrl": { "type": "string" },
      "maxPages": { "type": "integer" },
      "saveRawHtml": { "type": "boolean" },
      "saveChunkHtml": { "type": "boolean" }
    }
  }
}
*/


// File: README.md

/*
# Apify Actor — 3GPP CR Table Scraper

## What this actor does
- Navigates to a configured start URL (3GPP CR list page)
- Paginate through results
- Saves per-page raw HTML (configurable)
- Extracts rows using Cheerio
- Splits rows into chunks (configurable size) and saves per-chunk HTML (configurable)
- Pushes individual rows and chunk metadata to Apify dataset

## How to use
1. Edit `main.js` and replace `DEFAULT_START_URL` with the actual 3GPP CR start page URL.
2. Package and push actor to Apify Cloud or run locally using the Apify CLI/SDK.

### Example input JSON
```json
{
  "startUrl": "https://www.3gpp.org/ftp/Specifications/",
  "maxPages": 0,
  "saveRawHtml": true,
  "saveChunkHtml": true
}
```

## Running locally
- `npm install`
- `node main.js` (or run through Apify CLI)

## Next steps / Customizations
- Tune the HTML selectors in `extractRowsFromHtml` to match the exact 3GPP table structure.
- Add retry logic and smarter next-link detection if the site uses JS-heavy pagination.
- Add a step to upload dataset contents to Azure Blob / S3 or send a webhook for downstream ingestion.
- If you later want to integrate your Ollama-based LLM, we can add an optional HTTP call per chunk.
*/
