import { LLMReportOutput } from '../llm/llm-processor';

export interface FormattedOutputs {
    markdownReport: string;
    htmlEmailBody: string;
}

export function formatReport(data: LLMReportOutput, docUrl?: string): FormattedOutputs {
    const today = new Date().toISOString().split('T')[0];

    // Markdown Report (scannable, under 250 words)
    let markdownReport = `# Weekly App Review Pulse (${today})\n\n`;
    
    if (data.summary_report) {
        markdownReport += `## Executive Summary\n${data.summary_report.trim()}\n\n`;
    }

    markdownReport += `## Top Themes\n`;
    const rawThemes = data.top_themes && data.top_themes.length > 0 ? data.top_themes : data.themes;
    const themesToDisplay = rawThemes.map(t => t.replace(/^(review\s*\d*:?\s*|\d+[\.\)]\s*)/i, '').trim());
    themesToDisplay.forEach((theme, idx) => {
        markdownReport += `${idx + 1}. **${theme}**\n`;
    });
    markdownReport += `\n`;

    markdownReport += `## Verbatim User Quotes\n`;
    data.quotes.forEach(quote => {
        markdownReport += `> "${quote}"\n\n`;
    });

    markdownReport += `## Action Ideas\n`;
    data.action_ideas.forEach(action => {
        markdownReport += `- [ ] ${action}\n`;
    });

    // HTML Email Body
    let htmlEmailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5; color: #333;">
  <h2 style="color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 6px;">📱 Weekly App Review Pulse (${today})</h2>
`;

    if (data.summary_report) {
        htmlEmailBody += `
  <div style="background-color: #f8f9fa; padding: 12px 16px; border-left: 4px solid #1a73e8; margin-bottom: 16px;">
    <h3 style="margin-top: 0; color: #202124;">Executive Summary</h3>
    <p style="margin-bottom: 0;">${data.summary_report.trim().replace(/\n/g, '<br>')}</p>
  </div>`;
    }

    htmlEmailBody += `
  <h3 style="color: #202124;">Top Themes</h3>
  <ul>
    ${themesToDisplay.map(t => `<li style="margin-bottom: 4px;"><strong>${t}</strong></li>`).join('')}
  </ul>

  <h3 style="color: #202124;">Verbatim User Quotes</h3>
  <div style="background: #f1f3f4; padding: 10px 14px; border-radius: 6px;">
    ${data.quotes.map(q => `<p style="margin: 6px 0; font-style: italic; color: #4a4a4a;">"${q}"</p>`).join('')}
  </div>

  <h3 style="color: #202124;">Actionable Next Steps</h3>
  <ul>
    ${data.action_ideas.map(a => `<li style="margin-bottom: 4px;">${a}</li>`).join('')}
  </ul>
`;

    if (docUrl) {
        htmlEmailBody += `
  <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p>📄 <strong>Full Document:</strong> <a href="${docUrl}" target="_blank" style="color: #1a73e8;">View Google Doc</a></p>
`;
    }

    htmlEmailBody += `</div>`;

    return {
        markdownReport: markdownReport.trim(),
        htmlEmailBody: htmlEmailBody.trim()
    };
}
