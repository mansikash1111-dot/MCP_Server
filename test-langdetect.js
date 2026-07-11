const LanguageDetect = require('languagedetect');
const lngDetector = new LanguageDetect();

const text = "Hello friends koi bhi Groww aap use mat karo such mai abhi fraud kar raha hai mai khud itne saal se investment kar rahi hun but abhi mujhe dar lag raha hai because mai options trading kar rahi thi total balance mera 28 k tha aur loss kuch 3800 ke aas pass huwa hai but aap ne mujhe 4000 - karne ke baad 21 k dikha raha hai 28k chalo 4500 rs bhi agar lete hai to bhi mera jo amount hai 23500 hona chahiye jo ki nahi hai ye aap chor hai pls ye sab fraud se aap bhi bachho aur download mat kro gatiya a";
const englishText = "make delivery trade zero fee";
const hindiText = "नमस्ते, यह एक बहुत अच्छा ऐप है।";

console.log('LanguageDetect Hinglish:', lngDetector.detect(text, 5));
console.log('LanguageDetect English:', lngDetector.detect(englishText, 5));
console.log('LanguageDetect Hindi:', lngDetector.detect(hindiText, 5));
