/* Service worker: mantém o app utilizável offline.
   - Arquivos do app: cache-first (rápido), atualizado ao trocar a VERSAO.
   - Arquivos de data/: network-first, para que questões novas do GitHub
     apareçam assim que houver conexão, com o cache servindo offline. */

const VERSAO = 'v1';
const CACHE_APP = 'rfb-app-' + VERSAO;
const CACHE_DADOS = 'rfb-dados-' + VERSAO;

const ARQUIVOS = [
  './',
  './index.html',
  './assets/app.css',
  './assets/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP)
      .then((cache) => cache.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== CACHE_APP && c !== CACHE_DADOS).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'limpar-dados') {
    caches.delete(CACHE_DADOS);
  }
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/')) {
    evento.respondWith(
      fetch(requisicao)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CACHE_DADOS).then((cache) => cache.put(requisicao, copia));
          return resposta;
        })
        .catch(() => caches.match(requisicao))
    );
    return;
  }

  evento.respondWith(
    caches.match(requisicao).then((cacheada) => {
      if (cacheada) return cacheada;
      return fetch(requisicao).then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_APP).then((cache) => cache.put(requisicao, copia));
        return resposta;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
