export type Post = {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  ai: boolean;
  likes: number;
  createdAt: number;
  tags?: string[];
  authorName?: string;
  authorAvatar?: string;
};

function createEl(tag: string, cls?: string) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

export function mountImageUploader(root: HTMLElement, onPost: (p: Post) => void) {
  root.innerHTML = `
    <div class="p-6 bg-white rounded-lg shadow">
      <div class="flex items-start justify-between mb-4">
        <h2 class="text-lg font-medium">New Post</h2>
        <button id="modal-close" class="text-slate-500 hover:text-slate-700">✕</button>
      </div>

      <div class="space-y-3">
        <div>
          <label class="block text-sm text-slate-700">Title</label>
          <input id="title" class="mt-1 w-full border rounded px-3 py-2" placeholder="タイトルを入力" />
        </div>
        <div>
          <label class="block text-sm text-slate-700">Tags <span class="text-xs text-slate-400">(カンマ区切り)</span></label>
          <input id="tags" class="mt-1 w-full border rounded px-3 py-2" placeholder="例: ファンタジー, 美少女" />
        </div>
        <div>
          <label class="block text-sm text-slate-700">Description</label>
          <textarea id="desc" class="mt-1 w-full border rounded px-3 py-2" placeholder="説明（任意）"></textarea>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-slate-700">Upload Image</label>
          <input id="file" type="file" accept="image/*" />
          <button id="generate" class="ml-auto px-3 py-2 bg-indigo-600 text-white rounded">Generate AI Image</button>
        </div>
        <div class="flex justify-end">
          <button id="post" class="px-4 py-2 bg-green-600 text-white rounded">Post</button>
        </div>
      </div>
    </div>
  `;

  const title = root.querySelector<HTMLInputElement>('#title')!;
  const desc = root.querySelector<HTMLTextAreaElement>('#desc')!;
  const tagsInput = root.querySelector<HTMLInputElement>('#tags')!;
  const file = root.querySelector<HTMLInputElement>('#file')!;
  const generate = root.querySelector<HTMLButtonElement>('#generate')!;
  const postBtn = root.querySelector<HTMLButtonElement>('#post')!;
  const closeBtn = root.querySelector<HTMLButtonElement>('#modal-close');

  let stagedImage: string | null = null;

  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      stagedImage = String(reader.result || '');
      postBtn.textContent = 'Post (ready)';
    };
    reader.readAsDataURL(f);
  });

  generate.addEventListener('click', async () => {
    const seed = Math.random().toString(36).slice(2, 9);
    const url = `https://picsum.photos/seed/${seed}/800/600`;
    stagedImage = url;
    postBtn.textContent = 'Post (generated)';
  });

  postBtn.addEventListener('click', () => {
    const t = title.value.trim() || 'Untitled';
    const d = desc.value.trim();
    if (!stagedImage) {
      alert('Please upload or generate an image first.');
      return;
    }
    const post: Post = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,8),
      title: t,
      description: d || undefined,
      imageUrl: stagedImage,
      ai: stagedImage.startsWith('http'),
      likes: 0,
      tags: tagsInput.value.split(',').map(s => s.trim()).filter(Boolean),
      authorName: 'You',
      createdAt: Date.now(),
    };
    // reset
    title.value = '';
    desc.value = '';
    tagsInput.value = '';
    file.value = '';
    stagedImage = null;
    postBtn.textContent = 'Post';
    onPost(post);
  });

  if (closeBtn) closeBtn.addEventListener('click', () => {
    const evt = new CustomEvent('close-modal');
    root.dispatchEvent(evt);
  });

  return {
    open() {
      // focus title input when opened
      setTimeout(() => title.focus(), 50);
    },
    close() {
      // nothing special
    }
  };
}
