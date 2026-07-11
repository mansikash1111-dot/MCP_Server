export function stripPII(text: string): string {
    if (!text) return text;
    
    // Basic email replacement
    let stripped = text.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL REMOVED]');
    
    // Basic phone number replacement (simple format)
    stripped = stripped.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE REMOVED]');
    
    // Device ID (simple hex/uuid approximation)
    stripped = stripped.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[DEVICE ID REMOVED]');
    
    return stripped;
}
