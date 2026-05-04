type UserSummary = { id: string; name: string; avatar?: string };

export function renderSidebar(root: HTMLElement, opts: { recommended: UserSummary[]; rankings: { title: string; count?: number }[]; categories: string[] }) {
  root.innerHTML = `
    <div class="space-y-4">
      <div class="p-3 border rounded bg-white">
        <h4 class="text-sm font-medium">おすすめのユーザー</h4>
        <div class="mt-3 flex flex-col gap-3">
          ${opts.recommended.map(u => `
            <div class="flex items-center gap-3">
              <img src="${u.avatar || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full object-cover" />
              <div class="text-sm">${escapeHtml(u.name)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="p-3 border rounded bg-white">
        <h4 class="text-sm font-medium">ランキング</h4>
        <ol class="mt-3 space-y-2 text-sm text-slate-700">
          ${opts.rankings.map((r, i) => `<li>${i+1}. ${escapeHtml(r.title)} <span class="text-xs text-slate-400">${r.count ?? ''}</span></li>`).join('')}
        </ol>
      </div>

      <div class="p-3 border rounded bg-white">
        <h4 class="text-sm font-medium">おすすめカテゴリ</h4>
        <div class="mt-3 flex flex-wrap gap-2">
          ${opts.categories.map(c => `<span class="text-xs px-2 py-1 bg-slate-100 rounded">${escapeHtml(c)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
