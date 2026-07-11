import { loadAndFilterReviews } from './ingestion/file-reader';
import * as path from 'path';

const appStoreFile = path.resolve(__dirname, '../data/exports/app_store_reviews.csv');
const playStoreFile = path.resolve(__dirname, '../data/exports/play_store_reviews.csv');

console.log('--- Processing App Store Reviews ---');
const appStoreReviews = loadAndFilterReviews(appStoreFile, 12);
console.log(`Remaining App Store Reviews: ${appStoreReviews.length}`);
console.log(JSON.stringify(appStoreReviews.slice(0, 2), null, 2));

import * as fs from 'fs';

console.log('\n--- Processing Play Store Reviews ---');
const playStoreReviews = loadAndFilterReviews(playStoreFile, 12);
console.log(`Remaining Play Store Reviews: ${playStoreReviews.length}`);
console.log(JSON.stringify(playStoreReviews.slice(0, 2), null, 2));

const allReviews = [...appStoreReviews, ...playStoreReviews];
const outputDir = path.resolve(__dirname, '../output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
const outputPath = path.join(outputDir, 'normalized_reviews.json');
fs.writeFileSync(outputPath, JSON.stringify(allReviews, null, 2), 'utf-8');
console.log(`\nWrote ${allReviews.length} normalized reviews to output/normalized_reviews.json`);
