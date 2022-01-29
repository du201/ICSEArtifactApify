const csv = require('csv-parser');
const fs = require('fs');

urls = [];

fs.createReadStream('top-1m.csv')
    .pipe(csv({ headers: ['ranking', 'url'] }))
    .on('data', (row) => {
        let domain = row.url;
        row.url = "http://" + row.url;
        urls.push({ url: row.url, domain });
    })
    .on('end', () => {
        let urlsJSON = JSON.stringify(urls);
        console.log(urls.length);
        fs.writeFile('./apify_storage/key_value_stores/default/INPUT.json', urlsJSON, err => {
            if (err) {
                console.log('Error writing file', err)
            } else {
                console.log('Successfully wrote file')
            }
        })
    });

