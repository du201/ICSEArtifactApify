const fs = require('fs');

let ROOT_DIRECTORY = './apify_storage/datasets/';

let outputObj = {};

fs.readdirSync(`${ROOT_DIRECTORY}`).forEach(domain => {
    fs.readdirSync(`${ROOT_DIRECTORY}${domain}/`).forEach(webpageFile => {
        let webpageObj = JSON.parse(fs.readFileSync(`${ROOT_DIRECTORY}${domain}/${webpageFile}`));
        if (webpageObj.hasForm) {
            if (webpageObj.domainURL in outputObj) {
                outputObj[webpageObj.domainURL].push(webpageObj.url);
            } else {
                outputObj[webpageObj.domainURL] = [webpageObj.url];
            }
        }
    });

});

let webpageObj = outputObj;

console.log(`${Object.keys(webpageObj).length} domains have forms`)

let numPages = 0;
let listOfPages = [];
for (let domain of Object.keys(webpageObj)) {
    numPages += webpageObj[domain].length;
    listOfPages = listOfPages.concat(Array.from(new Set(webpageObj[domain])));
}

console.log(`${numPages} pages have forms`)
fs.writeFileSync('OpenWPMListInput.json', JSON.stringify(listOfPages));



