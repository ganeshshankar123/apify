# ETSI IPR Details Scraper (Apify Actor)


This actor scrapes ETSI IPR detail pages (e.g. IPRDetails.aspx) and extracts table rows, saves raw HTML and chunked HTML snippets, and stores the results in the Apify dataset.


## Usage
- Replace START_URL in the environment or provide `startUrl` input when running the actor.
- Build using Apify Cloud (Node.js + Playwright environment) and run.


## Input example
{
"startUrl": "https://ipr.etsi.org/IPRDetails.aspx?IPRD_ID=9518&IPRD_TYPE_ID=2&MODE=2&sessionkey=875af8",
"rowsPerChunk": 20,
"saveRawHtml": true,
"saveChunkHtml": true
}
