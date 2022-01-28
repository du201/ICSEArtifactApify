# Things to do before run "Apify run -p"
1. the ./source_file/ directory is used to store all of the downloaded html & js files. Please run preCrawlCleanSourceFile.js to clean the directory. (the ICSE version does not use these files, so this step can be ignored)
2. Check the meta data values in main.js (including rate limiting, start website and end website to crawl, and how many webpages to crawl for each website)
