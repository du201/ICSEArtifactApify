const Apify = require('apify');
const { log } = Apify.utils;
const fs = require('fs');

log.setLevel(log.LEVELS.DEBUG);

fs.readdirSync('./apify_storage/datasets/').forEach(domain => {
    fs.rmSync(`./apify_storage/datasets/${domain}`, { recursive: true, force: true });
});

fs.readdirSync('./apify_storage/request_queues/').forEach(queue => {
    fs.rmSync(`./apify_storage/request_queues/${queue}`, { recursive: true, force: true });
});

const WEBSITE_RANGE_START = 1; // from the top # website on the list
const WEBSITE_RANGE_END = 200; // to the top # website on the list
const MAX_CRAWL_PER_WEBSITE = 500;
const INTERVAL_BTW_VISIT_SAME_DOMAIN = 1000; // in ms
let START_TIME = Date.now();
let preRequestTimeObj = {};
let postRequestTimeObj = {};
let maxCrawlPerWebsiteObj = {};
let websiteWithUncrawledPagesObj = {}; // 1 means still have uncrawled pages

async function crawl() {
    startObjs = await Apify.getInput();
    let startUrls = startObjs.map((obj) => obj.url);
    let startDomains = startObjs.map((obj) => obj.domain);
    let urlsCrawled = startUrls.slice(WEBSITE_RANGE_START - 1, WEBSITE_RANGE_END);
    let domainsCrawled = startDomains.slice(WEBSITE_RANGE_START - 1, WEBSITE_RANGE_END);
    // let urlsCrawled = startUrls;
    // let domainsCrawled = startDomains;

    let lastTimeCrawledObj = {};
    let lockObj = {};
    let htmlNumObj = {}; // used to label the name for downloaded html files for each domain, starting with 1

    const requestList = await Apify.openRequestList(
        'start-urls',
        urlsCrawled);
    const requestQueue = await Apify.openRequestQueue('web-crawling');

    await domainsCrawled.forEach(async (domain) => {
        // delete the dataset if already existed
        let dataset = await Apify.openDataset(domain);
        await dataset.drop();
        log.debug(`dropped ${domain} dataset`);

        maxCrawlPerWebsiteObj[domain] = 1;
        lastTimeCrawledObj[domain] = 0; // 0 => the domain hasn't been crawled
        lockObj[domain] = 1; // 1 => the lock has not been taken
        preRequestTimeObj[domain] = [];
        postRequestTimeObj[domain] = [];
        htmlNumObj[domain] = 1;
        websiteWithUncrawledPagesObj[domain] = 0;

        // create folders to store downloaded html and js files
        // fs.mkdirSync(`./source_file/${domain}/`);
        // fs.mkdirSync(`./source_file/${domain}/html/`);
        // fs.mkdirSync(`./source_file/${domain}/js/`);
        // fs.mkdirSync(`./source_file/${domain}/regex/`);
        // fs.mkdirSync(`./source_file/${domain}/regex/html/`);
        // fs.mkdirSync(`./source_file/${domain}/regex/js/`);
    });


    const handlePageFunction = async ({ request, $ }) => {
        log.debug(`handlePageFunction starts at ${Date.now() - START_TIME} ms`);
        let targetUrlObject = new URL(request.url);
        let targetOrigin = targetUrlObject.origin;
        let targetHostname = targetUrlObject.hostname + ':' + targetUrlObject.port;

        const { handledRequestCount } = await requestQueue.getInfo();
        log.debug(`This handles ${request.url} with id ${request.id} on ${targetOrigin}`);
        // log.debug(`queue has done ${handledRequestCount} webpages. This handles ${targetOrigin}`);

        let hasForm = false;
        if ($('form').length !== 0) {
            hasForm = true;
        }

        let formTagNum = $('form').length;

        let inputTagNum = $('input').length;

        let inputTagTextBoxNum = 0;
        let namesOfTextboxType = ['text', 'url', 'tel', 'search', 'password', 'email'];
        namesOfTextboxType.forEach(name => {
            inputTagTextBoxNum += $(`input[type='${name}']`).length
        });

        // for input tags without any type attribute, it is a type='text' by default
        inputTagTextBoxNum += (inputTagNum - $("input[type]").length);

        let inputTagMaxLengthNum = $("input[maxlength]").length;
        let inputTagMinLengthNum = $("input[minlength]").length;
        let inputTagPatternNum = $("input[pattern]").length;

        let inputTagHiddenNum = $("input[type='hidden']").length;

        let textareaTagNum = $('textarea').length;

        let selectTagNum = $('select').length;

        let jsFileUrls = [];
        if ($("script[src$='.js']").length !== 0) {
            jsFileUrls = $("script[src$='.js']")
                .map((i, el) => $(el).attr('src'))
                .get();
        }

        let js_from_html = '';
        if (($("script").length !== 0) && hasForm) {
            $("script").map((i, el) => {
                js_from_html += $(el).html();
            });
        }
        // for script in soup.find_all('script'):
        // js_from_html += script.string

        const dataset = await Apify.openDataset(targetHostname);
        await dataset.pushData({
            url: `${request.url}`,
            domainURL: targetOrigin,
            jsFileUrls,
            jsFileNum: jsFileUrls.length,
            hasForm,
            formTagNum,
            inputTagNum,
            textareaTagNum,
            selectTagNum,
            inputTagTextBoxNum,
            inputTagHiddenNum,
            inputTagMaxLengthNum,
            inputTagMinLengthNum,
            inputTagPatternNum,
        });

        // only store <script> tag if the content is not empty on a web page
        // if (js_from_html !== '') {
        //     let htmlJson = { file: `./source_file/${targetHostname}/html/${htmlNumObj[targetHostname]}.js`, language: "javascript" };
        //     fs.writeFileSync(`./source_file/${targetHostname}/html/${htmlNumObj[targetHostname]}.js`, js_from_html);
        //     fs.writeFileSync(`./source_file/${targetHostname}/html/${htmlNumObj[targetHostname]}.json`, JSON.stringify(htmlJson));

        //     let infoJson = { url: `${request.url}` };
        //     fs.writeFileSync(`./source_file/${targetHostname}/html/${htmlNumObj[targetHostname]}_info.json`, JSON.stringify(infoJson));
        //     htmlNumObj[targetHostname]++;
        // }

        const links = $('a[href]')
            .map((i, el) => $(el).attr('href'))
            .get();

        const absoluteUrls = links.map(link => new URL(link, targetOrigin));

        const sameDomainLinks = absoluteUrls.filter(url => url.href.startsWith(targetOrigin));

        log.debug(`about to enqueue ${sameDomainLinks.length} links on ${targetOrigin}`);

        // todo: two problems with this approach:
        // 1. MAX_CRAWL_PER_WEBSITE links are added to the queue, but some of them might fail, so fewer than MAX_CRAWL_PER_WEBSITE webpages are actually downloaded and parsed
        for (const url of sameDomainLinks) {
            if (maxCrawlPerWebsiteObj[targetHostname] >= MAX_CRAWL_PER_WEBSITE) {
                log.debug(`${targetHostname} has been added ${maxCrawlPerWebsiteObj[targetHostname]} times to the queue. Stop adding more`);
                log.debug('handlePageFunction ends');
                websiteWithUncrawledPagesObj[targetHostname] = 1;
                return;
            }
            log.debug(`- ${maxCrawlPerWebsiteObj[targetHostname]} enqueue ${url.href}`);
            let { wasAlreadyPresent, wasAlreadyHandled } = await requestQueue.addRequest({ url: url.href });

            // log.debug(`- Is ${url.href} already present? ${wasAlreadyPresent}\n
            //             Already handled? ${wasAlreadyHandled}`);
            // This if statement fixes the following problem
            // 2. Among those MAX_CRAWL_PER_WEBSITE links, duplicate links might exist. So the actual links going to be crawled will likely be < MAX_CRAWL_PER_WEBSITE
            if (!wasAlreadyPresent && !wasAlreadyHandled) {
                log.debug(`- ${url.href} is new`);
                maxCrawlPerWebsiteObj[targetHostname]++;
            } else {
                log.debug(`- ${url.href} already present or handled`);
            }
        }
        log.debug('handlePageFunction ends');
    };

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        requestList,
        handlePageFunction,
        postResponseFunction: ({ request, response }) => {
            let targetUrlObject = new URL(request.url);
            let targetOrigin = targetUrlObject.origin;
            let targetHostname = targetUrlObject.hostname + ':' + targetUrlObject.port;

            postRequestTimeObj[targetHostname].push((Date.now() - START_TIME) / 1000);
        },

        prepareRequestFunction: async ({ request }) => {
            console.log(`prepare request function for ${request.url} starts at ${Date.now() - START_TIME} ms`);

            let targetUrlObject = new URL(request.url);
            let targetOrigin = targetUrlObject.origin;
            let targetHostname = targetUrlObject.hostname + ':' + targetUrlObject.port;

            // todo: 1. this still does not prevent several requests being sent at the same time when concurrency level > 1

            // acquire lock
            if (lockObj[targetHostname] === 1) {
                log.debug(`${request.url} takes the lock at ${Date.now() - START_TIME} ms`);
                lockObj[targetHostname] = 0;
            } else {
                while (lockObj[targetHostname] === 0) {
                    await Apify.utils.sleep(1000);
                }
                log.debug(`${request.url} takes the lock at ${Date.now() - START_TIME} ms`);
                lockObj[targetHostname] = 0;
            }

            let interval = Date.now() - lastTimeCrawledObj[targetHostname];
            if (interval < INTERVAL_BTW_VISIT_SAME_DOMAIN) {
                log.debug(`${request.url} on ${targetOrigin} will sleep ${INTERVAL_BTW_VISIT_SAME_DOMAIN - interval} ms`);
                await Apify.utils.sleep(INTERVAL_BTW_VISIT_SAME_DOMAIN - interval);
            }
            lastTimeCrawledObj[targetHostname] = Date.now();

            // release lock
            lockObj[targetHostname] = 1;

            log.debug(`${request.url} returns the lock at ${Date.now() - START_TIME} ms`);

            console.log(`prepare request function for ${request.url} for the host ${targetHostname} finishes at ${Date.now() - START_TIME} ms`);
            preRequestTimeObj[targetHostname].push((Date.now() - START_TIME) / 1000);
        }
    });

    await crawler.run();

};

let main = async () => {
    await crawl();
    log.info(`*****crawling finishes at ${(Date.now() - START_TIME) / 1000} sec*****`); // when the crawling ended
    // log.info('prepareRequestFunction time: ');
    // log.info('postRequestFunction time: ');
    // fs.mkdirSync('./log/1/time_measurement');
    fs.writeFileSync('./log/1/preRequestTimeObj.json', JSON.stringify(preRequestTimeObj));
    fs.writeFileSync('./log/1/postRequestTimeObj.json', JSON.stringify(postRequestTimeObj));
    fs.writeFileSync('./log/1/maxCrawlPerWebsiteObj.json', JSON.stringify(maxCrawlPerWebsiteObj));
    fs.writeFileSync('./log/1/websiteWithUncrawledPagesObj.json', JSON.stringify(websiteWithUncrawledPagesObj));

};

main();
log.info(`*****crawling starts at ${(Date.now() - START_TIME) / 1000} sec*****`); // when the crawling started
