// Service Worker - GMAO Drilling (fichier unique) - v10 (VERSION 8.5)
// Objectif : l app s ouvre et genere ses PDF sans aucun reseau.
var CACHE_NAME = "gmao-solo-v11";

// Indispensables : sans eux l app ne s ouvre pas hors-ligne
var CORE = [
  "./",
  "./index.html",
  "./manifest.json"
];
// Importants mais non bloquants : si l un manque, le reste du hors-ligne marche quand meme
var OPTIONAL = [
  "./jspdf_umd_min.js",
  "./jspdf.umd.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./ocr_core.js",
  "./ocr_eng.gz"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE).then(function(){
        return Promise.all(OPTIONAL.map(function(url){
          return cache.add(url).catch(function(){});
        }));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Safari refuse d afficher une page servie par le service worker si la reponse
// a subi une redirection (ecran blanc). On reconstruit une reponse "propre".
function clean(resp) {
  if (!resp || !resp.redirected) return Promise.resolve(resp);
  return resp.blob().then(function(body){
    return new Response(body, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
  });
}

// Une demande de page (et pas d image ou de script) ?
function isPage(req) {
  if (req.mode === "navigate") return true;
  if (req.destination === "document") return true;
  var acc = req.headers.get("accept") || "";
  return acc.indexOf("text/html") >= 0;
}

// La page de l app elle-meme ( "/" ou "/index.html" ) ? Seule elle peut remplacer l app en cache.
// (avant : ouvrir manifest.json ou README dans Safari remplacait l app par ce fichier)
function isAppPage(req) {
  try {
    var u = new URL(req.url), sc = new URL(self.registration.scope);
    if (u.origin !== sc.origin) return false;
    return u.pathname === sc.pathname || u.pathname === sc.pathname + "index.html";
  } catch (e) { return false; }
}

// Page de secours : jamais d ecran vide
function offlinePage() {
  return caches.open(CACHE_NAME).then(function(cache){
    return cache.match("./index.html", {ignoreSearch:true}).then(function(a){
      return a || cache.match("./", {ignoreSearch:true});
    });
  }).then(function(r){
    if (r) return clean(r);
    return new Response(
      "<!DOCTYPE html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
      "<body style='font-family:sans-serif;background:#080f0c;color:#e8f2ec;padding:30px'>" +
      "<h2 style='color:#f0a832'>Pas de reseau</h2>" +
      "<p>L application n a pas encore ete enregistree sur ce telephone.</p>" +
      "<p>Ouvre-la une premiere fois avec du reseau, attends 10 secondes, puis elle marchera sans reseau.</p></body>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  });
}

self.addEventListener("fetch", function(event) {
  var req = event.request;
  if (req.method !== "GET") return;

  // 0) AUTRE PAGE DU SITE ouverte dans le navigateur (manifest, README...) :
  //    reseau d abord, et on ne touche jamais a l app en cache.
  if (isPage(req) && !isAppPage(req)) {
    event.respondWith(
      fetch(req).catch(function(){
        return caches.match(req, {ignoreSearch:true}).then(function(c){ return c ? clean(c) : offlinePage(); });
      })
    );
    return;
  }

  // 1) PAGE DE L APP : cache d abord (ouverture instantanee, meme sans reseau),
  //    puis mise a jour silencieuse pour la prochaine ouverture.
  if (isPage(req)) {
    event.respondWith(
      caches.match(req, {ignoreSearch:true}).then(function(cached){
        if (!cached) {
          return caches.match("./index.html", {ignoreSearch:true});
        }
        return cached;
      }).then(function(cached){
        var network = fetch(req).then(function(fresh){
          if (fresh && fresh.status === 200 && !fresh.redirected) {
            var copy = fresh.clone();
            caches.open(CACHE_NAME).then(function(c){ c.put("./index.html", copy).catch(function(){}); });
          }
          return fresh;
        });
        if (cached) {
          network.catch(function(){});
          return clean(cached);
        }
        return network.then(function(r){ return clean(r); }).catch(function(){ return offlinePage(); });
      })
    );
    return;
  }

  // 2) AUTRES FICHIERS (librairie PDF, icones, manifest) : cache d abord, reseau en secours
  event.respondWith(
    caches.match(req, {ignoreSearch:true}).then(function(cached){
      if (cached) return clean(cached);
      return fetch(req).then(function(resp){
        if (resp && resp.status === 200) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(c){ c.put(req, copy).catch(function(){}); });
        }
        return resp;
      }).catch(function(){
        return new Response("", {status: 503, statusText: "Hors-ligne"});
      });
    })
  );
});
