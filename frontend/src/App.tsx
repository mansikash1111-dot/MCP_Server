import { useState, useEffect, useMemo } from 'react';

// Interfaces matching backend models
interface Review {
  rating: number;
  title: string;
  text: string;
  date: string;
  platform?: string;
  sentiment?: string;
}

interface LLMReport {
  themes: string[];
  top_themes: string[];
  quotes: string[];
  action_ideas: string[];
  summary_report: string;
}

interface BugReport {
  title: string;
  severity: string;
  platform: string;
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  userQuotes: string[];
}

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  
  // Data state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [llmReport, setLlmReport] = useState<LLMReport | null>(null);
  const [weeklyPulse, setWeeklyPulse] = useState<string>('');
  
  // Loading & UI state
  const [activeTab, setActiveTab] = useState<'reviews' | 'analytics' | 'categories' | 'word-cloud' | 'ideation' | 'reporting'>('reviews');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'ios' | 'android'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'yesterday' | '7d' | '15d' | '30d'>('all');
  const [ratingFilter, setRatingFilter] = useState<number[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // Bug reporter state
  const [selectedReviewIds, setSelectedReviewIds] = useState<number[]>([]);
  const [generatedBug, setGeneratedBug] = useState<BugReport | null>(null);
  const [isGeneratingBug, setIsGeneratingBug] = useState<boolean>(false);

  // MCP actions loading states
  const [isPublishingDoc, setIsPublishingDoc] = useState<boolean>(false);
  const [isPublishingEmail, setIsPublishingEmail] = useState<boolean>(false);
  const [publishedDocUrl, setPublishedDocUrl] = useState<string>('');

  const API_URL = import.meta.env.VITE_API_URL || (
    typeof window !== 'undefined' && window.location.port === '5173'
      ? 'http://localhost:3001'
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3001'
  );

  // Toggle Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Data on mount
  const fetchData = async (showNotification = false) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/data`);
      if (!res.ok) throw new Error('Failed to load data');
      const json = await res.json();
      setReviews(json.reviews || []);
      setLlmReport(json.llmReport || null);
      setWeeklyPulse(json.weeklyPulse || '');
      if (showNotification) {
        showToast('Dashboard data loaded successfully!', 'success');
      }
    } catch (e: any) {
      console.error(e);
      showToast('Error connecting to backend API server.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  // Sync Pipeline Handler
  const handleSync = async () => {
    setIsLoading(true);
    setSyncStatus('Scraping app reviews & running AI analysis. This takes ~15-20s...');
    try {
      const res = await fetch(`${API_URL}/api/sync`, { method: 'POST' });
      if (!res.ok) throw new Error('Sync pipeline failed');
      const json = await res.json();
      if (json.success) {
        setReviews(json.data.reviews || []);
        setLlmReport(json.data.llmReport || null);
        setWeeklyPulse(json.data.weeklyPulse || '');
        showToast('Pipeline sync complete! Fresh insights updated.', 'success');
      } else {
        throw new Error(json.error || 'Pipeline sync failed.');
      }
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Sync failed. Check terminal credentials.', 'error');
    } finally {
      setIsLoading(false);
      setSyncStatus('');
    }
  };

  // Publish to Google Doc
  const handlePublishDoc = async () => {
    if (!weeklyPulse) {
      showToast('No Weekly Pulse markdown found to publish.', 'error');
      return;
    }
    setIsPublishingDoc(true);
    try {
      const res = await fetch(`${API_URL}/api/publish/doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: weeklyPulse })
      });
      const data = await res.json();
      if (data.success && data.docUrl) {
        setPublishedDocUrl(data.docUrl);
        showToast('Published to Google Docs successfully!', 'success');
      } else {
        throw new Error(data.error || 'Failed to publish Google Doc.');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to create Google Doc. Is MCP server authenticated?', 'error');
    } finally {
      setIsPublishingDoc(false);
    }
  };

  // Publish Gmail Draft
  const handlePublishEmail = async () => {
    setIsPublishingEmail(true);
    try {
      const res = await fetch(`${API_URL}/api/publish/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docUrl: publishedDocUrl })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Gmail draft email created successfully!', 'success');
      } else {
        throw new Error(data.error || 'Failed to publish Gmail draft.');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to create Gmail Draft. Check Google credentials.', 'error');
    } finally {
      setIsPublishingEmail(false);
    }
  };

  // Generate Bug Report
  const handleGenerateBugReport = async () => {
    if (selectedReviewIds.length === 0) {
      showToast('Select at least one review to compile.', 'error');
      return;
    }
    setIsGeneratingBug(true);
    const selectedReviews = selectedReviewIds.map(idx => filteredReviews[idx]);
    try {
      const res = await fetch(`${API_URL}/api/bug-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews: selectedReviews })
      });
      const data = await res.json();
      if (data.success && data.bugReport) {
        setGeneratedBug(data.bugReport);
        showToast('AI Bug Report compiled successfully!', 'success');
      } else {
        throw new Error(data.error || 'Failed to generate bug report.');
      }
    } catch (e: any) {
      showToast(e.message || 'Error generating bug report.', 'error');
    } finally {
      setIsGeneratingBug(false);
    }
  };

  const handleRatingToggle = (rating: number) => {
    if (ratingFilter.includes(rating)) {
      setRatingFilter(ratingFilter.filter(r => r !== rating));
    } else {
      setRatingFilter([...ratingFilter, rating]);
    }
  };

  // Filter Reviews Logic
  const filteredReviews = useMemo(() => {
    return reviews.filter(review => {
      // 1. Platform Filter
      if (platformFilter !== 'all' && review.platform !== platformFilter) return false;

      // 2. Sentiment Filter
      if (sentimentFilter !== 'all' && review.sentiment !== sentimentFilter) return false;

      // 3. Rating Filter
      if (ratingFilter.length > 0 && !ratingFilter.includes(review.rating)) return false;

      // 4. Search Query
      if (searchQuery) {
        const textToSearch = `${review.title} ${review.text}`.toLowerCase();
        if (!textToSearch.includes(searchQuery.toLowerCase())) return false;
      }

      // 5. Date Period Filter
      if (periodFilter !== 'all') {
        const reviewDate = new Date(review.date);
        if (isNaN(reviewDate.getTime())) return false;
        
        const now = new Date();
        
        // Reset times to midnight to calculate pure day differences
        const reviewMidnight = new Date(reviewDate.getFullYear(), reviewDate.getMonth(), reviewDate.getDate()).getTime();
        const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        
        const diffDays = Math.floor((nowMidnight - reviewMidnight) / (1000 * 60 * 60 * 24));
        
        if (periodFilter === 'today' && diffDays !== 0) return false;
        if (periodFilter === 'yesterday' && diffDays !== 1) return false;
        if (periodFilter === '7d' && (diffDays < 0 || diffDays >= 7)) return false;
        if (periodFilter === '15d' && (diffDays < 0 || diffDays >= 15)) return false;
        if (periodFilter === '30d' && (diffDays < 0 || diffDays >= 30)) return false;
      }

      return true;
    });
  }, [reviews, platformFilter, sentimentFilter, ratingFilter, searchQuery, periodFilter]);

  // Aggregate Metrics based on filtered data
  const metrics = useMemo(() => {
    const total = filteredReviews.length;
    if (total === 0) return { total: 0, avgRating: 0, positivePercent: 0, positiveCount: 0, neutralCount: 0, negativeCount: 0 };
    
    let sumRating = 0;
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    filteredReviews.forEach(r => {
      sumRating += r.rating;
      if (r.sentiment === 'positive') positive++;
      else if (r.sentiment === 'neutral') neutral++;
      else if (r.sentiment === 'negative') negative++;
    });

    return {
      total,
      avgRating: Number((sumRating / total).toFixed(1)),
      positivePercent: Math.round((positive / total) * 100),
      positiveCount: positive,
      neutralCount: neutral,
      negativeCount: negative
    };
  }, [filteredReviews]);

  // Timeline Graph Computation (Group reviews count by Date)
  const timelineData = useMemo(() => {
    const dailyCounts: Record<string, number> = {};
    
    // Sort reviews by date ascending
    const sorted = [...filteredReviews].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sorted.forEach(r => {
      const dateStr = new Date(r.date).toISOString().split('T')[0];
      if (dateStr) {
        dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;
      }
    });

    return Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));
  }, [filteredReviews]);

  // Word Cloud Data Logic (Count most frequent words)
  const wordCloudWords = useMemo(() => {
    const wordsMap: Record<string, number> = {};
    const commonStopwords = new Set([
      'the', 'is', 'and', 'to', 'a', 'in', 'it', 'for', 'of', 'this', 'on', 'my', 'app', 'with', 
      'i', 'have', 'are', 'that', 'but', 'not', 'be', 'as', 'at', 'very', 'good', 'groww', 'best'
    ]);
    
    filteredReviews.forEach(r => {
      const words = `${r.title} ${r.text}`.toLowerCase().replace(/[^a-zA-Z\s]/g, '').split(/\s+/);
      words.forEach(word => {
        if (word.length > 2 && !commonStopwords.has(word)) {
          wordsMap[word] = (wordsMap[word] || 0) + 1;
        }
      });
    });

    return Object.entries(wordsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30) // Top 30 words
      .map(([text, value]) => ({ text, value }));
  }, [filteredReviews]);

  // Rating Distribution Counts
  const ratingDistribution = useMemo(() => {
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    filteredReviews.forEach(r => {
      const rating = r.rating as 1 | 2 | 3 | 4 | 5;
      if (dist[rating] !== undefined) {
        dist[rating]++;
      }
    });
    return dist;
  }, [filteredReviews]);

  const handleWordClick = (word: string) => {
    setSearchQuery(word);
    setActiveTab('reviews');
    showToast(`Filtering reviews by keyword: "${word}"`);
  };

  // Convert markdown-like text to simple HTML elements
  const renderMarkdown = (md: string) => {
    if (!md) return <p className="markdown-body">No report compiled yet. Click Sync Data to fetch reviews and compile insights.</p>;
    
    const lines = md.split('\n');
    return (
      <div className="markdown-body">
        {lines.map((line, idx) => {
          if (line.startsWith('# ')) {
            return <h1 key={idx}>{line.substring(2)}</h1>;
          } else if (line.startsWith('## ')) {
            return <h2 key={idx}>{line.substring(3)}</h2>;
          } else if (line.startsWith('### ')) {
            return <h3 key={idx}>{line.substring(4)}</h3>;
          } else if (line.startsWith('* ') || line.startsWith('- ')) {
            return <li key={idx}>{line.substring(2)}</li>;
          } else if (line.startsWith('> ')) {
            return <blockquote key={idx}>{line.substring(2)}</blockquote>;
          } else if (line.trim() === '') {
            return <div key={idx} style={{ height: '8px' }}></div>;
          } else {
            return <p key={idx}>{line}</p>;
          }
        })}
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="logo-icon">G</div>
          <div>
            <h1 className="brand-name">Weekly Review Pulse</h1>
            <div className="brand-tagline">Support PM Intelligence</div>
          </div>
        </div>

        <div className="header-controls">
          {/* Platform Filters */}
          <div className="platform-selector">
            <button 
              className={`platform-btn ${platformFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPlatformFilter('all')}
            >
              All
            </button>
            <button 
              className={`platform-btn ${platformFilter === 'android' ? 'active' : ''}`}
              onClick={() => setPlatformFilter('android')}
            >
              🤖 Android
            </button>
            <button 
              className={`platform-btn ${platformFilter === 'ios' ? 'active' : ''}`}
              onClick={() => setPlatformFilter('ios')}
            >
              🍎 iOS
            </button>
          </div>

          <button 
            className="btn-primary" 
            onClick={handleSync}
            disabled={isLoading}
          >
            🔄 Sync Android
          </button>

          <button 
            className="theme-toggle"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs-navigation">
        <button className={`tab-link ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>💬 Reviews</button>
        <button className={`tab-link ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>📊 Analytics</button>
        <button className={`tab-link ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>📂 Categories</button>
        <button className={`tab-link ${activeTab === 'word-cloud' ? 'active' : ''}`} onClick={() => setActiveTab('word-cloud')}>☁️ Word Cloud</button>
        <button className={`tab-link ${activeTab === 'ideation' ? 'active' : ''}`} onClick={() => setActiveTab('ideation')}>💡 Ideation</button>
        <button className={`tab-link ${activeTab === 'reporting' ? 'active' : ''}`} onClick={() => setActiveTab('reporting')}>📝 Weekly Note</button>
      </nav>

      {/* Main Grid */}
      <div className="dashboard-layout">
        
        {/* Sidebar Filters */}
        <aside className="sidebar-filters">
          <div className="filter-group">
            <span className="filter-label">Timeline Range</span>
            <div className="period-list">
              <button className={`period-btn ${periodFilter === 'all' ? 'active' : ''}`} onClick={() => setPeriodFilter('all')}>All Historical</button>
              <button className={`period-btn ${periodFilter === 'today' ? 'active' : ''}`} onClick={() => setPeriodFilter('today')}>Today Only</button>
              <button className={`period-btn ${periodFilter === 'yesterday' ? 'active' : ''}`} onClick={() => setPeriodFilter('yesterday')}>Yesterday</button>
              <button className={`period-btn ${periodFilter === '7d' ? 'active' : ''}`} onClick={() => setPeriodFilter('7d')}>Last 7 Days</button>
              <button className={`period-btn ${periodFilter === '15d' ? 'active' : ''}`} onClick={() => setPeriodFilter('15d')}>Last 15 Days</button>
              <button className={`period-btn ${periodFilter === '30d' ? 'active' : ''}`} onClick={() => setPeriodFilter('30d')}>Last 30 Days</button>
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Rating Selectors</span>
            <div className="star-filters">
              {[5, 4, 3, 2, 1].map(stars => (
                <label key={stars} className="star-row">
                  <input 
                    type="checkbox" 
                    checked={ratingFilter.includes(stars)}
                    onChange={() => handleRatingToggle(stars)} 
                  />
                  <div className="stars-display">
                    {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
                  </div>
                  <span>({reviews.filter(r => r.rating === stars).length})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Quick Actions</span>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => {
              setSearchQuery('');
              setRatingFilter([]);
              setPlatformFilter('all');
              setSentimentFilter('all');
              setPeriodFilter('all');
              setSelectedReviewIds([]);
              setGeneratedBug(null);
            }}>
              🧹 Reset All Filters
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="main-content">
          
          {/* Mini Cards Grid */}
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Filtered Feed Reviews</span>
              <span className="metric-value">{metrics.total}</span>
              <span className="metric-sub">Total parsed database: {reviews.length}</span>
            </div>
            
            <div className="metric-card">
              <span className="metric-label">Average Customer Rating</span>
              <div className="flex-row-center">
                <span className="metric-value">{metrics.avgRating}</span>
                <span style={{ color: '#ffc700', fontSize: '18px' }}>★</span>
              </div>
              <span className="metric-sub">Across filtered subset</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Positive Sentiment Rate</span>
              <span className="metric-value">{metrics.positivePercent}%</span>
              <div className="rating-bar-bg" style={{ height: '6px', marginTop: '4px' }}>
                <div 
                  className="rating-bar-fill" 
                  style={{ width: `${metrics.positivePercent}%`, backgroundColor: 'var(--color-primary)' }}
                ></div>
              </div>
            </div>

            <div className="metric-card neutral">
              <span className="metric-label">Engagement Mix</span>
              <span className="metric-value">
                {metrics.positiveCount}P / {metrics.neutralCount}N / {metrics.negativeCount}D
              </span>
              <span className="metric-sub">Positives / Neutrals / Detractors</span>
            </div>
          </div>

          {/* Search Row */}
          {activeTab === 'reviews' && (
            <div className="search-filter-row">
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Search reviews by content keywords (e.g. support, app, kyc)..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select 
                className="filter-select" 
                value={sentimentFilter} 
                onChange={(e) => setSentimentFilter(e.target.value as any)}
              >
                <option value="all">All Sentiments</option>
                <option value="positive">🟢 Positive Sentiment</option>
                <option value="neutral">🟡 Neutral Sentiment</option>
                <option value="negative">🔴 Negative Sentiment</option>
              </select>
            </div>
          )}

          {/* Tab Views Render */}
          {activeTab === 'reviews' && (
            <div className="reviews-list">
              {filteredReviews.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                  <h3>No reviews match the selected filters.</h3>
                  <p>Try refining your search keyword or selecting a wider date range.</p>
                </div>
              ) : (
                filteredReviews.map((review, idx) => (
                  <div key={idx} className="review-card">
                    <div className="review-card-header">
                      <div className="reviewer-info">
                        <span className={`platform-badge ${review.platform}`}>
                          {review.platform === 'ios' ? '🍎' : '🤖'}
                        </span>
                        <div>
                          <div className="review-rating-stars" style={{ color: '#ffc700' }}>
                            {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                          </div>
                        </div>
                      </div>
                      <div className="review-card-meta">
                        <span className={`sentiment-badge ${review.sentiment}`}>
                          {review.sentiment}
                        </span>
                        <span>{new Date(review.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {review.title && <h4 className="review-title">{review.title}</h4>}
                    <p className="review-text">{review.text}</p>
                    
                    <div className="review-actions">
                      <button className="btn-secondary" onClick={() => {
                        showToast(`Reply template drafted for: "${review.title || 'Support'}"`);
                      }}>
                        ✍️ Draft Reply
                      </button>
                      <button 
                        className={`btn-secondary ${selectedReviewIds.includes(idx) ? 'active' : ''}`}
                        onClick={() => {
                          if (selectedReviewIds.includes(idx)) {
                            setSelectedReviewIds(selectedReviewIds.filter(id => id !== idx));
                          } else {
                            setSelectedReviewIds([...selectedReviewIds, idx]);
                            showToast('Added to Bug Report selection queue.');
                          }
                        }}
                      >
                        {selectedReviewIds.includes(idx) ? '☑️ Selected for Bug' : '➕ Add to Bug Report'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="analytics-grid">
              
              {/* Rating Distribution */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">Rating Distribution</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[5, 4, 3, 2, 1].map(stars => {
                    const count = ratingDistribution[stars as 1|2|3|4|5] || 0;
                    const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
                    return (
                      <div key={stars} className="rating-dist-row">
                        <span className="rating-label">{stars} Star</span>
                        <div className="rating-bar-bg">
                          <div className="rating-bar-fill" style={{ width: `${pct}%` }}></div>
                        </div>
                        <span className="rating-percent">{pct}%</span>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', width: '30px' }}>({count})</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sentiment doughnut split using inline custom SVG */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">Sentiment Breakdown Mix</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', height: '100%' }}>
                  <svg width="150" height="150" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--color-border)" strokeWidth="4"></circle>
                    {/* Positive arc */}
                    {metrics.total > 0 && (
                      <circle 
                        cx="21" cy="21" r="15.915" 
                        fill="transparent" 
                        stroke="var(--color-positive)" 
                        strokeWidth="4" 
                        strokeDasharray={`${(metrics.positiveCount / metrics.total) * 100} ${100 - (metrics.positiveCount / metrics.total) * 100}`}
                        strokeDashoffset="0"
                      ></circle>
                    )}
                    {/* Neutral arc */}
                    {metrics.total > 0 && (
                      <circle 
                        cx="21" cy="21" r="15.915" 
                        fill="transparent" 
                        stroke="var(--color-neutral)" 
                        strokeWidth="4" 
                        strokeDasharray={`${(metrics.neutralCount / metrics.total) * 100} ${100 - (metrics.neutralCount / metrics.total) * 100}`}
                        strokeDashoffset={`-${(metrics.positiveCount / metrics.total) * 100}`}
                      ></circle>
                    )}
                    {/* Negative arc */}
                    {metrics.total > 0 && (
                      <circle 
                        cx="21" cy="21" r="15.915" 
                        fill="transparent" 
                        stroke="var(--color-negative)" 
                        strokeWidth="4" 
                        strokeDasharray={`${(metrics.negativeCount / metrics.total) * 100} ${100 - (metrics.negativeCount / metrics.total) * 100}`}
                        strokeDashoffset={`-${((metrics.positiveCount + metrics.neutralCount) / metrics.total) * 100}`}
                      ></circle>
                    )}
                  </svg>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div className="flex-row-center">
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-positive)' }}></div>
                      <span>Positive: {metrics.positiveCount} ({metrics.positivePercent}%)</span>
                    </div>
                    <div className="flex-row-center">
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-neutral)' }}></div>
                      <span>Neutral: {metrics.neutralCount} ({metrics.total > 0 ? Math.round((metrics.neutralCount / metrics.total) * 100) : 0}%)</span>
                    </div>
                    <div className="flex-row-center">
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-negative)' }}></div>
                      <span>Negative: {metrics.negativeCount} ({metrics.total > 0 ? Math.round((metrics.negativeCount / metrics.total) * 100) : 0}%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline graph */}
              <div className="analytics-card" style={{ gridColumn: 'span 2' }}>
                <h3 className="analytics-card-title">Daily Review Ingestion Trends</h3>
                {timelineData.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '30px' }}>No timeline data available.</p>
                ) : (
                  <div>
                    {/* SVG timeline chart bar representation */}
                    <div style={{ display: 'flex', height: '180px', alignItems: 'flex-end', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
                      {timelineData.map((d, index) => {
                        const maxVal = Math.max(...timelineData.map(item => item.count), 1);
                        const pctHeight = (d.count / maxVal) * 100;
                        return (
                          <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{d.count}</span>
                            <div style={{ width: '100%', height: `${pctHeight * 1.3}px`, backgroundColor: 'var(--color-primary)', borderRadius: '3px 3px 0 0' }}></div>
                            <span style={{ fontSize: '9px', transform: 'rotate(-45deg)', marginTop: '12px', height: '24px', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
                              {d.date.substring(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="categories-list">
              {llmReport?.themes ? (
                llmReport.themes.map((themeName, index) => {
                  const firstWord = (themeName || '').toLowerCase().split(' ')[0] || '';
                  const matchingCount = firstWord 
                    ? reviews.filter(r => r.text.toLowerCase().includes(firstWord)).length
                    : 0;

                  return (
                    <div key={index} className="category-row">
                      <div className="category-header">
                        <div className="category-title-desc">
                          <span className="category-title">{themeName}</span>
                          <span className="category-desc">AI extracted issue cluster theme</span>
                        </div>
                        <div className="category-meta">
                          <span className="category-percent-badge">
                            {matchingCount} associated reviews
                          </span>
                        </div>
                      </div>
                      <div className="category-body">
                        <p style={{ fontSize: '13px', fontWeight: '600' }}>Sample user statements representing theme:</p>
                        {reviews
                          .filter(r => {
                            return firstWord ? r.text.toLowerCase().includes(firstWord) : false;
                          })
                          .slice(0, 2)
                          .map((r, rIdx) => (
                            <blockquote key={rIdx} style={{ fontSize: '12px', borderLeft: '3px solid var(--color-primary)', paddingLeft: '10px', color: 'var(--color-text-muted)' }}>
                              "{r.text}"
                            </blockquote>
                          ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                  <h3>No category themes processed.</h3>
                  <p>Please run the Sync pipeline first to fetch themes from Groq.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'word-cloud' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="word-cloud-container">
                {wordCloudWords.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No keywords extracted. Ingest reviews to see keywords.</p>
                ) : (
                  wordCloudWords.map((w, index) => {
                    const minVal = Math.min(...wordCloudWords.map(item => item.value));
                    const maxVal = Math.max(...wordCloudWords.map(item => item.value));
                    const fontSize = Math.max(12, Math.round(((w.value - minVal) / (maxVal - minVal || 1)) * 28) + 12);
                    const color = w.value > (maxVal / 2) ? 'var(--color-primary)' : 'var(--color-text-main)';
                    return (
                      <span 
                        key={index} 
                        className="cloud-word"
                        style={{ fontSize: `${fontSize}px`, color }}
                        onClick={() => handleWordClick(w.text)}
                      >
                        {w.text}
                      </span>
                    );
                  })
                )}
              </div>
              
              <div className="analytics-card">
                <h3 className="analytics-card-title">Top 5 Common Keyword Frequencies</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {wordCloudWords.slice(0, 5).map((w, index) => (
                    <div key={index} className="flex-between" style={{ fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ fontWeight: '600', color: 'var(--color-primary)' }}>{w.text}</span>
                      <span>{w.value} occurrences</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ideation' && (
            <div className="ideation-container">
              
              {/* Left Column: AI Recommendations */}
              <div className="ideation-left">
                <h3 className="analytics-card-title">AI Action Recommendations</h3>
                {llmReport?.action_ideas ? (
                  llmReport.action_ideas.map((idea, index) => (
                    <div key={index} className="idea-card">
                      <div className="idea-card-header">
                        <span className="idea-title">Action #{index + 1}</span>
                        <span className="idea-tag">Proposed Feature</span>
                      </div>
                      <p className="idea-description">{idea}</p>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--color-text-muted)' }}>No recommendations. Sync reviews to run AI ideation.</p>
                )}
              </div>

              {/* Right Column: Bug Reporter */}
              <div className="ideation-right">
                <div className="bug-reporter-card">
                  <h3 className="analytics-card-title">📋 Interactive JIRA Bug Reporter</h3>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '14px' }}>
                    Select negative reviews below and click 'Generate Bug Report' to compile a detailed tech report via Groq.
                  </p>

                  <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                    {reviews.filter(r => r.rating <= 3).map((r, index) => {
                      const absoluteIndex = reviews.indexOf(r);
                      return (
                        <label key={index} className="bug-review-item">
                          <input 
                            type="checkbox"
                            checked={selectedReviewIds.includes(absoluteIndex)}
                            onChange={() => {
                              if (selectedReviewIds.includes(absoluteIndex)) {
                                setSelectedReviewIds(selectedReviewIds.filter(id => id !== absoluteIndex));
                              } else {
                                setSelectedReviewIds([...selectedReviewIds, absoluteIndex]);
                              }
                            }}
                          />
                          <div className="bug-review-details">
                            <div className="stars-display" style={{ color: '#ffc700' }}>{'★'.repeat(r.rating)}</div>
                            <span style={{ fontWeight: '600' }}>{r.title || 'No Title'}</span>
                            <p className="bug-review-text">"{r.text.substring(0, 100)}..."</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <button 
                    className="btn-primary" 
                    style={{ width: '100%', marginTop: '16px', justifyContent: 'center' }}
                    onClick={handleGenerateBugReport}
                    disabled={isGeneratingBug || selectedReviewIds.length === 0}
                  >
                    {isGeneratingBug ? '⚡ Generating Bug Report...' : `⚡ Compile Bug Ticket (${selectedReviewIds.length} selected)`}
                  </button>

                  {/* Render Generated Bug Report */}
                  {generatedBug && (
                    <div className="generated-bug-report">
                      <div className="bug-report-field">
                        <span className="bug-field-label">Bug Ticket Title</span>
                        <span className="bug-field-value" style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{generatedBug.title}</span>
                      </div>
                      
                      <div className="flex-between">
                        <div className="bug-report-field">
                          <span className="bug-field-label">Severity</span>
                          <span className={`bug-severity-pill ${generatedBug.severity}`}>{generatedBug.severity}</span>
                        </div>
                        <div className="bug-report-field">
                          <span className="bug-field-label">Platform Impact</span>
                          <span className="bug-field-value">{generatedBug.platform}</span>
                        </div>
                      </div>

                      <div className="bug-report-field">
                        <span className="bug-field-label">Description</span>
                        <p className="bug-field-value">{generatedBug.description}</p>
                      </div>

                      <div className="bug-report-field">
                        <span className="bug-field-label">Steps to Reproduce</span>
                        <ol style={{ paddingLeft: '18px', fontSize: '13px' }}>
                          {generatedBug.stepsToReproduce.map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      <div className="bug-report-field">
                        <span className="bug-field-label">Expected Behavior</span>
                        <p className="bug-field-value" style={{ color: 'var(--color-positive)' }}>{generatedBug.expectedBehavior}</p>
                      </div>

                      <div className="bug-report-field">
                        <span className="bug-field-label">Actual Behavior</span>
                        <p className="bug-field-value" style={{ color: 'var(--color-negative)' }}>{generatedBug.actualBehavior}</p>
                      </div>

                      <div className="bug-report-field">
                        <span className="bug-field-label">Linked User Verbatims</span>
                        {generatedBug.userQuotes.map((quote, idx) => (
                          <blockquote key={idx} style={{ fontSize: '12px', borderLeft: '2px solid var(--color-primary)', paddingLeft: '8px', fontStyle: 'italic', margin: '4px 0' }}>
                            "{quote}"
                          </blockquote>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'reporting' && (
            <div className="report-viewer-card">
              {renderMarkdown(weeklyPulse)}
              
              <div className="report-actions-row">
                <button 
                  className="btn-primary" 
                  onClick={handlePublishDoc}
                  disabled={isPublishingDoc || !weeklyPulse}
                >
                  {isPublishingDoc ? '📄 Publishing Doc...' : '📄 Create Google Doc'}
                </button>
                <button 
                  className="btn-primary"
                  style={{ backgroundColor: 'var(--color-secondary)', color: '#ffffff' }}
                  onClick={handlePublishEmail}
                  disabled={isPublishingEmail || !weeklyPulse}
                >
                  {isPublishingEmail ? '✉️ Creating Draft...' : '✉️ Create Gmail Draft'}
                </button>
              </div>

              {publishedDocUrl && (
                <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px' }}>
                  <span>🟢 Doc Link: </span>
                  <a href={publishedDocUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                    Open Published Google Doc
                  </a>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* Global Sync Overlay */}
      {isLoading && syncStatus && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <h2>{syncStatus}</h2>
          <p>Please wait. Connecting to Google Play / App Store & processing via Groq LLM...</p>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-notification`} style={{ borderLeftColor: toast.type === 'error' ? 'var(--color-negative)' : 'var(--color-primary)' }}>
          <span>{toast.type === 'error' ? '❌' : toast.type === 'info' ? 'ℹ️' : '✅'}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
