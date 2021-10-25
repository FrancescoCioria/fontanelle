!function(e){var t={};function s(n){if(t[n])return t[n].exports;var a=t[n]={i:n,l:!1,exports:{}};return e[n].call(a.exports,a,a.exports,s),a.l=!0,a.exports}s.m=e,s.c=t,s.d=function(e,t,n){s.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:n})},s.r=function(e){"undefined"!==typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},s.t=function(e,t){if(1&t&&(e=s(e)),8&t)return e;if(4&t&&"object"===typeof e&&e&&e.__esModule)return e;var n=Object.create(null);if(s.r(n),Object.defineProperty(n,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var a in e)s.d(n,a,function(t){return e[t]}.bind(null,a));return n},s.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return s.d(t,"a",t),t},s.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},s.p="/fontanelle/",s(s.s=6)}([function(e,t,s){"use strict";try{self["workbox:core:5.1.4"]&&_()}catch(n){}},function(e,t,s){"use strict";try{self["workbox:precaching:5.1.4"]&&_()}catch(n){}},function(e,t,s){"use strict";try{self["workbox:routing:5.1.4"]&&_()}catch(n){}},function(e,t,s){"use strict";try{self["workbox:strategies:5.1.4"]&&_()}catch(n){}},function(e,t,s){"use strict";try{self["workbox:expiration:5.1.4"]&&_()}catch(n){}},function(e,t,s){"use strict";try{self["workbox:cacheable-response:5.1.4"]&&_()}catch(n){}},function(e,t,s){"use strict";s.r(t);s(0);const n=(e,...t)=>{let s=e;return t.length>0&&(s+=" :: ".concat(JSON.stringify(t))),s};class a extends Error{constructor(e,t){super(n(e,t)),this.name=e,this.details=t}}const r=new Set;const i={googleAnalytics:"googleAnalytics",precache:"precache-v2",prefix:"workbox",runtime:"runtime",suffix:"undefined"!==typeof registration?registration.scope:""},c=e=>[i.prefix,e,i.suffix].filter((e=>e&&e.length>0)).join("-"),o=e=>e||c(i.precache),h=e=>e||c(i.runtime);const u=e=>new URL(String(e),location.href).href.replace(new RegExp("^".concat(location.origin)),""),l=(e,t)=>e.filter((e=>t in e)),d=async({request:e,mode:t,plugins:s=[]})=>{const n=l(s,"cacheKeyWillBeUsed");let a=e;for(const r of n)a=await r.cacheKeyWillBeUsed.call(r,{mode:t,request:a}),"string"===typeof a&&(a=new Request(a));return a},p=async({cacheName:e,request:t,event:s,matchOptions:n,plugins:a=[]})=>{const r=await self.caches.open(e),i=await d({plugins:a,request:t,mode:"read"});let c=await r.match(i,n);for(const o of a)if("cachedResponseWillBeUsed"in o){const t=o.cachedResponseWillBeUsed;c=await t.call(o,{cacheName:e,event:s,matchOptions:n,cachedResponse:c,request:i})}return c},f=async({cacheName:e,request:t,response:s,event:n,plugins:i=[],matchOptions:c})=>{const o=await d({plugins:i,request:t,mode:"write"});if(!s)throw new a("cache-put-with-no-response",{url:u(o.url)});const h=await(async({request:e,response:t,event:s,plugins:n=[]})=>{let a=t,r=!1;for(const i of n)if("cacheWillUpdate"in i){r=!0;const t=i.cacheWillUpdate;if(a=await t.call(i,{request:e,response:a,event:s}),!a)break}return r||(a=a&&200===a.status?a:void 0),a||null})({event:n,plugins:i,response:s,request:o});if(!h)return void 0;const f=await self.caches.open(e),g=l(i,"cacheDidUpdate"),m=g.length>0?await p({cacheName:e,matchOptions:c,request:o}):null;try{await f.put(o,h)}catch(w){throw"QuotaExceededError"===w.name&&await async function(){for(const e of r)await e()}(),w}for(const a of g)await a.cacheDidUpdate.call(a,{cacheName:e,event:n,oldResponse:m,newResponse:h,request:o})},g=p;let m;function w(e){e.then((()=>{}))}class _{constructor(e,t,{onupgradeneeded:s,onversionchange:n}={}){this._db=null,this._name=e,this._version=t,this._onupgradeneeded=s,this._onversionchange=n||(()=>this.close())}get db(){return this._db}async open(){if(!this._db)return this._db=await new Promise(((e,t)=>{let s=!1;setTimeout((()=>{s=!0,t(new Error("The open request was blocked and timed out"))}),this.OPEN_TIMEOUT);const n=indexedDB.open(this._name,this._version);n.onerror=()=>t(n.error),n.onupgradeneeded=e=>{s?(n.transaction.abort(),n.result.close()):"function"===typeof this._onupgradeneeded&&this._onupgradeneeded(e)},n.onsuccess=()=>{const t=n.result;s?t.close():(t.onversionchange=this._onversionchange.bind(this),e(t))}})),this}async getKey(e,t){return(await this.getAllKeys(e,t,1))[0]}async getAll(e,t,s){return await this.getAllMatching(e,{query:t,count:s})}async getAllKeys(e,t,s){return(await this.getAllMatching(e,{query:t,count:s,includeKeys:!0})).map((e=>e.key))}async getAllMatching(e,{index:t,query:s=null,direction:n="next",count:a,includeKeys:r=!1}={}){return await this.transaction([e],"readonly",((i,c)=>{const o=i.objectStore(e),h=t?o.index(t):o,u=[],l=h.openCursor(s,n);l.onsuccess=()=>{const e=l.result;e?(u.push(r?e:e.value),a&&u.length>=a?c(u):e.continue()):c(u)}}))}async transaction(e,t,s){return await this.open(),await new Promise(((n,a)=>{const r=this._db.transaction(e,t);r.onabort=()=>a(r.error),r.oncomplete=()=>n(),s(r,(e=>n(e)))}))}async _call(e,t,s,...n){return await this.transaction([t],s,((s,a)=>{const r=s.objectStore(t),i=r[e].apply(r,n);i.onsuccess=()=>a(i.result)}))}close(){this._db&&(this._db.close(),this._db=null)}}_.prototype.OPEN_TIMEOUT=2e3;const y={readonly:["get","count","getKey","getAll","getAllKeys"],readwrite:["add","put","clear","delete"]};for(const[Y,Z]of Object.entries(y))for(const e of Z)e in IDBObjectStore.prototype&&(_.prototype[e]=async function(t,...s){return await this._call(e,t,Y,...s)});const v=async({request:e,fetchOptions:t,event:s,plugins:n=[]})=>{if("string"===typeof e&&(e=new Request(e)),s instanceof FetchEvent&&s.preloadResponse){const e=await s.preloadResponse;if(e)return e}const r=l(n,"fetchDidFail"),i=r.length>0?e.clone():null;try{for(const t of n)if("requestWillFetch"in t){const n=t.requestWillFetch,a=e.clone();e=await n.call(t,{request:a,event:s})}}catch(o){throw new a("plugin-error-request-will-fetch",{thrownError:o})}const c=e.clone();try{let a;a="navigate"===e.mode?await fetch(e):await fetch(e,t);for(const e of n)"fetchDidSucceed"in e&&(a=await e.fetchDidSucceed.call(e,{event:s,request:c,response:a}));return a}catch(h){0;for(const e of r)await e.fetchDidFail.call(e,{error:h,event:s,originalRequest:i.clone(),request:c.clone()});throw h}};async function x(e,t){const s=e.clone(),n={headers:new Headers(s.headers),status:s.status,statusText:s.statusText},a=t?t(n):n,r=function(){if(void 0===m){const t=new Response("");if("body"in t)try{new Response(t.body),m=!0}catch(e){m=!1}m=!1}return m}()?s.body:await s.blob();return new Response(r,a)}s(4);const R="cache-entries",b=e=>{const t=new URL(e,location.href);return t.hash="",t.href};class q{constructor(e){this._cacheName=e,this._db=new _("workbox-expiration",1,{onupgradeneeded:e=>this._handleUpgrade(e)})}_handleUpgrade(e){const t=e.target.result.createObjectStore(R,{keyPath:"id"});t.createIndex("cacheName","cacheName",{unique:!1}),t.createIndex("timestamp","timestamp",{unique:!1}),(async e=>{await new Promise(((t,s)=>{const n=indexedDB.deleteDatabase(e);n.onerror=()=>{s(n.error)},n.onblocked=()=>{s(new Error("Delete blocked"))},n.onsuccess=()=>{t()}}))})(this._cacheName)}async setTimestamp(e,t){const s={url:e=b(e),timestamp:t,cacheName:this._cacheName,id:this._getId(e)};await this._db.put(R,s)}async getTimestamp(e){return(await this._db.get(R,this._getId(e))).timestamp}async expireEntries(e,t){const s=await this._db.transaction(R,"readwrite",((s,n)=>{const a=s.objectStore(R).index("timestamp").openCursor(null,"prev"),r=[];let i=0;a.onsuccess=()=>{const s=a.result;if(s){const n=s.value;n.cacheName===this._cacheName&&(e&&n.timestamp<e||t&&i>=t?r.push(s.value):i++),s.continue()}else n(r)}})),n=[];for(const a of s)await this._db.delete(R,a.id),n.push(a.url);return n}_getId(e){return this._cacheName+"|"+b(e)}}class U{constructor(e,t={}){this._isRunning=!1,this._rerunRequested=!1,this._maxEntries=t.maxEntries,this._maxAgeSeconds=t.maxAgeSeconds,this._cacheName=e,this._timestampModel=new q(e)}async expireEntries(){if(this._isRunning)return void(this._rerunRequested=!0);this._isRunning=!0;const e=this._maxAgeSeconds?Date.now()-1e3*this._maxAgeSeconds:0,t=await this._timestampModel.expireEntries(e,this._maxEntries),s=await self.caches.open(this._cacheName);for(const n of t)await s.delete(n);this._isRunning=!1,this._rerunRequested&&(this._rerunRequested=!1,w(this.expireEntries()))}async updateTimestamp(e){await this._timestampModel.setTimestamp(e,Date.now())}async isURLExpired(e){if(this._maxAgeSeconds){return await this._timestampModel.getTimestamp(e)<Date.now()-1e3*this._maxAgeSeconds}return!1}async delete(){this._rerunRequested=!1,await this._timestampModel.expireEntries(1/0)}}class N{constructor(e={}){var t;this.cachedResponseWillBeUsed=async({event:e,request:t,cacheName:s,cachedResponse:n})=>{if(!n)return null;const a=this._isResponseDateFresh(n),r=this._getCacheExpiration(s);w(r.expireEntries());const i=r.updateTimestamp(t.url);if(e)try{e.waitUntil(i)}catch(c){0}return a?n:null},this.cacheDidUpdate=async({cacheName:e,request:t})=>{const s=this._getCacheExpiration(e);await s.updateTimestamp(t.url),await s.expireEntries()},this._config=e,this._maxAgeSeconds=e.maxAgeSeconds,this._cacheExpirations=new Map,e.purgeOnQuotaError&&(t=()=>this.deleteCacheAndMetadata(),r.add(t))}_getCacheExpiration(e){if(e===h())throw new a("expire-custom-caches-only");let t=this._cacheExpirations.get(e);return t||(t=new U(e,this._config),this._cacheExpirations.set(e,t)),t}_isResponseDateFresh(e){if(!this._maxAgeSeconds)return!0;const t=this._getDateHeaderTimestamp(e);if(null===t)return!0;return t>=Date.now()-1e3*this._maxAgeSeconds}_getDateHeaderTimestamp(e){if(!e.headers.has("date"))return null;const t=e.headers.get("date"),s=new Date(t).getTime();return isNaN(s)?null:s}async deleteCacheAndMetadata(){for(const[e,t]of this._cacheExpirations)await self.caches.delete(e),await t.delete();this._cacheExpirations=new Map}}s(1);const T=[],E={get:()=>T,add(e){T.push(...e)}};function L(e){if(!e)throw new a("add-to-cache-list-unexpected-type",{entry:e});if("string"===typeof e){const t=new URL(e,location.href);return{cacheKey:t.href,url:t.href}}const{revision:t,url:s}=e;if(!s)throw new a("add-to-cache-list-unexpected-type",{entry:e});if(!t){const e=new URL(s,location.href);return{cacheKey:e.href,url:e.href}}const n=new URL(s,location.href),r=new URL(s,location.href);return n.searchParams.set("__WB_REVISION__",t),{cacheKey:n.href,url:r.href}}class O{constructor(e){this._cacheName=o(e),this._urlsToCacheKeys=new Map,this._urlsToCacheModes=new Map,this._cacheKeysToIntegrities=new Map}addToCacheList(e){const t=[];for(const s of e){"string"===typeof s?t.push(s):s&&void 0===s.revision&&t.push(s.url);const{cacheKey:e,url:n}=L(s),r="string"!==typeof s&&s.revision?"reload":"default";if(this._urlsToCacheKeys.has(n)&&this._urlsToCacheKeys.get(n)!==e)throw new a("add-to-cache-list-conflicting-entries",{firstEntry:this._urlsToCacheKeys.get(n),secondEntry:e});if("string"!==typeof s&&s.integrity){if(this._cacheKeysToIntegrities.has(e)&&this._cacheKeysToIntegrities.get(e)!==s.integrity)throw new a("add-to-cache-list-conflicting-integrities",{url:n});this._cacheKeysToIntegrities.set(e,s.integrity)}if(this._urlsToCacheKeys.set(n,e),this._urlsToCacheModes.set(n,r),t.length>0){const e="Workbox is precaching URLs without revision "+"info: ".concat(t.join(", "),"\nThis is generally NOT safe. ")+"Learn more at https://bit.ly/wb-precache";console.warn(e)}}}async install({event:e,plugins:t}={}){const s=[],n=[],a=await self.caches.open(this._cacheName),r=await a.keys(),i=new Set(r.map((e=>e.url)));for(const[o,h]of this._urlsToCacheKeys)i.has(h)?n.push(o):s.push({cacheKey:h,url:o});const c=s.map((({cacheKey:s,url:n})=>{const a=this._cacheKeysToIntegrities.get(s),r=this._urlsToCacheModes.get(n);return this._addURLToCache({cacheKey:s,cacheMode:r,event:e,integrity:a,plugins:t,url:n})}));await Promise.all(c);return{updatedURLs:s.map((e=>e.url)),notUpdatedURLs:n}}async activate(){const e=await self.caches.open(this._cacheName),t=await e.keys(),s=new Set(this._urlsToCacheKeys.values()),n=[];for(const a of t)s.has(a.url)||(await e.delete(a),n.push(a.url));return{deletedURLs:n}}async _addURLToCache({cacheKey:e,url:t,cacheMode:s,event:n,plugins:r,integrity:i}){const c=new Request(t,{integrity:i,cache:s,credentials:"same-origin"});let o,h=await v({event:n,plugins:r,request:c});for(const a of r||[])"cacheWillUpdate"in a&&(o=a);if(!(o?await o.cacheWillUpdate({event:n,request:c,response:h}):h.status<400))throw new a("bad-precaching-response",{url:t,status:h.status});h.redirected&&(h=await x(h)),await f({event:n,plugins:r,response:h,request:e===t?c:new Request(e),cacheName:this._cacheName,matchOptions:{ignoreSearch:!0}})}getURLsToCacheKeys(){return this._urlsToCacheKeys}getCachedURLs(){return[...this._urlsToCacheKeys.keys()]}getCacheKeyForURL(e){const t=new URL(e,location.href);return this._urlsToCacheKeys.get(t.href)}async matchPrecache(e){const t=e instanceof Request?e.url:e,s=this.getCacheKeyForURL(t);if(s){return(await self.caches.open(this._cacheName)).match(s)}}createHandler(e=!0){return async({request:t})=>{try{const e=await this.matchPrecache(t);if(e)return e;throw new a("missing-precache-entry",{cacheName:this._cacheName,url:t instanceof Request?t.url:t})}catch(s){if(e)return fetch(t);throw s}}}createHandlerBoundToURL(e,t=!0){if(!this.getCacheKeyForURL(e))throw new a("non-precached-url",{url:e});const s=this.createHandler(t),n=new Request(e);return()=>s({request:n})}}let C;const K=()=>(C||(C=new O),C);const S=(e,t)=>{const s=K().getURLsToCacheKeys();for(const n of function*(e,{ignoreURLParametersMatching:t,directoryIndex:s,cleanURLs:n,urlManipulation:a}={}){const r=new URL(e,location.href);r.hash="",yield r.href;const i=function(e,t=[]){for(const s of[...e.searchParams.keys()])t.some((e=>e.test(s)))&&e.searchParams.delete(s);return e}(r,t);if(yield i.href,s&&i.pathname.endsWith("/")){const e=new URL(i.href);e.pathname+=s,yield e.href}if(n){const e=new URL(i.href);e.pathname+=".html",yield e.href}if(a){const e=a({url:r});for(const t of e)yield t.href}}(e,t)){const e=s.get(n);if(e)return e}};let M=!1;function A(e){M||((({ignoreURLParametersMatching:e=[/^utm_/],directoryIndex:t="index.html",cleanURLs:s=!0,urlManipulation:n}={})=>{const a=o();self.addEventListener("fetch",(r=>{const i=S(r.request.url,{cleanURLs:s,directoryIndex:t,ignoreURLParametersMatching:e,urlManipulation:n});if(!i)return;let c=self.caches.open(a).then((e=>e.match(i))).then((e=>e||fetch(i)));r.respondWith(c)}))})(e),M=!0)}const k=e=>{const t=K(),s=E.get();e.waitUntil(t.install({event:e,plugins:s}).catch((e=>{throw e})))},W=e=>{const t=K();e.waitUntil(t.activate())};function P(e,t){!function(e){K().addToCacheList(e),e.length>0&&(self.addEventListener("install",k),self.addEventListener("activate",W))}(e),A(t)}s(2);const D=e=>e&&"object"===typeof e?e:{handle:e};class I{constructor(e,t,s="GET"){this.handler=D(t),this.match=e,this.method=s}}class j extends I{constructor(e,t,s){super((({url:t})=>{const s=e.exec(t.href);if(s&&(t.origin===location.origin||0===s.index))return s.slice(1)}),t,s)}}class F{constructor(){this._routes=new Map}get routes(){return this._routes}addFetchListener(){self.addEventListener("fetch",(e=>{const{request:t}=e,s=this.handleRequest({request:t,event:e});s&&e.respondWith(s)}))}addCacheListener(){self.addEventListener("message",(e=>{if(e.data&&"CACHE_URLS"===e.data.type){const{payload:t}=e.data;0;const s=Promise.all(t.urlsToCache.map((e=>{"string"===typeof e&&(e=[e]);const t=new Request(...e);return this.handleRequest({request:t})})));e.waitUntil(s),e.ports&&e.ports[0]&&s.then((()=>e.ports[0].postMessage(!0)))}}))}handleRequest({request:e,event:t}){const s=new URL(e.url,location.href);if(!s.protocol.startsWith("http"))return void 0;const{params:n,route:a}=this.findMatchingRoute({url:s,request:e,event:t});let r=a&&a.handler;if(!r&&this._defaultHandler&&(r=this._defaultHandler),!r)return void 0;let i;try{i=r.handle({url:s,request:e,event:t,params:n})}catch(c){i=Promise.reject(c)}return i instanceof Promise&&this._catchHandler&&(i=i.catch((n=>this._catchHandler.handle({url:s,request:e,event:t})))),i}findMatchingRoute({url:e,request:t,event:s}){const n=this._routes.get(t.method)||[];for(const a of n){let n;const r=a.match({url:e,request:t,event:s});if(r)return n=r,(Array.isArray(r)&&0===r.length||r.constructor===Object&&0===Object.keys(r).length||"boolean"===typeof r)&&(n=void 0),{route:a,params:n}}return{}}setDefaultHandler(e){this._defaultHandler=D(e)}setCatchHandler(e){this._catchHandler=D(e)}registerRoute(e){this._routes.has(e.method)||this._routes.set(e.method,[]),this._routes.get(e.method).push(e)}unregisterRoute(e){if(!this._routes.has(e.method))throw new a("unregister-route-but-not-found-with-method",{method:e.method});const t=this._routes.get(e.method).indexOf(e);if(!(t>-1))throw new a("unregister-route-route-not-registered");this._routes.get(e.method).splice(t,1)}}let H;const B=()=>(H||(H=new F,H.addFetchListener(),H.addCacheListener()),H);function G(e,t,s){let n;if("string"===typeof e){const a=new URL(e,location.href);0;n=new I((({url:e})=>e.href===a.href),t,s)}else if(e instanceof RegExp)n=new j(e,t,s);else if("function"===typeof e)n=new I(e,t,s);else{if(!(e instanceof I))throw new a("unsupported-route-type",{moduleName:"workbox-routing",funcName:"registerRoute",paramName:"capture"});n=e}return B().registerRoute(n),n}s(3);class V{constructor(e={}){this._cacheName=h(e.cacheName),this._plugins=e.plugins||[],this._fetchOptions=e.fetchOptions,this._matchOptions=e.matchOptions}async handle({event:e,request:t}){"string"===typeof t&&(t=new Request(t));let s,n=await g({cacheName:this._cacheName,request:t,event:e,matchOptions:this._matchOptions,plugins:this._plugins});if(n)0;else{0;try{n=await this._getFromNetwork(t,e)}catch(r){s=r}0}if(!n)throw new a("no-response",{url:t.url,error:s});return n}async _getFromNetwork(e,t){const s=await v({request:e,event:t,fetchOptions:this._fetchOptions,plugins:this._plugins}),n=s.clone(),a=f({cacheName:this._cacheName,request:e,response:n,event:t,plugins:this._plugins});if(t)try{t.waitUntil(a)}catch(r){0}return s}}const Q={cacheWillUpdate:async({response:e})=>200===e.status||0===e.status?e:null};s(5);class J{constructor(e={}){this._statuses=e.statuses,this._headers=e.headers}isResponseCacheable(e){let t=!0;return this._statuses&&(t=this._statuses.includes(e.status)),this._headers&&t&&(t=Object.keys(this._headers).some((t=>e.headers.get(t)===this._headers[t]))),t}}class ${constructor(e){this.cacheWillUpdate=async({response:e})=>this._cacheableResponse.isResponseCacheable(e)?e:null,this._cacheableResponse=new J(e)}}self.addEventListener("activate",(()=>self.clients.claim())),P([{'revision':'acf8da86e8288478ae2340c538b326bd','url':'/fontanelle/index.html'},{'revision':null,'url':'/fontanelle/static/css/main.4ddc127c.chunk.css'},{'revision':null,'url':'/fontanelle/static/js/2.d6f96d65.chunk.js'},{'revision':null,'url':'/fontanelle/static/js/main.4a10b5bd.chunk.js'},{'revision':null,'url':'/fontanelle/static/js/runtime-main.1047cc81.js'}]),P([{url:"/fontanelle/manifest.json",revision:"1"}]);var z,X=new RegExp("/[^/?]+\\.[^/]+$");G((function(e){var t=e.request,s=e.url;return"navigate"===t.mode&&(!s.pathname.startsWith("/_")&&!s.pathname.match(X))}),(z="/fontanelle/index.html",K().createHandlerBoundToURL(z))),G((function(e){var t=e.url;return t.origin===self.location.origin&&t.pathname.endsWith(".png")}),new class{constructor(e={}){if(this._cacheName=h(e.cacheName),this._plugins=e.plugins||[],e.plugins){const t=e.plugins.some((e=>!!e.cacheWillUpdate));this._plugins=t?e.plugins:[Q,...e.plugins]}else this._plugins=[Q];this._fetchOptions=e.fetchOptions,this._matchOptions=e.matchOptions}async handle({event:e,request:t}){"string"===typeof t&&(t=new Request(t));const s=this._getFromNetwork({request:t,event:e});let n,r=await g({cacheName:this._cacheName,request:t,event:e,matchOptions:this._matchOptions,plugins:this._plugins});if(r){if(e)try{e.waitUntil(s)}catch(n){0}}else{0;try{r=await s}catch(i){n=i}}if(!r)throw new a("no-response",{url:t.url,error:n});return r}async _getFromNetwork({request:e,event:t}){const s=await v({request:e,event:t,fetchOptions:this._fetchOptions,plugins:this._plugins}),n=f({cacheName:this._cacheName,request:e,response:s.clone(),event:t,plugins:this._plugins});if(t)try{t.waitUntil(n)}catch(a){0}return s}}({cacheName:"images",plugins:[new N({maxEntries:50})]})),self.addEventListener("message",(function(e){e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()})),G((function(e){return"https://overpass-api.de"===e.url.origin}),new V({cacheName:"overpass-api",plugins:[new N({maxAgeSeconds:604800}),new $({statuses:[0,200]})]}),"GET"),G((function(e){return"overpass.kumi.systems"===e.url.origin}),new V({cacheName:"overpass-api-kumi",plugins:[new N({maxAgeSeconds:604800}),new $({statuses:[0,200]})]}),"GET"),G((function(e){var t=e.url;return"https://api.mapbox.com"===t.origin&&!t.pathname.includes("vector.pbf")}),new V({cacheName:"mapbox-generic",plugins:[new N({maxAgeSeconds:604800}),new $({statuses:[0,200]})],matchOptions:{ignoreSearch:!0,ignoreVary:!0}}),"GET"),G((function(e){var t=e.url;return"https://api.mapbox.com"===t.origin&&t.pathname.includes("vector.pbf")}),new V({cacheName:"mapbox-tiles",plugins:[new N({maxAgeSeconds:604800}),new $({statuses:[0,200]})],matchOptions:{ignoreSearch:!0,ignoreVary:!0}}),"GET")}]);
//# sourceMappingURL=service-worker.js.map