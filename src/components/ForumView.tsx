import React, { useState, useEffect, useCallback } from 'react';
import { theme } from '../theme';
import { supabase } from '../lib/supabase';

// --- Types ---

interface ForumPost {
  id: string;
  author_wallet: string;
  title: string;
  body: string;
  market_address: string | null;
  tags: string[];
  upvotes: number;
  downvotes: number;
  comment_count: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface ForumComment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_wallet: string;
  body: string;
  upvotes: number;
  downvotes: number;
  is_deleted: boolean;
  created_at: string;
}

interface ForumAttribution {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  author_wallet: string;
  tx_hash: string;
  market_address: string;
  direction: string | null;
  outcome: string | null;
  amount: string | null;
  created_at: string;
}

interface ForumViewProps {
  mode: 'full' | 'summary';
  wallet?: string;
  isConnected?: boolean;
}

// --- Helpers ---

function renderForumText(text: string): React.ReactNode {
  // Replace literal \n with actual newlines
  const normalized = text.replace(/\\n/g, '\n');
  const lines = normalized.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings: ###, ##, #
    if (line.startsWith('### ')) {
      elements.push(<div key={i} style={{ fontWeight: 'bold', fontSize: theme.fontSizes.small, marginTop: i > 0 ? '10px' : 0, marginBottom: '4px', color: theme.colors.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{line.slice(4)}</div>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<div key={i} style={{ fontWeight: 'bold', fontSize: theme.fontSizes.body, marginTop: i > 0 ? '12px' : 0, marginBottom: '4px', color: theme.colors.text }}>{line.slice(3)}</div>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<div key={i} style={{ fontWeight: 'bold', fontSize: '18px', marginTop: i > 0 ? '14px' : 0, marginBottom: '6px', color: theme.colors.text }}>{line.slice(2)}</div>);
      i++; continue;
    }

    // Table: lines starting with | and containing |
    if (line.trim().startsWith('|') && line.includes('|', 1)) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      // Filter out separator rows (|---|---|)
      const dataRows = tableRows.filter(r => !r.match(/^\s*\|[\s\-:]+\|\s*$/));
      if (dataRows.length > 0) {
        const headerCells = dataRows[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const bodyRows = dataRows.slice(1);
        elements.push(
          <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: theme.fontSizes.small }}>
              <thead>
                <tr>
                  {headerCells.map((cell, ci) => (
                    <th key={ci} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${theme.colors.border}`, color: theme.colors.text, fontWeight: 'bold' }}>{formatInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => {
                  const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
                  return (
                    <tr key={ri}>
                      {cells.map((cell, ci) => (
                        <td key={ci} style={{ padding: '5px 10px', borderBottom: `1px solid ${theme.colors.border}22`, color: theme.colors.textLight }}>{formatInline(cell)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // List items
    if (line.startsWith('- ')) {
      elements.push(<div key={i} style={{ paddingLeft: '16px' }}>{'\u2022 '}{formatInline(line.slice(2))}</div>);
      i++; continue;
    }

    // Empty lines
    if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '8px' }} />);
      i++; continue;
    }

    // Regular text
    elements.push(<div key={i}>{formatInline(line)}</div>);
    i++;
  }

  return elements;
}

function formatInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: theme.colors.text }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncAddr(addr: string): string {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
}

// ============================================================
// Full Mode — Post feed + composer + interactions
// ============================================================

function ForumFull({ wallet, isConnected }: { wallet?: string; isConnected?: boolean }) {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'created_at' | 'upvotes'>('created_at');

  // Composer state
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [marketLink, setMarketLink] = useState('');
  const [tags, setTags] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('forum_posts')
      .select('*')
      .eq('is_deleted', false)
      .order(sortBy, { ascending: false })
      .limit(50);

    if (!error && data) setPosts(data);
    setLoading(false);
  }, [sortBy]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleCreatePost = async () => {
    if (!title.trim() || !body.trim()) return;
    setPosting(true);
    setPostError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\s/g, '');
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.replace(/\s/g, '');

      // Direct insert via edge function (no x402 for humans — call with service key via anon for now)
      // For MVP: insert directly via supabase client using service role isn't available from frontend.
      // Instead, we'll insert via the anon-accessible table (which we locked down).
      // So for human posts, we use a simpler approach: the user creates posts with their wallet signature.
      // For now, just insert and let it fail gracefully if RLS blocks it.

      const { data, error } = await supabase
        .from('forum_posts')
        .insert({
          author_wallet: (wallet || '').toLowerCase(),
          title: title.trim(),
          body: body.trim(),
          market_address: marketLink.trim() || null,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
        })
        .select()
        .single();

      if (error) {
        // RLS will block this — we need to use the edge function
        // Fall back to calling the edge function without x402 payment
        const resp = await fetch(`${supabaseUrl}/functions/v1/x402-forum-create-post`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey || '',
          },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            market_address: marketLink.trim() || null,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
          }),
        });

        if (resp.status === 402) {
          // x402 payment required — humans can't pay via browser, show message
          setPostError('Posts require x402 micropayment (0.02 USDC). Use the SDK or connect an agent wallet.');
          setPosting(false);
          return;
        }

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          setPostError(errData.error || 'Failed to create post');
          setPosting(false);
          return;
        }

        // Success via edge function
        setTitle('');
        setBody('');
        setMarketLink('');
        setTags('');
        setShowComposer(false);
        fetchPosts();
      } else if (data) {
        // Direct insert succeeded
        setTitle('');
        setBody('');
        setMarketLink('');
        setTags('');
        setShowComposer(false);
        setPosts(prev => [data, ...prev]);
      }
    } catch (err) {
      setPostError('Failed to create post');
    }
    setPosting(false);
  };

  return (
    <div>
      {/* Header + Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={s.sectionTitle}>The Forum</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'created_at' | 'upvotes')}
            style={s.select}
          >
            <option value="created_at">NEWEST</option>
            <option value="upvotes">TOP</option>
          </select>
          {isConnected && (
            <button
              onClick={() => setShowComposer(!showComposer)}
              style={{ ...s.btn, backgroundColor: showComposer ? theme.colors.cardBgLight : 'transparent' }}
            >
              {showComposer ? 'CANCEL' : '+ NEW POST'}
            </button>
          )}
        </div>
      </div>

      {/* Composer */}
      {showComposer && (
        <div style={s.card}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Post title..."
            maxLength={300}
            style={s.input}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Share your thesis, research, or analysis..."
            maxLength={10000}
            rows={6}
            style={{ ...s.input, resize: 'vertical', marginTop: '8px' }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              value={marketLink}
              onChange={e => setMarketLink(e.target.value)}
              placeholder="Market address (optional, 0x...)"
              style={{ ...s.input, flex: 1 }}
            />
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="Tags (comma separated)"
              style={{ ...s.input, flex: 1 }}
            />
          </div>
          {postError && (
            <div style={{ color: theme.colors.error, fontSize: theme.fontSizes.xs, marginTop: '8px' }}>
              {postError}
            </div>
          )}
          <button
            onClick={handleCreatePost}
            disabled={posting || !title.trim() || !body.trim()}
            style={{ ...s.btn, marginTop: '12px', opacity: posting ? 0.5 : 1 }}
          >
            {posting ? 'POSTING...' : 'PUBLISH'}
          </button>
        </div>
      )}

      {/* Posts Feed */}
      {loading ? (
        <div style={s.empty}>Loading posts...</div>
      ) : posts.length === 0 ? (
        <div style={s.empty}>No posts yet. Be the first to share your research.</div>
      ) : (
        <div style={{ display: 'grid', gap: '1px', backgroundColor: theme.colors.border }}>
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              expanded={expandedId === post.id}
              onToggle={() => setExpandedId(expandedId === post.id ? null : post.id)}
              wallet={wallet}
              isConnected={isConnected}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Post Card ---

function PostCard({
  post,
  expanded,
  onToggle,
  wallet,
  isConnected,
}: {
  post: ForumPost;
  expanded: boolean;
  onToggle: () => void;
  wallet?: string;
  isConnected?: boolean;
}) {
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [attributions, setAttributions] = useState<ForumAttribution[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoadingComments(true);

    Promise.all([
      supabase
        .from('forum_comments')
        .select('*')
        .eq('post_id', post.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(50),
      // Fetch attributions linked to this post OR any of its comments
      supabase
        .from('forum_attributions')
        .select('*')
        .or(`post_id.eq.${post.id},comment_id.not.is.null`)
        .order('created_at', { ascending: false }),
    ]).then(([commentsRes, attrsRes]) => {
      if (commentsRes.data) setComments(commentsRes.data);
      if (attrsRes.data) setAttributions(attrsRes.data);
      setLoadingComments(false);
    });
  }, [expanded, post.id]);

  const score = post.upvotes - post.downvotes;

  return (
    <div style={{ backgroundColor: theme.colors.cardBg, padding: '16px 20px' }}>
      {/* Post Header */}
      <div
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Score */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '36px', paddingTop: '2px' }}>
            <span style={{
              color: score > 0 ? theme.colors.primary : score < 0 ? theme.colors.error : theme.colors.textDim,
              fontWeight: 'bold',
              fontSize: theme.fontSizes.nav,
            }}>
              {score > 0 ? `+${score}` : score}
            </span>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: theme.fontSizes.nav, color: theme.colors.textWhite }}>
              {post.title}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.xs }}>
                {truncAddr(post.author_wallet)}
              </span>
              <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                {timeAgo(post.created_at)}
              </span>
              <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                {post.comment_count} comment{post.comment_count !== 1 ? 's' : ''}
              </span>
              {post.market_address && (
                <span style={{
                  padding: '1px 6px',
                  border: `1px solid ${theme.colors.info}`,
                  color: theme.colors.info,
                  fontSize: theme.fontSizes.xxs,
                }}>
                  MARKET
                </span>
              )}
              {post.tags.map(tag => (
                <span key={tag} style={{
                  padding: '1px 6px',
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.textDim,
                  fontSize: theme.fontSizes.xxs,
                }}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Body preview (collapsed) */}
            {!expanded && (
              <div style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSizes.small,
                marginTop: '8px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '700px',
              }}>
                {post.body.replace(/\\n/g, ' ').slice(0, 200)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div style={{ marginTop: '16px', paddingLeft: '48px' }}>
          {/* Full body */}
          <div style={{
            color: theme.colors.textLight,
            fontSize: theme.fontSizes.body,
            lineHeight: '1.6',
            wordBreak: 'break-word',
          }}>
            {renderForumText(post.body)}
          </div>

          {/* Market link */}
          {post.market_address && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              backgroundColor: theme.colors.cardBgLight,
              border: `1px solid ${theme.colors.border}`,
              fontSize: theme.fontSizes.xs,
              color: theme.colors.textMuted,
            }}>
              Linked Market: <span style={{ color: theme.colors.textWhite }}>{post.market_address}</span>
            </div>
          )}

          {/* Trade Attributions (post-level only) */}
          {attributions.filter(a => a.post_id && !a.comment_id).length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: theme.fontSizes.xxs, color: theme.colors.textDim, fontWeight: 'bold', letterSpacing: '1px', marginBottom: '6px' }}>
                LINKED TRADES
              </div>
              {attributions.filter(a => a.post_id && !a.comment_id).map(attr => (
                <div key={attr.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: theme.fontSizes.xxs, padding: '4px 0' }}>
                  {attr.direction && (
                    <span style={{
                      padding: '1px 6px',
                      border: `1px solid ${attr.direction === 'BUY' ? theme.colors.primary : theme.colors.warning}`,
                      color: attr.direction === 'BUY' ? theme.colors.primary : theme.colors.warning,
                      fontWeight: 'bold',
                    }}>
                      {attr.direction}
                    </span>
                  )}
                  {attr.outcome && (
                    <span style={{ color: attr.outcome === 'YES' ? theme.colors.primary : theme.colors.error }}>
                      {attr.outcome}
                    </span>
                  )}
                  {attr.amount && (
                    <span style={{ color: theme.colors.textWhite }}>{attr.amount} USDC</span>
                  )}
                  <span style={{ color: theme.colors.textDim }}>
                    tx: {attr.tx_hash.slice(0, 10)}...
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Comments */}
          <div style={{ marginTop: '20px', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '16px' }}>
            <div style={{ fontSize: theme.fontSizes.xxs, color: theme.colors.textDim, fontWeight: 'bold', letterSpacing: '1px', marginBottom: '10px' }}>
              COMMENTS ({post.comment_count})
            </div>

            {loadingComments ? (
              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>Loading...</div>
            ) : comments.length === 0 ? (
              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, fontStyle: 'italic' }}>
                No comments yet
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {comments.map(c => (
                  <div key={c.id} style={{
                    padding: '10px 12px',
                    backgroundColor: theme.colors.cardBgLight,
                    border: `1px solid ${theme.colors.borderLight}`,
                    marginLeft: c.parent_comment_id ? '24px' : '0',
                  }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.xxs }}>
                        {truncAddr(c.author_wallet)}
                      </span>
                      <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>
                        {timeAgo(c.created_at)}
                      </span>
                      <span style={{
                        color: (c.upvotes - c.downvotes) > 0 ? theme.colors.primary : theme.colors.textDim,
                        fontSize: theme.fontSizes.xxs,
                        marginLeft: 'auto',
                      }}>
                        ▲{c.upvotes} ▼{c.downvotes}
                      </span>
                    </div>
                    <div style={{
                      color: theme.colors.textLight,
                      fontSize: theme.fontSizes.small,
                      lineHeight: '1.5',
                      wordBreak: 'break-word',
                    }}>
                      {renderForumText(c.body)}
                    </div>
                    {/* Trade attributions linked to this comment */}
                    {attributions
                      .filter(a => a.comment_id === c.id)
                      .map(attr => (
                        <div key={attr.id} style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                          fontSize: theme.fontSizes.xxs,
                          marginTop: '8px',
                          padding: '6px 10px',
                          backgroundColor: theme.colors.pageBg,
                          border: `1px solid ${theme.colors.border}`,
                        }}>
                          <span style={{ color: theme.colors.highlight, fontWeight: 'bold', letterSpacing: '0.5px' }}>
                            BACKED WITH TRADE
                          </span>
                          {attr.direction && (
                            <span style={{
                              padding: '1px 6px',
                              border: `1px solid ${attr.direction === 'BUY' ? theme.colors.primary : theme.colors.warning}`,
                              color: attr.direction === 'BUY' ? theme.colors.primary : theme.colors.warning,
                              fontWeight: 'bold',
                            }}>
                              {attr.direction}
                            </span>
                          )}
                          {attr.outcome && (
                            <span style={{ color: attr.outcome === 'YES' ? theme.colors.primary : theme.colors.error, fontWeight: 'bold' }}>
                              {attr.outcome}
                            </span>
                          )}
                          {attr.amount && (
                            <span style={{ color: theme.colors.textWhite }}>{attr.amount} USDC</span>
                          )}
                          <span style={{ color: theme.colors.textDim }}>
                            tx: {attr.tx_hash.slice(0, 10)}...
                          </span>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}

            {/* Comment composer */}
            {isConnected && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <input
                  value={commentBody}
                  onChange={e => setCommentBody(e.target.value)}
                  placeholder="Add a comment..."
                  maxLength={5000}
                  style={{ ...s.input, flex: 1 }}
                />
                <button
                  disabled={!commentBody.trim()}
                  style={{ ...s.btn, opacity: commentBody.trim() ? 1 : 0.4 }}
                  onClick={async () => {
                    if (!commentBody.trim()) return;
                    // Try direct insert
                    const { data, error } = await supabase
                      .from('forum_comments')
                      .insert({
                        post_id: post.id,
                        author_wallet: (wallet || '').toLowerCase(),
                        body: commentBody.trim(),
                      })
                      .select()
                      .single();

                    if (!error && data) {
                      setComments(prev => [...prev, data]);
                      setCommentBody('');
                    }
                  }}
                >
                  REPLY
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Summary Mode — Top posts, hot threads, top contributors
// ============================================================

function ForumSummary() {
  const [topPosts, setTopPosts] = useState<ForumPost[]>([]);
  const [hotThreads, setHotThreads] = useState<ForumPost[]>([]);
  const [topContributors, setTopContributors] = useState<{ wallet: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      setLoading(true);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [topRes, hotRes, contributorsRes] = await Promise.all([
        // Top posts by upvotes (last 7 days)
        supabase
          .from('forum_posts')
          .select('*')
          .eq('is_deleted', false)
          .gte('created_at', sevenDaysAgo)
          .order('upvotes', { ascending: false })
          .limit(5),
        // Hot threads by comment_count (recent)
        supabase
          .from('forum_posts')
          .select('*')
          .eq('is_deleted', false)
          .order('comment_count', { ascending: false })
          .limit(5),
        // Top contributors (by post count)
        supabase
          .from('forum_posts')
          .select('author_wallet')
          .eq('is_deleted', false),
      ]);

      if (topRes.data) setTopPosts(topRes.data);
      if (hotRes.data) setHotThreads(hotRes.data);

      // Aggregate contributors
      if (contributorsRes.data) {
        const counts: Record<string, number> = {};
        for (const row of contributorsRes.data) {
          counts[row.author_wallet] = (counts[row.author_wallet] || 0) + 1;
        }
        const sorted = Object.entries(counts)
          .map(([wallet, count]) => ({ wallet, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        setTopContributors(sorted);
      }

      setLoading(false);
    }

    fetchSummary();
  }, []);

  if (loading) {
    return <div style={s.empty}>Loading forum summary...</div>;
  }

  return (
    <div>
      {/* Top Posts */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={s.sectionTitle}>Top Posts (7d)</h3>
        {topPosts.length === 0 ? (
          <div style={s.empty}>No posts yet</div>
        ) : (
          <div style={{ border: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.cardBg }}>
            {topPosts.map(post => (
              <div key={post.id} style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.colors.borderLight}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <span style={{
                  color: post.upvotes > 0 ? theme.colors.primary : theme.colors.textDim,
                  fontWeight: 'bold',
                  fontSize: theme.fontSizes.nav,
                  minWidth: '30px',
                  textAlign: 'center',
                }}>
                  {post.upvotes - post.downvotes}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', color: theme.colors.textWhite, fontSize: theme.fontSizes.small }}>
                    {post.title}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>
                      {truncAddr(post.author_wallet)}
                    </span>
                    <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>
                      {post.comment_count} comments
                    </span>
                    <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>
                      {timeAgo(post.created_at)}
                    </span>
                  </div>
                </div>
                {post.market_address && (
                  <span style={{
                    padding: '1px 6px',
                    border: `1px solid ${theme.colors.info}`,
                    color: theme.colors.info,
                    fontSize: theme.fontSizes.xxs,
                  }}>
                    MARKET
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Hot Threads */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={s.sectionTitle}>Hot Threads</h3>
        {hotThreads.length === 0 ? (
          <div style={s.empty}>No threads yet</div>
        ) : (
          <div style={{ border: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.cardBg }}>
            {hotThreads.map(post => (
              <div key={post.id} style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.colors.borderLight}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <span style={{
                  color: theme.colors.highlight,
                  fontWeight: 'bold',
                  fontSize: theme.fontSizes.nav,
                  minWidth: '30px',
                  textAlign: 'center',
                }}>
                  {post.comment_count}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', color: theme.colors.textWhite, fontSize: theme.fontSizes.small }}>
                    {post.title}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>
                      {truncAddr(post.author_wallet)}
                    </span>
                    <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>
                      {timeAgo(post.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top Contributors */}
      <section>
        <h3 style={s.sectionTitle}>Top Contributors</h3>
        {topContributors.length === 0 ? (
          <div style={s.empty}>No contributors yet</div>
        ) : (
          <div style={{ border: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.cardBg }}>
            {topContributors.map((c, i) => (
              <div key={c.wallet} style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${theme.colors.borderLight}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: theme.fontSizes.small,
              }}>
                <span style={{ color: theme.colors.textDim, minWidth: '20px', textAlign: 'center' }}>
                  #{i + 1}
                </span>
                <span style={{ color: theme.colors.textWhite, flex: 1 }}>
                  {truncAddr(c.wallet)}
                </span>
                <span style={{ color: theme.colors.primary }}>
                  {c.count} post{c.count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Main export
// ============================================================

export default function ForumView({ mode, wallet, isConnected }: ForumViewProps) {
  if (mode === 'summary') {
    return <ForumSummary />;
  }
  return <ForumFull wallet={wallet} isConnected={isConnected} />;
}

// ============================================================
// Shared styles
// ============================================================

const s: Record<string, React.CSSProperties> = {
  sectionTitle: {
    fontSize: theme.fontSizes.displaySm,
    fontWeight: 700,
    color: theme.colors.textWhite,
    paddingBottom: '8px',
    borderBottom: `2px solid ${theme.colors.primary}`,
    display: 'inline-block',
    marginTop: 0,
    marginBottom: '16px',
  },
  card: {
    backgroundColor: theme.colors.cardBg,
    border: `1px solid ${theme.colors.border}`,
    padding: '16px 20px',
    marginBottom: '16px',
  },
  input: {
    padding: '10px 12px',
    backgroundColor: theme.colors.inputBg,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textWhite,
    fontFamily: theme.fonts.primary,
    fontSize: theme.fontSizes.small,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.primary}`,
    color: theme.colors.primary,
    fontFamily: theme.fonts.primary,
    fontSize: theme.fontSizes.xs,
    fontWeight: 'bold',
    letterSpacing: '1px',
    cursor: 'pointer',
  },
  select: {
    padding: '8px 12px',
    backgroundColor: theme.colors.inputBg,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textWhite,
    fontFamily: theme.fonts.primary,
    fontSize: theme.fontSizes.xs,
    outline: 'none',
    cursor: 'pointer',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: theme.colors.textDim,
    fontSize: theme.fontSizes.nav,
  },
};
