import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { stripPII } from './pii-stripper';
import { franc } from 'franc-cjs';

const hinglishStopWords = new Set([
    'hai', 'ki', 'kya', 'tha', 'mera', 'mujhe', 'karo', 'mat', 'abhi', 'bhi', 
    'aur', 'ye', 'wo', 'ka', 'ke', 'ko', 'se', 'mai', 'main', 'tu', 'tum', 
    'aap', 'hum', 'ho', 'nahin', 'nahi', 'karna', 'kar', 'raha', 'rahi', 'wale',
    'hain', 'hota', 'hoti', 'hote', 'kuch', 'bahut', 'sirf', 'kaise', 'kab'
]);

function isHinglish(text: string): boolean {
    const words = text.toLowerCase().split(/\W+/);
    let count = 0;
    for (const word of words) {
        if (hinglishStopWords.has(word)) {
            count++;
        }
    }
    // If we find 2 or more Hinglish stop words in a short text, it's likely Hinglish
    return count >= 2;
}

export interface RawReview {
    rating: number;
    title: string;
    text: string;
    date: Date;
    platform?: string;
    sentiment?: string;
}

export function loadAndFilterReviews(filePath: string, weeksToLookBack = 12): RawReview[] {
    const ext = path.extname(filePath).toLowerCase();
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    let records: any[] = [];

    if (ext === '.csv') {
        records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });
    } else if (ext === '.json') {
        records = JSON.parse(fileContent);
        // Handle common JSON export structures where reviews might be nested
        if (!Array.isArray(records)) {
            records = (records as any).reviews || (records as any).data || [records];
        }
    } else {
        throw new Error(`Unsupported file extension: ${ext}. Please provide a .csv or .json file.`);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (weeksToLookBack * 7));

    const reviews: RawReview[] = [];

    for (const record of records) {
        // Handle varying key names from different store exports
        const dateStr = record['Date'] || record['date'] || record['createdAt'];
        const ratingStr = record['Rating'] || record['rating'] || record['Star Rating'] || record['score'];
        const title = record['Review Title'] || record['title'] || record['Title'] || '';
        const text = record['Review Text'] || record['text'] || record['Review'] || record['content'] || '';

        if (!dateStr || !ratingStr) continue;

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) continue; // Skip invalid dates

        if (date >= cutoffDate) {
            const combinedText = `${title} ${text}`;
            
            // Filter 1: Less than 8 words
            const wordCount = combinedText.trim().split(/\s+/).filter(w => w.length > 0).length;
            if (wordCount < 8) continue;

            // Filter 2: Contains emoji
            const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
            if (emojiRegex.test(combinedText)) continue;

            // Filter 3 & 4: Hindi language and Hinglish
            const detectedLang = franc(combinedText);
            if (detectedLang === 'hin' || isHinglish(combinedText)) continue;

            let rating = typeof ratingStr === 'number' ? ratingStr : parseInt(ratingStr, 10);
            
            // Detect platform from filename
            let platform = 'unknown';
            const lowerPath = filePath.toLowerCase();
            if (lowerPath.includes('app_store') || lowerPath.includes('appstore')) {
                platform = 'ios';
            } else if (lowerPath.includes('play_store') || lowerPath.includes('playstore') || lowerPath.includes('google_play')) {
                platform = 'android';
            }

            // Determine sentiment based on rating
            let sentiment = 'neutral';
            if (rating >= 4) {
                sentiment = 'positive';
            } else if (rating <= 2) {
                sentiment = 'negative';
            }

            reviews.push({
                rating: rating,
                title: stripPII(title),
                text: stripPII(text),
                date,
                platform,
                sentiment
            });
        }
    }

    return reviews;
}
