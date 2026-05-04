import type { Post } from "./ImageUploader.js";

export function renderGallery(root: HTMLElement, posts: Post[], handlers: { onDelete: (id: string) => void; onLike: (id: string) => void }) {
  if (!posts.length) {
    root.innerHTML = `<div class="p-8 border rounded text-center text-slate-500">まだ投稿はありません。AI画像を生成して投稿してみましょう。</div>`;
    return;
  }

  root.innerHTML = `
    <div class="grid grid-cols-5 gap-4">
      ${posts.map(p => `
        <article class="bg-white border rounded overflow-hidden shadow-sm" data-id="${p.id}">
          <div class="w-full h-44 bg-slate-100 overflow-hidden relative">
            <img src="${p.imageUrl}" alt="${escapeHtml(p.title)}" loading="lazy" class="w-full h-full object-cover" />
            <div class="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">${p.ai ? 'AI' : ''}</div>
          </div>
          <div class="p-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">${escapeHtml(p.title)}</h3>
              <div class="text-xs text-slate-500">❤ ${p.likes || 0}</div>
            </div>
            <p class="text-xs text-slate-500">${new Date(p.createdAt).toLocaleDateString()}</p>
            ${p.description ? `<p class="mt-2 text-sm text-slate-700">${escapeHtml(p.description)}</p>` : ''}
            ${p.tags && p.tags.length ? `<div class="mt-3 flex flex-wrap gap-2">${p.tags.map((t) => `<span class="text-xs bg-slate-100 px-2 py-1 rounded">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            <div class="mt-3 flex items-center gap-2">
              <button class="like px-2 py-1 text-sm bg-rose-100 rounded">Like</button>
              <button class="delete px-2 py-1 text-sm bg-slate-100 rounded">Delete</button>
            </div>
          </div>
        </article>
      `).join('')}
    </div>
  `;

  // wire buttons
  root.querySelectorAll('[data-id]').forEach(card => {
    const id = card.getAttribute('data-id')!;
    const like = card.querySelector<HTMLButtonElement>('.like')!;
    const del = card.querySelector<HTMLButtonElement>('.delete')!;
    like.addEventListener('click', () => handlers.onLike(id));
    del.addEventListener('click', () => {
      if (confirm('Delete this post?')) handlers.onDelete(id);
    });
  });
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
