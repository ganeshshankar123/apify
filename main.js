import { PlaywrightCrawler, Dataset, KeyValueStore, log } from 'crawlee';
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;'));


return `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${rows.map(r => `<tr>${r.map(c => `<td>${safe(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
}


function chunkArray(arr, n) {
const out = [];
for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
return out;
}


// Crawler
const crawler = new PlaywrightCrawler({
maxConcurrency: 5,
maxRequestRetries: 2,
requestHandlerTimeoutSecs: 120,


requestHandler: async ({ request, page, enqueueLinks, log, session }) => {
log.info(`Processing: ${request.url}`);


// wait for the page to load; ETSI pages are mostly server-rendered, but play safe
await page.waitForLoadState('networkidle');


const html = await page.content();


// Save raw page HTML
if (SAVE_RAW_HTML) {
const key = `raw_${encodeURIComponent(request.url)}.html`;
await KeyValueStore.getDefault().setValue(key, html, { contentType: 'text/html' });
}


// Extract rows
const rows = extractTableRows(html);


// Push individual rows to dataset (with metadata)
for (let i = 0; i < rows.length; i++) {
await Dataset.pushData({ url: request.url, pageId: request.id, rowIndex: i + 1, row: rows[i] });
}


// Save chunked HTML and chunk metadata
const chunks = chunkArray(rows, ROWS_PER_CHUNK);
for (let ci = 0; ci < chunks.length; ci++) {
const chunkRows = chunks[ci];
const chunkHtml = buildChunkHtml(chunkRows);
const chunkKey = `chunk_${encodeURIComponent(request.url)}_p${ci + 1}.html`;
if (SAVE_CHUNK_HTML) {
await KeyValueStore.getDefault().setValue(chunkKey, chunkHtml, { contentType: 'text/html' });
}
await Dataset.pushData({ url: request.url, pageId: request.id, chunk: ci + 1, rowsCount: chunkRows.length, rows: chunkRows });
}


// Enqueue links (if any) to follow typical navigation on ETSI IPR site
// Follow links that keep us on ipr.etsi.org domain
await enqueueLinks({
selector: 'a[href*="ipr.etsi.org"]',
pseudoUrls: ['https://ipr.etsi.org/[*]'],
strategy: 'same-hostname',
});
},


failedRequestHandler: async ({ request, log }) => {
log.error(`Request ${request.url} failed twice.`);
},
});


// Run
(async () => {
log.info('Starting ETSI IPR scraper');
await crawler.run([START_URL]);
log.info('Crawler finished');
})();
