import { PlaywrightCrawler, Dataset, log } from 'crawlee';

const START_URL = "https://example.com";   // change this to any test page

const crawler = new PlaywrightCrawler({
    maxConcurrency: 3,

    async requestHandler({ page, request }) {
        log.info(`Scraping: ${request.url}`);

        await page.waitForLoadState("domcontentloaded");

        const title = await page.title();
        const links = await page.$$eval("a", (as) =>
            as.map(a => ({ text: a.innerText.trim(), href: a.href }))
        );

        await Dataset.pushData({
            url: request.url,
            title,
            links
        });
    }
});

await crawler.run([START_URL]);
