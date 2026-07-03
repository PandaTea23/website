import { useState } from 'react';
import posts from './posts.js';

function PostCard({ post, onClick }) {
  return (
    <article className="post-card" onClick={onClick}>
      {post.image && (
        <div className="post-card-image">
          <img src={post.image} alt={post.title} />
        </div>
      )}
      <div className="post-card-body">
        <p className="post-card-date">{post.date}</p>
        <h2 className="post-card-title">{post.title}</h2>
        <p className="post-card-subtitle">{post.subtitle}</p>
        <span className="post-card-read">Read →</span>
      </div>
    </article>
  );
}

function PostDetail({ post, onBack }) {
  return (
    <div className="post-detail">
      <button className="post-back-btn" onClick={onBack}>← Back</button>

      {post.image && (
        <div className="post-detail-image">
          <img src={post.image} alt={post.title} />
        </div>
      )}

      <div className="post-detail-header">
        <p className="post-detail-date">{post.date}</p>
        <h1 className="post-detail-title">{post.title}</h1>
        <p className="post-detail-subtitle">{post.subtitle}</p>
      </div>

      <div className="post-detail-body">
        {post.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}

export default function Writing() {
  const [selected, setSelected] = useState(null);

  if (selected) {
    return <PostDetail post={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="writing-page">
      <div className="writing-header">
        <h1 className="writing-title">Writing</h1>
        <p className="writing-subtitle">Thoughts on food, culture, and everything in between.</p>
      </div>
      <div className="post-list">
        {posts.map(post => (
          <PostCard key={post.id} post={post} onClick={() => setSelected(post)} />
        ))}
      </div>
    </div>
  );
}
