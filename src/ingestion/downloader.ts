import * as fs from 'fs';
import * as path from 'path';
import gplay from 'google-play-scraper';
// @ts-ignore
import appStore from 'app-store-scraper';
import * as dotenv from 'dotenv';

dotenv.config();

const WEEKS_TO_LOOK_BACK = parseInt(process.env.DOWNLOAD_WEEKS || '12', 10);
const MAX_REVIEWS_TO_FETCH = 500; // Limit for play store scraper

const playStoreId = process.env.PLAY_STORE_PACKAGE || process.env.PLAY_STORE_APP_ID || 'com.whatsapp';
const appStoreId = process.env.APP_STORE_ID || process.env.APP_STORE_APP_ID || 'net.whatsapp.WhatsApp'; 
const appStoreCountry = process.env.APP_STORE_COUNTRY || 'us';

const exportsDir = process.env.EXPORTS_DIR
    ? path.resolve(process.env.EXPORTS_DIR)
    : path.join(__dirname, '..', '..', 'data', 'exports');

function escapeCsv(str: string): string {
    if (!str) return '""';
    // Replace quotes with double quotes for CSV escaping
    const escaped = str.replace(/"/g, '""');
    // Wrap in quotes to safely handle commas and newlines
    return `"${escaped}"`;
}

function writeCsv(filePath: string, reviews: any[]) {
    if (reviews.length === 0) {
        console.log(`No reviews to write for ${filePath}`);
        return;
    }
    const headers = ['Date', 'Rating', 'Review Title', 'Review Text'];
    const lines = [headers.join(',')];
    
    for (const r of reviews) {
        lines.push([
            escapeCsv(r.date.toISOString()),
            r.rating,
            escapeCsv(r.title),
            escapeCsv(r.text)
        ].join(','));
    }
    
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`Wrote ${reviews.length} reviews to ${filePath}`);
}

async function downloadPlayStoreReviews() {
    console.log(`Fetching Google Play reviews for ${playStoreId}...`);
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (WEEKS_TO_LOOK_BACK * 7));
        
        let allReviews: any[] = [];
        let nextToken: string | null = null;
        let pageCount = 0;
        const maxPages = 15; // Safe page fetching limit to prevent rate limits

        do {
            console.log(`Fetching page ${pageCount + 1} of Google Play reviews...`);
            const options: any = {
                appId: playStoreId,
                // @ts-ignore
                sort: gplay.sort.NEWEST,
                paginate: true
            };
            if (nextToken) {
                options.nextPaginationToken = nextToken;
            }

            const response = await gplay.reviews(options);
            const pageReviews = response.data || [];
            
            if (pageReviews.length === 0) {
                break;
            }

            const mapped = pageReviews.map((r: any) => ({
                date: new Date(r.date),
                rating: r.score,
                title: r.title || 'Play Store Review',
                text: r.text
            }));

            allReviews = allReviews.concat(mapped);
            nextToken = response.nextPaginationToken || null;
            pageCount++;

            // Stop early if the oldest review in this page is older than the cutoff date
            const oldestInPage = mapped[mapped.length - 1];
            if (oldestInPage && oldestInPage.date < cutoff) {
                console.log(`Reached reviews older than ${WEEKS_TO_LOOK_BACK} weeks. Stopping pagination.`);
                break;
            }

        } while (nextToken && pageCount < maxPages);

        // Filter all accumulated reviews by cutoff date
        const filtered = allReviews.filter(r => r.date >= cutoff);
        
        const filePath = path.join(exportsDir, 'play_store_reviews.csv');
        writeCsv(filePath, filtered);
    } catch (e: any) {
        console.error('Error fetching Play Store reviews:', e.message);
    }
}

async function downloadAppStoreReviews() {
    console.log(`Fetching App Store reviews for ${appStoreId}...`);
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (WEEKS_TO_LOOK_BACK * 7));

        let allReviews: any[] = [];
        const isNumeric = /^\d+$/.test(appStoreId);
        
        // App Store feed supports up to 10 pages maximum
        for (let page = 1; page <= 10; page++) {
            console.log(`Fetching page ${page} of App Store reviews...`);
            const options: any = {
                country: appStoreCountry,
                sort: appStore.sort.RECENT,
                page: page
            };
            if (isNumeric) {
                options.id = appStoreId;
            } else {
                options.appId = appStoreId;
            }
            
            const response = await appStore.reviews(options);
            if (!response || response.length === 0) {
                break;
            }

            const mapped = response.map((r: any) => ({
                date: new Date(r.updated || r.date || Date.now()), 
                rating: r.score,
                title: r.title,
                text: r.text
            }));

            allReviews = allReviews.concat(mapped);

            // Stop early if the oldest review in this page is older than the cutoff
            const oldestInPage = mapped[mapped.length - 1];
            if (oldestInPage && oldestInPage.date < cutoff) {
                console.log(`Reached App Store reviews older than ${WEEKS_TO_LOOK_BACK} weeks. Stopping page fetching.`);
                break;
            }
        }

        const filtered = allReviews.filter(r => r.date >= cutoff);
        
        const filePath = path.join(exportsDir, 'app_store_reviews.csv');
        writeCsv(filePath, filtered);
    } catch (e: any) {
        console.error('Error fetching App Store reviews:', e.message);
    }
}

async function main() {
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    await downloadPlayStoreReviews();
    await downloadAppStoreReviews();
    console.log('Download phase complete.');
}

if (require.main === module) {
    main().catch(console.error);
}
