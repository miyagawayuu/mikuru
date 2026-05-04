import "./styles.css";

import { mountImageUploader, type Post } from "./components/ImageUploader.js";
import { renderGallery } from "./components/ImageGallery.js";
import { renderSidebar } from "./components/Sidebar.js";

const STORAGE_KEY = "mikuru.ai.posts.v1";

function loadPosts(): Post[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePosts(posts: Post[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

let posts: Post[] = loadPosts();

const modalRoot = document.getElementById('modal')!;
const modalContent = document.getElementById('modal-content')!;
const galleryRoot = document.getElementById("gallery")!;
const asideRoot = document.querySelector('aside')!;

function rerender() {
  renderGallery(galleryRoot, posts, {
    onDelete(id: string) {
      posts = posts.filter((p) => p.id !== id);
      savePosts(posts);
      rerender();
    },
    onLike(id: string) {
      const p = posts.find((x) => x.id === id);
      if (p) {
        p.likes = (p.likes || 0) + 1;
        savePosts(posts);
        rerender();
      }
    }
  });
}

const uploader = mountImageUploader(modalContent, (post: Post) => {
  posts.unshift(post);
  savePosts(posts);
  closeModal();
  rerender();
});

function openModal() {
  modalRoot.classList.remove('hidden');
  modalRoot.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  uploader.open?.();
}

function closeModal() {
  modalRoot.classList.add('hidden');
  modalRoot.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
  uploader.close?.();
}

const openBtn = document.getElementById('open-post');
if (openBtn) openBtn.addEventListener('click', openModal);
const backdrop = document.getElementById('modal-backdrop');
if (backdrop) backdrop.addEventListener('click', closeModal);
modalContent.addEventListener('close-modal', closeModal as EventListener);

rerender();

// sample sidebar data
renderSidebar(asideRoot, {
  recommended: [
    { id: 'u1', name: 'sakura', avatar: 'https://i.pravatar.cc/40?img=12' },
    { id: 'u2', name: 'miku', avatar: 'https://i.pravatar.cc/40?img=8' },
    { id: 'u3', name: 'hana', avatar: 'https://i.pravatar.cc/40?img=4' }
  ],
  rankings: [
    { title: '人気投稿A', count: 123 },
    { title: '人気投稿B', count: 98 },
    { title: '人気投稿C', count: 72 }
  ],
  categories: ['ファンタジー','美少女','風景','キャラクター','日常']
});

// search filter
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    if (!q) {
      posts = loadPosts();
      rerender();
      return;
    }
    const all = loadPosts();
    const filtered = all.filter((p) => {
      const inTitle = p.title.toLowerCase().includes(q);
      const inTags = (p.tags || []).some((t) => t.toLowerCase().includes(q));
      const inAuthor = (p.authorName||'').toLowerCase().includes(q);
      return inTitle || inTags || inAuthor;
    });
    posts = filtered;
    renderGallery(galleryRoot, posts, {
      onDelete(id: string){ posts = posts.filter((x)=>x.id!==id); savePosts(posts); rerender(); },
      onLike(id: string){ const p = posts.find((x)=>x.id===id); if(p){ p.likes = (p.likes||0)+1; savePosts(posts); rerender(); } }
    });
  });
}
