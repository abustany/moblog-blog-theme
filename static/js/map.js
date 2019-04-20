/* jshint browser:true, strict:true */
/* global mapboxgl */

function bindEvent(obj, event, func) {
	"use strict";

	if (obj.addEventListener) {
		obj.addEventListener(event, func);
	} else if (obj.attachEvent) {
		obj.attachEvent('on' + event, func);
	} else {
		throw new Error('No method found to attach event to object');
	}
}

function debounce(func, delay) {
  var timeoutId;

  return function() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(func, delay);
  };
}

bindEvent(window, 'load', init);

function init() {
	"use strict";

	initLazyLoading();
	initLightbox();
    initServiceWorker();
	var markers = fetchMarkers();
  var currentArticle = computeCurrentArticle();
	var map = initMap(markers, currentArticle);

  adjustMapTop(map);
  initScrollListener(markers, map);

  fullsizeMediaQuery.addListener(function() {
    adjustMapTop(map);
  });
}

function initScrollListener(markers, map) {
  var showCurrentArticleMarkerDebounced = debounce(function() {
    var currentArticle = computeCurrentArticle();

    if (currentArticle) {
      var marker = getArticleMarker(markers, currentArticle);

      if (marker) {
        map.panTo(marker.getLngLat(), {animate: true});
      }
    }
  }, 300);

	bindEvent(window, 'scroll', function() {
    adjustMapTop(map);
    showCurrentArticleMarkerDebounced();
	});
}

function initLazyLoading() {
	"use strict";

	echo.init({
    offset: 2000,
		callback: function(el, op) {
			if (op === 'load') {
				el.className='image-loaded';
			}
		},
	});
}

function initLightbox() {
	"use strict";

	baguetteBox.run('article.post');
}

function isServiceWorkerSupported() {
    return 'serviceWorker' in navigator;
}

function initServiceWorker() {
    "use strict";

    if (!isServiceWorkerSupported()) {
        return;
    }

    navigator.serviceWorker.register('/serviceWorker.js')
        .then(function(reg) {
            console.log('Successfully registered service worker');
        })
        .catch(function(err) {
            console.log('Error while registering service worker', err);
        });

    initSubscriptionUi();
}

function initSubscriptionUi() {
    navigator.serviceWorker.ready
        .then(function(registration) {
            return registration.pushManager.getSubscription()
                .then(function(sub) {
                    document.getElementById('link-subscribe').style.display = (!!sub ? 'none' : 'block');
                    document.getElementById('link-unsubscribe').style.display = (!!sub ? 'block' : 'none');
                    pushSubscription = sub;
                });
        })
        .catch(function(err) {
            console.log('Error while checking push subscription', err);
        });
}

// This function is needed because Chrome doesn't accept a base64 encoded string
// as value for applicationServerKey in pushManager.subscribe yet
// https://bugs.chromium.org/p/chromium/issues/detail?id=802280
function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);

    for (var i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

function onSubscribe() {
    if (!isServiceWorkerSupported()) {
        alert('Your browser does not support push notifications :-(');
        return;
    }

    navigator.serviceWorker.ready
        .then(function(registration) {
            return registration.pushManager.getSubscription()
                .then(function(sub) {
                    if (sub) {
                        console.log('A push subscription already exists');
                        return sub;
                    }

                    return fetch('/notifications/vapidPublicKey')
                        .then(function(res) {
                            if (res.status !== 200) {
                                throw new Error('Unexpected HTTP status while fetching public VAPID key: ' + res.status);
                            }

                            return res.text();
                        })
                        .then(function(publicKey) {
                            console.log('Registering a new push subscription');
                            return registration.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey: urlBase64ToUint8Array(publicKey),
                            });
                        });
                })
                .then(function(sub) {
                    return fetch('/notifications/register', {
                        method: 'post',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(sub)
                    }).then(function(res) {
                        if (res.status !== 201) {
                            throw new Error('Unexpected HTTP status while registering subscription: ' + res.status);
                        }
                    });
                });
        })
        .then(function() {
            console.log('Sucessfully registered push notifications');
            initSubscriptionUi();
        })
        .catch(function(err) {
            console.log('Error while subscribing to notifications', err);
        });
}

var pushSubscription = null;

function onUnsubscribe() {
    if (!pushSubscription) {
        return;
    }

    pushSubscription.unsubscribe()
        .then(function(ok) {
            if (!ok) {
                throw new Error('unsubscribe returned false');
            }

            console.log('Unsubscribed from push notifications');
            initSubscriptionUi();
        })
        .then(function() {
            return fetch('/notifications/unregister', {
                method: 'post',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(pushSubscription)
            }).then(function(res) {
                if (res.status !== 200) {
                    throw new Error('Unexpected HTTP status while registering subscription: ' + res.status);
                }
            });
        })
        .catch(function(err) {
            console.log('Error while unsubscribing', err);
        });
}

function forAllArticles(callback) {
	"use strict";

	var articles = document.querySelectorAll('article.post');

	for (var i = 0; i < articles.length; ++i) {
		if (!callback(i, articles[i], articles.length))
			return;
	}
}

function initMap(markers, currentArticle) {
	"use strict";

	mapboxgl.accessToken = 'pk.eyJ1IjoiYWJ1c3RhbnkiLCJhIjoiXzRMaXJZTSJ9.O90zsWmkzkJuUhbg6ASDKg';
	var map = new mapboxgl.Map({
		container: 'map',
		style: 'mapbox://styles/mapbox/streets-v9',
		zoom: 8,
	});

	map.addControl(new mapboxgl.NavigationControl());

	for (var idx in markers) {
		markers[idx].addTo(map);
	}

  document.getElementById('map-toggle').addEventListener('click', function() {
    document.getElementById('map').classList.toggle('map-hidden');
  });

  // Pan the map to the current article, if any

  var currentMarker = currentArticle && getArticleMarker(markers, currentArticle);

  if (!currentMarker && currentArticle) {
    // The article had no position, find the first article below the current
    // one with a position

    var currentArticleTop = currentArticle.getBoundingClientRect().top;

    forAllArticles(function (idx, article, nArticles) {
      var bb = article.getBoundingClientRect();

      if (bb.top <= currentArticleTop) {
        // Above the current article, skip it
        return true;
      }

      currentMarker = getArticleMarker(markers, article);

      if (currentMarker) {
        // We found a position, stop iterating
        return false;
      }

      // Keep iterating
      return true;
    });
  }

  if (!currentMarker) {
    // Either there was no current article, or we found no article with a
    // position below the current one. Scan all articles from the beginning for
    // one with a position.
    forAllArticles(function (idx, article, nArticles) {
      currentMarker = getArticleMarker(markers, article);

      if (currentMarker) {
        // We found a position, stop iterating
        return false;
      }

      // Keep iterating
      return true;
    });
  }

  if (currentMarker) {
    map.panTo(currentMarker.getLngLat(), {animate: false});
  }

	return map;
}

function createMarker(idx) {
	var el = document.createElement('div');
	el.className = 'map-marker';
	el.appendChild(document.createTextNode(idx));

	el.onclick = function() {
		document.location.hash = '#post-' + idx;
	};

	return new mapboxgl.Marker(el, {});
}

// Returns a hash of (article DOM element, leaflet marker)
function fetchMarkers() {
	"use strict";

	var markers = {};

	forAllArticles(function(i, article, nArticles) {
		var pos = article.getAttribute('data-position');
		var idx = article.getAttribute('data-index');

		if (!pos)
			return true;

		var tokens = pos.split(/\s*,\s*/);

	    if (tokens.length !== 2) {
			throw new Error('Invalid marker string: ' + markerString);
		}

		var lat = Number(tokens[0]);
		var lon = Number(tokens[1]);

		if (isNaN(lat) || isNaN(lon)) {
			throw new Error('Invalid coordinates: ' + markerString);
		}

		var el = document.createElement('div');
		el.className = 'map-marker';
		el.appendChild(document.createTextNode(idx));

		markers[idx] = createMarker(idx).setLngLat([lon, lat]);

		return true;
	});

	return markers;
}

function getStyle(el) {
	"use strict";

	// IE
	if (el.currentStyle) {
		return el.currentStyle;
	}

	return getComputedStyle(el);
}

function getWindowHeight() {
	"use strict";

	if ('innerHeight' in window)
		return window.innerHeight;

	// IE
	return document.documentElement.offsetHeight;
}

var fullsizeMediaQuery = window.matchMedia('(min-device-width: 500px)');

function adjustMapTop(map) {
	"use strict";

  var mapDiv = document.getElementById('map');
  var mapTop;

  if (fullsizeMediaQuery.matches) {
    var title = document.getElementById('page-title');
    var rect = title.getBoundingClientRect();
    var bottomMargin = parseInt(getStyle(title).marginBottom);
    var mapTop = rect.bottom + bottomMargin;

    if (mapTop < 0)
      mapTop = 0;
  } else {
    mapTop = 0;
  }

	mapDiv.style.top = mapTop + 'px';
	map.resize();
}

function getArticleMarker(markers, article) {
	var idx = article.getAttribute('data-index');

  if (!idx) {
    return null;
  }

  return markers[idx] || null;
}

// Returns the DOM node of the article on screen
function computeCurrentArticle() {
  "use strict";

  // Articles with the top of their bounding box above this limit are
  // considered to be the current ones.
	var scrollLimit = getWindowHeight()*2/3;
  var current = null;

	forAllArticles(function (idx, article, nArticles) {
		var bb = article.getBoundingClientRect();

    if (bb.top > scrollLimit) {
      // This article (and all the following ones) are below the scroll limit,
      // we can stop iterating.
      return false;
    }

    if (bb.top >= 0) {
      // First article with its title on screen and above the scroll limit, pick
      // it.
      current = article;
      return false;
    }

    // The article is above the screen, pick it if parts of its contents are
    // visible and continue iterating for a potential better candidate.
    if (bb.bottom >= 0) {
      // Some part of the article is visible
      current = article;
    }

    return true;
  });

  return current;
}
