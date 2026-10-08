// Service Worker - GMAO Drilling (fichier unique) - v3
// Objectif : l app s ouvre et genere ses PDF sans aucun reseau.
var CACHE_NAME = "gmao-solo-v3";

// Indispensables : sans eux l app ne s ouvre pas hors-ligne
var CORE = [
  "./",
  "./index.html",
  "./manifest.json"
];
// Importants mais non bloquants : si l un manque, le reste du hors-ligne marche quand meme
var OPTIONAL = [
  "./jspdf.umd.min.js",
  "./icon-192.png",
  "./icon-512.png"
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

  // 1) PAGE : cache d abord (ouverture instantanee, meme sans reseau),
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
