// Service Worker - GMAO Drilling (fichier unique)
var CACHE_NAME = "gmao-solo-v1";

var CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];
var EXTRA = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE).then(function(){
        return Promise.all(EXTRA.map(function(url){
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

function offlinePage(){
  return caches.open(CACHE_NAME).then(function(cache){
    return cache.match("./index.html", {ignoreSearch:true}).then(function(a){
      return a || cache.match("./", {ignoreSearch:true});
    });
  });
}

self.addEventListener("fetch", function(event) {
  var req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      caches.match(req, {ignoreSearch:true}).then(function(cached){
        if (cached) return cached;
        return fetch(req).then(function(resp){
          if (resp && resp.status === 200) {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then(function(c){ c.put(req, copy).catch(function(){}); });
          }
          return resp;
        }).catch(function(){ return offlinePage(); });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req, {ignoreSearch:true}).then(function(cached){
      if (cached) return cached;
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
